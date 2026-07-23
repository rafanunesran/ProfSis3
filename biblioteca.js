// biblioteca.js - "Biblioteca de Apoio" (Materiais de Referência compartilhados)
//
// Página presente em TODOS os perfis (professor, gestor, AEE, projeto). Qualquer professor
// logado posta materiais de referência (arquivos ou links) que ficam compartilhados entre
// todos e alimentam automaticamente os documentos do Estagiário (IA).
//
// - Arquivos vão para o Firebase Storage (coleção de metadados: `materiais_apoio` no Firestore).
// - De PDF/Word(.docx)/Excel(.xlsx) extraímos o texto no navegador (pdf.js / mammoth / SheetJS)
//   e guardamos junto, pra IA usar o conteúdo. PPT/imagens/links entram pela IA só via metadados
//   (título, descrição, tags, disciplina, série) — ver ia_estagiario.js (Tier 3).
// - Dois modos de postar: ⚡ Rápido (sobe o arquivo e a IA classifica título/descrição/tags,
//   com prévia editável) e ✍️ Detalhado (o professor preenche tudo, e aceita link).
// - Modelo aberto: qualquer um posta e todos usam; autor e super admin podem excluir.

const BIBLIOTECA_MAX_FILE_MB = 20;
const BIBLIOTECA_MAX_TEXTO_EXTRAIDO = 40000; // teto de caracteres guardados (limite de 1MB por doc do Firestore)
const BIBLIOTECA_SERIES = [
    '1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano',
    '6º Ano', '7º Ano', '8º Ano', '9º Ano',
    '1ª Série EM', '2ª Série EM', '3ª Série EM'
];
const BIBLIOTECA_DISCIPLINAS = [
    'Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia',
    'Arte', 'Educação Física', 'Inglês', 'Física', 'Química', 'Biologia',
    'Filosofia', 'Sociologia', 'Projeto de Vida', 'Ensino Religioso', 'AEE'
];

let bibliotecaCacheMateriais = null;   // cache simples da última busca de materiais
let bibliotecaDisciplinas = [];        // lista gerenciável de disciplinas (defaults + criadas)
let bibliotecaArquivoPendente = null;  // File aguardando publicação (vindo do modo rápido)
let bibliotecaTextoPendente = null;    // texto já extraído do arquivo pendente (evita reextrair)

// ---------------------------------------------------------------------------
// Carregamento sob demanda de bibliotecas de extração (só quando precisa)
// ---------------------------------------------------------------------------
function carregarScriptBiblioteca(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Falha ao carregar ' + src));
        document.head.appendChild(s);
    });
}

// Extrai texto de PDF/.docx/.xlsx. Retorna '' para formatos sem extração (PPT, imagem) — o material
// ainda entra na IA pelos metadados. Nunca lança: se a extração falhar, segue sem o texto.
async function extrairTextoArquivoBiblioteca(file) {
    const nome = (file.name || '').toLowerCase();
    try {
        if (nome.endsWith('.pdf')) {
            if (typeof pdfjsLib === 'undefined') {
                await carregarScriptBiblioteca('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            const buffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
            let texto = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                texto += content.items.map(it => it.str).join(' ') + '\n';
                if (texto.length > BIBLIOTECA_MAX_TEXTO_EXTRAIDO) break;
            }
            return texto;
        }

        if (nome.endsWith('.docx')) {
            if (typeof mammoth === 'undefined') return '';
            const arrayBuffer = await file.arrayBuffer();
            const { value } = await mammoth.extractRawText({ arrayBuffer });
            return value || '';
        }

        if (nome.endsWith('.xlsx') || nome.endsWith('.xls') || nome.endsWith('.csv')) {
            if (typeof XLSX === 'undefined') {
                await carregarScriptBiblioteca('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            }
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
            let texto = '';
            wb.SheetNames.forEach(nomeAba => {
                texto += nomeAba + '\n' + XLSX.utils.sheet_to_csv(wb.Sheets[nomeAba]) + '\n';
            });
            return texto;
        }
    } catch (e) {
        console.warn('[Biblioteca] Não consegui extrair texto de', file.name, e);
    }
    return ''; // PPT, imagens e outros: sem extração de texto
}

// ---------------------------------------------------------------------------
// Lista de disciplinas gerenciável (persistida em system/biblioteca_config)
// ---------------------------------------------------------------------------
async function carregarDisciplinasBiblioteca() {
    let saved = [];
    try {
        const c = await getData('system', 'biblioteca_config');
        if (c && Array.isArray(c.disciplinas)) saved = c.disciplinas;
    } catch (e) { console.warn('[Biblioteca] Erro ao carregar disciplinas:', e); }
    bibliotecaDisciplinas = Array.from(new Set([...BIBLIOTECA_DISCIPLINAS, ...saved]))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt'));
    return bibliotecaDisciplinas;
}

async function adicionarDisciplinaBiblioteca(nome) {
    nome = (nome || '').trim();
    if (!nome) return false;
    if (!bibliotecaDisciplinas.some(d => d.toLowerCase() === nome.toLowerCase())) {
        bibliotecaDisciplinas.push(nome);
        bibliotecaDisciplinas.sort((a, b) => a.localeCompare(b, 'pt'));
        try { await saveData('system', 'biblioteca_config', { disciplinas: bibliotecaDisciplinas }); }
        catch (e) { console.warn('[Biblioteca] Erro ao salvar disciplina:', e); }
    }
    return true;
}

function bibOpcoesDisciplina(selecionada) {
    const esc = (s) => (s || '').replace(/"/g, '&quot;');
    let html = `<option value="">Geral (sem disciplina)</option>`;
    html += bibliotecaDisciplinas.map(d =>
        `<option value="${esc(d)}" ${d === selecionada ? 'selected' : ''}>${d}</option>`
    ).join('');
    return html;
}

// Re-popula todos os selects de disciplina (classe bib-disc-select) preservando a seleção atual.
function bibAtualizarSelectsDisciplina() {
    document.querySelectorAll('.bib-disc-select').forEach(sel => {
        const atual = sel.value;
        sel.innerHTML = bibOpcoesDisciplina(atual);
        sel.value = atual;
    });
}

// Botão "➕ nova": pergunta o nome, salva na lista global e seleciona no campo alvo.
async function bibNovaDisciplina(targetSelectId) {
    const nome = prompt('Nome da nova disciplina:');
    if (!nome || !nome.trim()) return;
    await adicionarDisciplinaBiblioteca(nome.trim());
    bibAtualizarSelectsDisciplina();
    const alvo = document.getElementById(targetSelectId);
    if (alvo) alvo.value = nome.trim();
}

// ---------------------------------------------------------------------------
// Renderização da página
// ---------------------------------------------------------------------------
function garantirTelaBiblioteca() {
    if (document.getElementById('biblioteca')) return;
    const container = document.getElementById('appContainer');
    const innerContainer = (container && container.querySelector('.container')) || container || document.body;
    const tela = document.createElement('div');
    tela.id = 'biblioteca';
    tela.className = 'screen';
    innerContainer.appendChild(tela);
}

async function renderBiblioteca() {
    garantirTelaBiblioteca();
    const tela = document.getElementById('biblioteca');
    if (!tela) return;

    // A tela é criada sob demanda, então o showScreen que disparou este render pode ter rodado
    // antes dela existir (não conseguindo marcá-la como ativa). Garante a exibição aqui.
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    tela.classList.add('active');
    tela.style.display = '';

    await carregarDisciplinasBiblioteca();
    bibliotecaArquivoPendente = null;
    bibliotecaTextoPendente = null;

    const optSeries = BIBLIOTECA_SERIES.map(s => `<option value="${s}">${s}</option>`).join('');
    const optDisc = bibOpcoesDisciplina('');

    tela.innerHTML = `
        <div class="card" style="margin:20px 0;">
            <h2>📚 Biblioteca de Apoio</h2>
            <p style="color:#666; font-size:14px; margin-bottom:15px;">
                Materiais de referência compartilhados entre todos os professores. O que você postar aqui
                pode ser usado automaticamente pelo <strong>Estagiário (IA)</strong> na construção dos documentos.
            </p>

            <div style="display:flex; gap:8px; margin-bottom:14px;">
                <button type="button" id="bibTabRapido" class="btn btn-primary btn-sm" onclick="bibSetModo('rapido')">⚡ Rápido (a IA classifica)</button>
                <button type="button" id="bibTabDetalhado" class="btn btn-secondary btn-sm" onclick="bibSetModo('detalhado')">✍️ Detalhado</button>
            </div>

            <!-- MODO RÁPIDO -->
            <div id="bibModoRapido">
                <p style="font-size:13px; color:#555; margin-bottom:10px;">Escolha a disciplina e a série, suba o documento, e a IA gera título, descrição e tags. Você confere antes de publicar.</p>
                <form onsubmit="bibliotecaEnviarRapido(event)">
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <label style="flex:1; min-width:170px;">Disciplina:
                            <div style="display:flex; gap:6px;">
                                <select id="bibRapidoDisciplina" class="bib-disc-select" style="flex:1; padding:8px;">${optDisc}</select>
                                <button type="button" class="btn btn-secondary btn-sm" title="Nova disciplina" onclick="bibNovaDisciplina('bibRapidoDisciplina')">➕</button>
                            </div>
                        </label>
                        <label style="flex:1; min-width:170px;">Série/Ano:
                            <select id="bibRapidoSerie" style="width:100%; padding:8px;">
                                <option value="">Geral (todas as séries)</option>${optSeries}
                            </select>
                        </label>
                    </div>
                    <label style="display:block; margin-top:10px;">Documento (PDF, Word, Excel, PPT, imagem):
                        <input type="file" id="bibRapidoArquivo" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" style="width:100%; padding:6px; margin-top:4px;">
                    </label>
                    <div id="bibProgressoRapido" style="font-size:13px; color:#2c5282; margin:8px 0;"></div>
                    <button type="submit" class="btn btn-primary" id="bibBtnRapido">✨ Classificar e revisar</button>
                </form>
            </div>

            <!-- MODO DETALHADO (também usado como PRÉVIA do modo rápido) -->
            <div id="bibModoDetalhado" style="display:none;">
                <div id="bibBannerClassificacao" style="display:none; background:#ebf8ff; border:1px solid #bee3f8; color:#2c5282; padding:8px 10px; border-radius:6px; font-size:13px; margin-bottom:10px;">
                    ✨ Classificado automaticamente pela IA — confira/ajuste os campos e publique.
                </div>
                <form onsubmit="bibliotecaPublicarDetalhado(event)">
                    <label>Título: <span style="color:#e53e3e;">*</span>
                        <input type="text" id="bibTitulo" required style="width:100%; padding:8px; margin-bottom:10px;" placeholder="Ex: Sequência didática - Frações (6º ano)">
                    </label>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <label style="flex:1; min-width:170px;">Disciplina:
                            <div style="display:flex; gap:6px;">
                                <select id="bibDisciplina" class="bib-disc-select" style="flex:1; padding:8px;">${optDisc}</select>
                                <button type="button" class="btn btn-secondary btn-sm" title="Nova disciplina" onclick="bibNovaDisciplina('bibDisciplina')">➕</button>
                            </div>
                        </label>
                        <label style="flex:1; min-width:170px;">Série/Ano:
                            <select id="bibSerie" style="width:100%; padding:8px;">
                                <option value="">Geral (todas as séries)</option>${optSeries}
                            </select>
                        </label>
                    </div>
                    <label style="display:block; margin-top:10px;">Tags / palavras-chave (separadas por vírgula):
                        <input type="text" id="bibTags" style="width:100%; padding:8px; margin-bottom:10px;" placeholder="Ex: frações, operações, jogos">
                    </label>
                    <label>Descrição (o que é e como usar — ajuda a IA e os colegas):
                        <textarea id="bibDescricao" rows="2" style="width:100%; padding:8px; margin-bottom:10px;"></textarea>
                    </label>
                    <div id="bibArquivoPendenteInfo" style="display:none; font-size:13px; background:#f0fff4; border:1px solid #c6f6d5; padding:8px; border-radius:6px; margin-bottom:10px;"></div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
                        <label style="flex:1; min-width:200px;">Arquivo (PDF, Word, Excel, PPT, imagem):
                            <input type="file" id="bibArquivo" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" style="width:100%; padding:6px; margin-bottom:10px;">
                        </label>
                        <label style="flex:1; min-width:200px;">…ou um Link (URL):
                            <input type="url" id="bibLink" style="width:100%; padding:8px; margin-bottom:10px;" placeholder="https://...">
                        </label>
                    </div>
                    <div id="bibProgresso" style="font-size:13px; color:#2c5282; margin-bottom:8px;"></div>
                    <button type="submit" class="btn btn-primary" id="bibBtnEnviar">📤 Publicar material</button>
                </form>
            </div>
        </div>

        <div class="card" style="margin:20px 0;">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
                <input type="text" id="bibBusca" placeholder="🔎 Buscar por título, tags, autor..." style="flex:2; min-width:180px; padding:8px;" oninput="renderListaBiblioteca()">
                <select id="bibFiltroDisc" class="bib-disc-select" style="flex:1; min-width:130px; padding:8px;" onchange="renderListaBiblioteca()">
                    <option value="">Todas disciplinas</option>${bibliotecaDisciplinas.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
                <select id="bibFiltroSerie" style="flex:1; min-width:130px; padding:8px;" onchange="renderListaBiblioteca()">
                    <option value="">Todas séries</option>${optSeries}
                </select>
                <button class="btn btn-secondary btn-sm" onclick="recarregarBiblioteca()">🔄 Atualizar</button>
            </div>
            <div id="bibListaMateriais"><p class="empty-state">Carregando materiais...</p></div>
        </div>`;

    bibSetModo('rapido');
    await recarregarBiblioteca();
}

function bibSetModo(modo) {
    const rapido = document.getElementById('bibModoRapido');
    const detalhado = document.getElementById('bibModoDetalhado');
    const tabR = document.getElementById('bibTabRapido');
    const tabD = document.getElementById('bibTabDetalhado');
    if (!rapido || !detalhado) return;
    const ehRapido = modo === 'rapido';
    rapido.style.display = ehRapido ? '' : 'none';
    detalhado.style.display = ehRapido ? 'none' : '';
    if (tabR) tabR.className = 'btn btn-sm ' + (ehRapido ? 'btn-primary' : 'btn-secondary');
    if (tabD) tabD.className = 'btn btn-sm ' + (ehRapido ? 'btn-secondary' : 'btn-primary');
    // Ao voltar manualmente pro modo rápido, o banner de "classificado" não faz sentido.
    if (ehRapido) { const b = document.getElementById('bibBannerClassificacao'); if (b) b.style.display = 'none'; }
}

async function recarregarBiblioteca() {
    bibliotecaCacheMateriais = null;
    const lista = document.getElementById('bibListaMateriais');
    if (lista) lista.innerHTML = '<p class="empty-state">Carregando materiais...</p>';
    try {
        if (typeof db === 'undefined' || !db) {
            if (lista) lista.innerHTML = '<p class="empty-state">Banco de dados indisponível.</p>';
            return;
        }
        const snap = await db.collection('materiais_apoio').orderBy('createdAt', 'desc').limit(300).get();
        bibliotecaCacheMateriais = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('[Biblioteca] Erro ao buscar materiais:', e);
        bibliotecaCacheMateriais = [];
    }
    renderListaBiblioteca();
}

function bibIconePorMaterial(m) {
    if (m.tipo === 'link') return '🔗';
    const ext = (m.fileExt || '').toLowerCase();
    if (ext === 'pdf') return '📄';
    if (ext === 'docx' || ext === 'doc') return '📝';
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return '📊';
    if (ext === 'pptx' || ext === 'ppt') return '📽️';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
    return '📎';
}

function renderListaBiblioteca() {
    const container = document.getElementById('bibListaMateriais');
    if (!container) return;
    const materiais = bibliotecaCacheMateriais || [];

    const busca = (document.getElementById('bibBusca')?.value || '').trim().toLowerCase();
    const fDisc = document.getElementById('bibFiltroDisc')?.value || '';
    const fSerie = document.getElementById('bibFiltroSerie')?.value || '';

    const filtrados = materiais.filter(m => {
        if (fDisc && (m.disciplina || '') !== fDisc) return false;
        if (fSerie && (m.serie || '') !== fSerie) return false;
        if (busca) {
            const alvo = `${m.titulo || ''} ${m.descricao || ''} ${(m.tags || []).join(' ')} ${m.autorNome || ''}`.toLowerCase();
            if (!alvo.includes(busca)) return false;
        }
        return true;
    });

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum material encontrado. Seja o primeiro a postar! 📚</p>';
        return;
    }

    const podeExcluir = (m) => currentUser && (
        (m.autorUid && currentUser.uid && m.autorUid === currentUser.uid) ||
        (m.autorId && String(m.autorId) === String(currentUser.id)) ||
        currentUser.role === 'super_admin'
    );

    container.innerHTML = filtrados.map(m => {
        const tags = (m.tags || []).map(t => `<span class="badge badge-info" style="font-size:10px;">${t}</span>`).join(' ');
        const alvo = m.tipo === 'link' ? m.url : m.downloadURL;
        const data = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleDateString('pt-BR')
                    : (m.createdAtMs ? new Date(m.createdAtMs).toLocaleDateString('pt-BR') : '');
        return `
        <div style="border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:10px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:15px;">${bibIconePorMaterial(m)} ${m.titulo || '(sem título)'}</div>
                    <div style="font-size:12px; color:#666; margin:4px 0;">
                        ${m.disciplina ? `<span class="badge badge-warning" style="font-size:10px;">${m.disciplina}</span> ` : ''}
                        ${m.serie ? `<span class="badge badge-success" style="font-size:10px;">${m.serie}</span> ` : ''}
                        ${tags}
                    </div>
                    ${m.descricao ? `<div style="font-size:13px; color:#444; margin:6px 0;">${m.descricao}</div>` : ''}
                    <div style="font-size:11px; color:#999;">Por ${m.autorNome || 'Professor'} ${data ? '• ' + data : ''}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                    ${alvo ? `<a href="${alvo}" target="_blank" rel="noopener" class="btn btn-info btn-sm">Abrir</a>` : ''}
                    ${podeExcluir(m) ? `<button class="btn btn-danger btn-sm" onclick="bibliotecaExcluirMaterial('${m.id}')">🗑️</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

// ---------------------------------------------------------------------------
// Modo RÁPIDO: sobe o arquivo, a IA classifica, abre a prévia editável
// ---------------------------------------------------------------------------
async function classificarMaterialComIA(texto, disciplina, serie, arquivoNome) {
    const fallback = { titulo: (arquivoNome || 'Material').replace(/\.[^.]+$/, ''), descricao: '', tags: [] };
    if (!texto || texto.trim().length < 30) return fallback;
    if (typeof chamarIAEstruturada !== 'function') return fallback;

    const trecho = texto.slice(0, 6000);
    const prompt = `Você cataloga materiais pedagógicos para uma biblioteca de professores.` +
        `${disciplina ? ` Disciplina: ${disciplina}.` : ''}${serie ? ` Série: ${serie}.` : ''}` +
        ` A partir do TRECHO do documento abaixo, gere metadados. Responda APENAS com um JSON válido, sem markdown, no formato exato:` +
        ` {"titulo": "título curto e descritivo, no máximo 80 caracteres", "descricao": "1 a 2 frases explicando o que é o material e como o professor pode usá-lo", "tags": ["3 a 6 palavras-chave em minúsculas"]}.\n\nTRECHO:\n${trecho}`;

    try {
        const r = await chamarIAEstruturada(prompt, null);
        return {
            titulo: (r && r.titulo ? String(r.titulo) : fallback.titulo).slice(0, 120),
            descricao: (r && r.descricao ? String(r.descricao) : ''),
            tags: (r && Array.isArray(r.tags)) ? r.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 8) : []
        };
    } catch (e) {
        console.warn('[Biblioteca] Classificação por IA falhou, usando nome do arquivo:', e);
        return fallback;
    }
}

function bibAtualizarInfoArquivoPendente() {
    const info = document.getElementById('bibArquivoPendenteInfo');
    if (!info) return;
    if (bibliotecaArquivoPendente) {
        info.style.display = 'block';
        info.innerHTML = `📎 Arquivo pronto para publicar: <strong>${bibliotecaArquivoPendente.name}</strong>
            <button type="button" class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="bibLimparArquivoPendente()">Trocar arquivo</button>`;
        const fileInput = document.getElementById('bibArquivo');
        if (fileInput) fileInput.parentElement.style.display = 'none';
    } else {
        info.style.display = 'none';
        info.innerHTML = '';
        const fileInput = document.getElementById('bibArquivo');
        if (fileInput) fileInput.parentElement.style.display = '';
    }
}

function bibLimparArquivoPendente() {
    bibliotecaArquivoPendente = null;
    bibliotecaTextoPendente = null;
    bibAtualizarInfoArquivoPendente();
}

async function bibliotecaEnviarRapido(e) {
    if (e) e.preventDefault();
    if (!currentUser) { alert('Você precisa estar logado.'); return; }

    const disciplina = document.getElementById('bibRapidoDisciplina').value.trim();
    const serie = document.getElementById('bibRapidoSerie').value;
    const arquivoInput = document.getElementById('bibRapidoArquivo');
    const arquivo = arquivoInput.files && arquivoInput.files[0];

    if (!arquivo) { alert('Selecione um documento para subir.'); return; }
    if (arquivo.size > BIBLIOTECA_MAX_FILE_MB * 1024 * 1024) {
        alert(`Arquivo muito grande (máx ${BIBLIOTECA_MAX_FILE_MB}MB).`); return;
    }

    const btn = document.getElementById('bibBtnRapido');
    const prog = document.getElementById('bibProgressoRapido');
    const setProg = (t) => { if (prog) prog.textContent = t; };
    if (btn) btn.disabled = true;

    try {
        setProg('Lendo o conteúdo do arquivo...');
        const texto = (await extrairTextoArquivoBiblioteca(arquivo)).slice(0, BIBLIOTECA_MAX_TEXTO_EXTRAIDO);

        setProg('Classificando com a IA...');
        const meta = await classificarMaterialComIA(texto, disciplina, serie, arquivo.name);

        // Guarda o arquivo e o texto já extraído para a etapa de publicação
        bibliotecaArquivoPendente = arquivo;
        bibliotecaTextoPendente = texto;

        // Preenche o formulário detalhado (que funciona como prévia editável)
        document.getElementById('bibTitulo').value = meta.titulo || '';
        document.getElementById('bibDescricao').value = meta.descricao || '';
        document.getElementById('bibTags').value = (meta.tags || []).join(', ');
        document.getElementById('bibDisciplina').value = disciplina;
        document.getElementById('bibSerie').value = serie;
        document.getElementById('bibLink').value = '';
        bibAtualizarInfoArquivoPendente();

        setProg('');
        arquivoInput.value = '';
        bibSetModo('detalhado');
        const banner = document.getElementById('bibBannerClassificacao');
        if (banner) banner.style.display = 'block';
        document.getElementById('bibTitulo').focus();
    } catch (err) {
        console.error('[Biblioteca] Erro no envio rápido:', err);
        setProg('');
        alert('Não foi possível processar o arquivo: ' + (err.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// Publicar (modo detalhado e também a prévia do modo rápido)
// ---------------------------------------------------------------------------
async function bibliotecaPublicarDetalhado(e) {
    if (e) e.preventDefault();
    if (!currentUser) { alert('Você precisa estar logado.'); return; }

    const titulo = document.getElementById('bibTitulo').value.trim();
    const disciplina = document.getElementById('bibDisciplina').value.trim();
    const serie = document.getElementById('bibSerie').value;
    const tags = document.getElementById('bibTags').value.split(',').map(t => t.trim()).filter(Boolean);
    const descricao = document.getElementById('bibDescricao').value.trim();
    const fileInput = document.getElementById('bibArquivo');
    const link = document.getElementById('bibLink').value.trim();

    // Se o usuário escolheu um arquivo novo no campo, ele tem prioridade sobre o pendente.
    const arquivoNovo = fileInput.files && fileInput.files[0];
    const arquivo = arquivoNovo || bibliotecaArquivoPendente || null;
    // Só reaproveita o texto já extraído se o arquivo for o pendente (não um recém-escolhido).
    const textoJaExtraido = (!arquivoNovo && bibliotecaArquivoPendente) ? bibliotecaTextoPendente : null;

    if (!titulo) { alert('Informe um título.'); return; }
    if (!arquivo && !link) { alert('Anexe um arquivo OU informe um link.'); return; }
    if (arquivo && arquivo.size > BIBLIOTECA_MAX_FILE_MB * 1024 * 1024) {
        alert(`Arquivo muito grande (máx ${BIBLIOTECA_MAX_FILE_MB}MB).`); return;
    }

    const btn = document.getElementById('bibBtnEnviar');
    const prog = document.getElementById('bibProgresso');
    const setProg = (t) => { if (prog) prog.textContent = t; };
    if (btn) btn.disabled = true;

    try {
        await salvarMaterialBiblioteca({ titulo, disciplina, serie, tags, descricao, arquivo, link: arquivo ? '' : link, textoJaExtraido, setProg });

        setProg('');
        // Limpa formulário e pendências
        ['bibTitulo', 'bibTags', 'bibDescricao', 'bibLink'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('bibDisciplina').value = '';
        document.getElementById('bibSerie').value = '';
        if (fileInput) fileInput.value = '';
        bibLimparArquivoPendente();
        const banner = document.getElementById('bibBannerClassificacao'); if (banner) banner.style.display = 'none';
        alert('Material publicado! Já está disponível para todos e para o Estagiário. 📚');
        bibSetModo('rapido');
        await recarregarBiblioteca();
    } catch (err) {
        console.error('[Biblioteca] Erro ao publicar:', err);
        setProg('');
        alert('Não foi possível publicar o material: ' + (err.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Faz o upload (se houver arquivo) e grava o documento em materiais_apoio. Reaproveita o texto
// já extraído quando disponível (evita reprocessar o arquivo vindo do modo rápido).
async function salvarMaterialBiblioteca({ titulo, disciplina, serie, tags, descricao, arquivo, link, textoJaExtraido, setProg }) {
    setProg = setProg || (() => {});
    let tipo = 'link';
    let url = link || '';
    let downloadURL = '';
    let storagePath = '';
    let fileExt = '';
    let fileName = '';
    let textoExtraido = '';

    if (arquivo) {
        tipo = 'arquivo';
        fileName = arquivo.name;
        fileExt = (arquivo.name.split('.').pop() || '').toLowerCase();

        setProg('Lendo o conteúdo do arquivo...');
        textoExtraido = (textoJaExtraido != null ? textoJaExtraido : await extrairTextoArquivoBiblioteca(arquivo)).slice(0, BIBLIOTECA_MAX_TEXTO_EXTRAIDO);

        if (typeof storage === 'undefined' || !storage) {
            throw new Error('Armazenamento de arquivos indisponível. Verifique se o Firebase Storage está ativo.');
        }
        const safe = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        storagePath = `materiais_apoio/${currentUser.uid || currentUser.id || 'anon'}/${Date.now()}_${safe}`;
        const ref = storage.ref(storagePath);
        const task = ref.put(arquivo);
        await new Promise((resolve, reject) => {
            task.on('state_changed',
                (snap) => setProg(`Enviando arquivo... ${Math.round((snap.bytesTransferred / snap.totalBytes) * 100)}%`),
                reject,
                resolve
            );
        });
        downloadURL = await ref.getDownloadURL();
    }

    // Chaves de casamento pra IA (mesma lógica do Estagiário). 'GERAL' quando sem série.
    const serieChave = (typeof resolverSerieChaveCurriculoOficial === 'function' && serie)
        ? resolverSerieChaveCurriculoOficial(serie) : '';
    const serieChaves = serieChave ? [serieChave, 'GERAL'] : ['GERAL'];

    const normalizar = (typeof normalizarTextoComparacaoMaterialDigital === 'function')
        ? normalizarTextoComparacaoMaterialDigital
        : (s) => (s || '').toString().toLowerCase();
    const textoBuscavel = normalizar(`${titulo} ${descricao} ${tags.join(' ')} ${textoExtraido}`).slice(0, BIBLIOTECA_MAX_TEXTO_EXTRAIDO);

    setProg('Salvando...');
    await db.collection('materiais_apoio').add({
        titulo, descricao, disciplina, serie, tags,
        disciplinaOriginal: disciplina,
        serieChaves,
        tipo, url, downloadURL, storagePath, fileName, fileExt,
        textoExtraido: textoExtraido || '',
        textoBuscavel,
        autorNome: currentUser.nome || 'Professor',
        autorUid: currentUser.uid || '',
        autorId: currentUser.id || '',
        schoolId: currentUser.schoolId || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now()
    });
}

async function bibliotecaExcluirMaterial(id) {
    const material = (bibliotecaCacheMateriais || []).find(m => m.id === id);
    if (!material) return;
    const podeExcluir = currentUser && (
        (material.autorUid && currentUser.uid && material.autorUid === currentUser.uid) ||
        (material.autorId && String(material.autorId) === String(currentUser.id)) ||
        currentUser.role === 'super_admin'
    );
    if (!podeExcluir) { alert('Você só pode excluir materiais que você postou.'); return; }
    if (!confirm(`Excluir "${material.titulo}"? Essa ação não pode ser desfeita.`)) return;

    try {
        if (material.storagePath && typeof storage !== 'undefined' && storage) {
            try { await storage.ref(material.storagePath).delete(); } catch (e) { console.warn('[Biblioteca] Arquivo já removido ou inacessível:', e); }
        }
        await db.collection('materiais_apoio').doc(id).delete();
        await recarregarBiblioteca();
    } catch (e) {
        console.error('[Biblioteca] Erro ao excluir:', e);
        alert('Não foi possível excluir: ' + (e.message || e));
    }
}
