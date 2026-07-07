// --- MÓDULO: ESTAGIÁRIO (IA E GERAÇÃO DE DOCUMENTOS) ---

// --- FUNDAMENTAÇÃO NO CURRÍCULO OFICIAL (Tier 1: planilha de escopo-sequência / Tier 2: PDFs com
// busca semântica) - ver Base Curricular Oficial no Super Admin (admin.js) pra como esses dados
// chegam nas coleções curriculo_escopo_sequencia / curriculo_chunks_embeddings. Compartilhado entre
// todas as escolas (sem schoolId), ao contrário do catálogo de Material Digital.

const cacheCurriculoTier1Estagiario = new Map(); // chave serieChave -> linhas (todas as disciplinas)
const cacheCurriculoTier2Estagiario = new Map(); // chave serieChave -> chunks com embedding (todas as disciplinas)
const CONFIANCA_MINIMA_TIER1_ESTAGIARIO = 0.55;
const LIMIAR_SIMILARIDADE_TIER2_ESTAGIARIO = 0.68;
const TOP_K_CHUNKS_TIER2_ESTAGIARIO = 4;

const MESES_AGENDA = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Diferencia Ensino Médio de Ensino Fundamental quando os dois usam "Ano" pro mesmo número (ex: "1º
// Ano" do Fundamental vs "1º Ano EM"/"1º Ano do Ensino Médio") - sem isso, extrairSerieChaveMaterialDigital
// sozinha devolveria "1" pros dois, misturando os documentos dos dois segmentos na busca. Prefixa com
// "EM" só quando o texto original menciona "EM" ou "Médio". Duplicada em admin.js (mesma convenção já
// usada no projeto pra funções pequenas usadas em contextos/arquivos diferentes).
function resolverSerieChaveCurriculoOficial(serieOriginal) {
    const digito = extrairSerieChaveMaterialDigital(serieOriginal);
    if (!digito) return '';
    const original = String(serieOriginal || '');
    // Sigla "EM" só em maiúsculas (ex: "1º Ano EM") - em minúsculas "em" é só a preposição comum do
    // português (ex: "6º Ano em Período Integral"), que não deve disparar a detecção.
    const temSiglaEM = /\bEM\b/.test(original);
    const semAcento = original.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const temPalavraMedio = /medio/.test(semAcento);
    return (temSiglaEM || temPalavraMedio) ? ('EM' + digito) : digito;
}

async function buscarLinhasCurriculoOficial(serie) {
    if (typeof db === 'undefined' || !db) return [];
    const serieChave = resolverSerieChaveCurriculoOficial(serie);
    if (!serieChave) return [];

    try {
        let linhas = cacheCurriculoTier1Estagiario.get(serieChave);
        if (!linhas) {
            const snap = await db.collection('curriculo_escopo_sequencia').where('serieChave', '==', serieChave).get();
            linhas = snap.docs.map(d => d.data());
            cacheCurriculoTier1Estagiario.set(serieChave, linhas);
        }
        return linhas;
    } catch (e) {
        console.warn('[Estagiário][Tier1] Erro ao buscar planilha oficial:', e);
        return [];
    }
}

async function buscarChunksCurriculoEmbedding(serie) {
    if (typeof db === 'undefined' || !db) return [];
    const serieChave = resolverSerieChaveCurriculoOficial(serie);
    if (!serieChave) return [];

    try {
        let chunks = cacheCurriculoTier2Estagiario.get(serieChave);
        if (!chunks) {
            const snap = await db.collection('curriculo_chunks_embeddings').where('serieChaves', 'array-contains', serieChave).get();
            chunks = snap.docs.map(d => d.data());
            cacheCurriculoTier2Estagiario.set(serieChave, chunks);
        }
        return chunks;
    } catch (e) {
        console.warn('[Estagiário][Tier2] Erro ao buscar trechos com embedding:', e);
        return [];
    }
}

// Pontua a melhor linha da planilha oficial contra o "Tema" digitado pelo professor, reaproveitando
// os mesmos utilitários de comparação de texto já usados pro catálogo de Material Digital (em vez de
// criar uma segunda lógica de fuzzy-match no mesmo arquivo). Cascata: cobertura de tokens exata ->
// prefixo -> Levenshtein (via disciplinasSaoSemelhantes, que já encapsula essa cascata pra strings
// curtas) aplicada token a token contra o texto pré-normalizado de cada linha.
function selecionarMelhorLinhaCurriculo(tema, linhasDaDisciplina) {
    const temaNorm = normalizarTextoComparacaoMaterialDigital(tema);
    if (!temaNorm || !linhasDaDisciplina || linhasDaDisciplina.length === 0) return { linha: null, confiante: false };

    const tokensTema = temaNorm.split(' ').filter(t => t.length >= 3);
    if (tokensTema.length === 0) return { linha: null, confiante: false };

    let melhor = null;
    let melhorScore = 0;

    linhasDaDisciplina.forEach(linha => {
        const textoLinha = linha.textoBuscavel || '';
        if (!textoLinha) return;

        if (textoLinha.includes(temaNorm)) {
            const score = 1;
            if (score > melhorScore) { melhorScore = score; melhor = linha; }
            return;
        }

        const tokensBatidos = tokensTema.filter(tok => textoLinha.includes(tok)).length;
        const score = tokensBatidos / tokensTema.length;
        if (score > melhorScore) { melhorScore = score; melhor = linha; }
    });

    return { linha: melhor, score: melhorScore, confiante: melhorScore >= CONFIANCA_MINIMA_TIER1_ESTAGIARIO };
}

function similaridadeCossenoEstagiario(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let produto = 0, normaA = 0, normaB = 0;
    for (let i = 0; i < vecA.length; i++) {
        produto += vecA[i] * vecB[i];
        normaA += vecA[i] * vecA[i];
        normaB += vecB[i] * vecB[i];
    }
    if (normaA === 0 || normaB === 0) return 0;
    return produto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

// Mesma classificação de prefixo já usada no roteador multi-IA (linha ~235 mais abaixo), extraída
// aqui como predicado reutilizável só pra identificar qual chave configurada é do Gemini (a única que
// serve pra gerar embeddings hoje).
function identificarProvedorChaveEstagiario(key) {
    if (key.startsWith('sk-') && !key.startsWith('sk-ant-')) return 'openai';
    if (key.startsWith('gsk_')) return 'groq';
    return 'gemini';
}

async function obterEmbeddingTemaEstagiario(texto, apiKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // "model" precisa vir também no corpo (além de já estar na URL) - o endpoint embedContent
            // exige esse campo, diferente do generateContent. Sem ele a API rejeita a chamada.
            body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: texto }] }, taskType: 'RETRIEVAL_QUERY' }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) return null;
        const json = await response.json();
        return (json.embedding && json.embedding.values) ? json.embedding.values : null;
    } catch (e) {
        clearTimeout(timeoutId);
        return null;
    }
}

// Orquestra a busca nas duas fontes oficiais (planilha + PDFs) uma única vez por clique em "Gerar
// Estrutura". Nunca lança erro pra fora - qualquer falha em qualquer uma das duas fontes só reduz o
// quanto a geração fica fundamentada, nunca bloqueia o professor de gerar o plano.
async function montarContextoCurriculoOficial(disciplina, serie, tema, apiKeys) {
    const contexto = { tier1: null, tier1Confiante: false, tier2Trechos: [], grounded: false };

    try {
        const linhas = (await buscarLinhasCurriculoOficial(serie))
            .filter(l => disciplinasSaoSemelhantes(disciplina, l.disciplinaOriginal));
        if (linhas.length > 0) {
            const { linha, confiante } = selecionarMelhorLinhaCurriculo(tema, linhas);
            if (linha) {
                contexto.tier1 = linha;
                contexto.tier1Confiante = confiante;
                contexto.grounded = true;
            }
        }
    } catch (e) {
        console.warn('[Estagiário][Tier1] Erro ao montar contexto:', e);
    }

    try {
        const chaveGemini = (apiKeys || []).find(k => identificarProvedorChaveEstagiario(k) === 'gemini');
        if (chaveGemini) {
            const chunks = (await buscarChunksCurriculoEmbedding(serie))
                .filter(c => !c.disciplinaOriginal || disciplinasSaoSemelhantes(disciplina, c.disciplinaOriginal));
            if (chunks.length > 0) {
                const embeddingTema = await obterEmbeddingTemaEstagiario(`${disciplina} - ${serie} - ${tema}`, chaveGemini);
                if (embeddingTema) {
                    const top = chunks
                        .map(c => ({ chunk: c, similaridade: similaridadeCossenoEstagiario(embeddingTema, c.embedding) }))
                        .filter(r => r.similaridade >= LIMIAR_SIMILARIDADE_TIER2_ESTAGIARIO)
                        .sort((a, b) => b.similaridade - a.similaridade)
                        .slice(0, TOP_K_CHUNKS_TIER2_ESTAGIARIO);
                    if (top.length > 0) {
                        contexto.tier2Trechos = top.map(r => r.chunk);
                        contexto.grounded = true;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Estagiário][Tier2] Erro ao montar contexto:', e);
    }

    return contexto;
}

const ROTULOS_TIPO_DOCUMENTO_ESTAGIARIO = {
    caderno_aluno: 'Caderno do Aluno',
    caderno_professor: 'Caderno do Professor',
    material_digital_pdf: 'Material Digital',
    guia_priorizado: 'Guia Priorizado',
    outros: 'Outros'
};

// Monta o bloco de texto injetado no prompt, instruindo a IA a reaproveitar os dados reais em vez de
// inventar. Quando não há nada fundamentado, ainda assim retorna um aviso explícito no prompt (em vez
// de simplesmente omitir a seção), pra IA não tratar o silêncio como "invente à vontade".
function montarBlocoContextoOficial(contexto) {
    if (!contexto || !contexto.grounded) {
        return '\n\n[CONTEXTO OFICIAL]\nNenhuma correspondência foi encontrada na base curricular oficial pra este tema. Gere o conteúdo com cautela e deixe claro que os códigos de habilidade são uma sugestão a ser revisada pelo professor.';
    }

    let bloco = '\n\n[CONTEXTO OFICIAL - USE ESTES DADOS REAIS, NÃO INVENTE OUTROS CÓDIGOS OU CONTEÚDOS]\n';

    if (contexto.tier1) {
        const l = contexto.tier1;
        const habilidadesStr = (l.habilidades || []).map(h => `${h.codigo} - ${h.texto}`).join('\n');
        bloco += `Fonte: planilha oficial de escopo-sequência (${l.fonteArquivo || ''}, aba ${l.fonteAba || ''}).\n`;
        bloco += `Título da aula oficial: ${l.titulo || ''}\n`;
        bloco += `Unidade Temática: ${l.unidadeTematica || ''}\n`;
        bloco += `Objeto de Conhecimento: ${l.objetoConhecimento || ''}\n`;
        bloco += `Conteúdo oficial: ${l.conteudo || ''}\n`;
        bloco += `Objetivos oficiais: ${l.objetivos || ''}\n`;
        bloco += `Habilidades (código - texto):\n${habilidadesStr}\n`;
    }

    if (contexto.tier2Trechos && contexto.tier2Trechos.length > 0) {
        bloco += '\nTrechos de documentos oficiais relacionados ao tema:\n';
        contexto.tier2Trechos.forEach(chunk => {
            const rotulo = ROTULOS_TIPO_DOCUMENTO_ESTAGIARIO[chunk.tipoDocumento] || chunk.tipoDocumento || 'Material Oficial';
            bloco += `- [${rotulo} - ${chunk.fonteArquivo || ''}, p.${chunk.paginaInicio || '?'}]: ${chunk.texto}\n`;
        });
    }

    return bloco;
}

function abrirModalGerarDocumentoIA() {
    // Extrai nomes de série de forma inteligente, ignorando formatos colados ou separados (ex: "7º Ano A", "7A", "7ºA" -> "7º Ano", "7", "7º")
    const getSerieNome = (nome) => {
        if (!nome) return '';
        let n = nome.trim();
        n = n.replace(/[\s-]+[A-Za-z]$/i, '');   // Remove letra com espaço/hífen (ex: "7º Ano A", "7 - B")
        n = n.replace(/(\d)[A-Za-z]$/i, '$1');   // Remove letra colada em número (ex: "7A" -> "7")
        n = n.replace(/([ºª])[A-Za-z]$/i, '$1'); // Remove letra colada em símbolo ordinal (ex: "7ºA" -> "7º")
        return n.trim();
    };
    const seriesUnicas = [...new Set((data.turmas || []).map(t => getSerieNome(t.ano_serie || t.nome)))].filter(Boolean);
    const disciplinasUnicas = [...new Set((data.turmas || []).map(t => t.disciplina))].filter(Boolean);

    // Calcula a próxima semana de segunda a sexta
    const hoje = new Date();
    const proximaSegunda = new Date(hoje);
    proximaSegunda.setDate(hoje.getDate() + ((1 + 7 - hoje.getDay()) % 7 || 7));
    const proximaSexta = new Date(proximaSegunda);
    proximaSexta.setDate(proximaSegunda.getDate() + 4);
    const formatData = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const semanaSugerida = `${formatData(proximaSegunda)} a ${formatData(proximaSexta)}`;
    const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const semanaInicioISO = toISO(proximaSegunda);
    const semanaFimISO = toISO(proximaSexta);

    // Mês/Ano padrão sugeridos para a Agenda Mensal
    const defaultMonth = hoje.getMonth();
    const defaultYear = hoje.getFullYear();

    const defaultPromptTemplate = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
    const savedPrompt = localStorage.getItem('ia_prompt_template') || defaultPromptTemplate;

    if (!document.getElementById('modalGerarDocumentoIA')) {
        const div = document.createElement('div');
        div.id = 'modalGerarDocumentoIA';
        div.className = 'modal';
        div.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                    <h2 style="margin: 0;">🤖 Estagiário IA</h2>
                    <button class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="closeModal('modalGerarDocumentoIA')">×</button>
                </div>
                
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Tipo de Documento:</label>
                        <select id="iaDocTipo" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;" onchange="toggleTipoDocumentoIA()">
                            <option value="plano_aula">Plano de Aula</option>
                            <option value="agenda_mensal">📅 Agenda Mensal</option>
                        </select>
                    </div>
                    <div style="flex: 1;" id="campoSemanaVigente">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Semana Vigente:</label>
                        <input type="text" id="iaDocSemana" value="${semanaSugerida}" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        <input type="hidden" id="iaDocSemanaInicio" value="${semanaInicioISO}">
                        <input type="hidden" id="iaDocSemanaFim" value="${semanaFimISO}">
                    </div>
                    <div style="flex: 1; display:none;" id="campoMesAnoAgenda">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Mês / Ano da Agenda:</label>
                        <div style="display:flex; gap:8px;">
                            <select id="iaAgendaMes" style="flex:1; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                ${MESES_AGENDA.map((m, i) => `<option value="${i}" ${i === defaultMonth ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                            <input type="number" id="iaAgendaAno" value="${defaultYear}" style="width:90px; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        </div>
                    </div>
                </div>

                <div id="camposPlanoAula">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom: 15px;">
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px;">Série / Ano:</label>
                            <select id="iaDocSerie" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                <option value="">Selecione...</option>
                                ${seriesUnicas.map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px;">Disciplina:</label>
                            <select id="iaDocDisciplina" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                <option value="">Selecione...</option>
                                ${disciplinasUnicas.map(d => `<option value="${d}">${d}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Tema / Assunto:</label>
                        <input type="text" id="iaDocTema" placeholder="Ex: Revolução Francesa" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                    </div>

                    <div style="margin-bottom: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <label style="font-weight:bold; margin:0;">Comando do Estagiário:</label>
                            <button class="btn btn-sm btn-secondary" style="font-size:10px; padding:2px 5px;" onclick="restaurarPromptPadraoIA()">Restaurar Padrão</button>
                        </div>
                        <p style="font-size:11px; color:#718096; margin-bottom:5px;">Você pode modificar com seu prompt pessoal ou usar o nativo</p>
                        <textarea id="iaDocPrompt" rows="6" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px; font-family:monospace; font-size:11px; line-height:1.4;" onchange="localStorage.setItem('ia_prompt_template', this.value)"></textarea>
                    </div>
                </div>

                <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary" onclick="closeModal('modalGerarDocumentoIA')">Cancelar</button>
                    <button class="btn btn-primary" id="btnGerarDocumentoIA" onclick="gerarDocumentoIA()">Gerar Estrutura</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    } else {
        // Atualiza os dropdowns caso o professor tenha adicionado/removido turmas
        const selSerie = document.getElementById('iaDocSerie');
        if(selSerie) selSerie.innerHTML = '<option value="">Selecione...</option>' + seriesUnicas.map(s => `<option value="${s}">${s}</option>`).join('');
        
        const selDisc = document.getElementById('iaDocDisciplina');
        if(selDisc) selDisc.innerHTML = '<option value="">Selecione...</option>' + disciplinasUnicas.map(d => `<option value="${d}">${d}</option>`).join('');
    }
    
    const docTema = document.getElementById('iaDocTema');
    if (docTema) docTema.value = '';
    const docSerie = document.getElementById('iaDocSerie');
    if (docSerie) docSerie.value = '';
    const docDisciplina = document.getElementById('iaDocDisciplina');
    if (docDisciplina) docDisciplina.value = '';
    const docSemana = document.getElementById('iaDocSemana');
    if (docSemana) docSemana.value = semanaSugerida;
    const docSemanaInicio = document.getElementById('iaDocSemanaInicio');
    if (docSemanaInicio) docSemanaInicio.value = semanaInicioISO;
    const docSemanaFim = document.getElementById('iaDocSemanaFim');
    if (docSemanaFim) docSemanaFim.value = semanaFimISO;

    const docPrompt = document.getElementById('iaDocPrompt');
    if (docPrompt) docPrompt.value = savedPrompt;

    const docAgendaMes = document.getElementById('iaAgendaMes');
    if (docAgendaMes) docAgendaMes.value = defaultMonth;
    const docAgendaAno = document.getElementById('iaAgendaAno');
    if (docAgendaAno) docAgendaAno.value = defaultYear;

    toggleTipoDocumentoIA();
    showModal('modalGerarDocumentoIA');
}

// Alterna os campos do modal do Estagiário conforme o Tipo de Documento escolhido: Plano de Aula usa
// IA (série/disciplina/tema/prompt), Agenda Mensal é só um preenchimento mecânico da grade do
// professor - pede apenas Mês/Ano e pula a etapa de revisão por IA.
function toggleTipoDocumentoIA() {
    const tipo = document.getElementById('iaDocTipo').value;
    const isAgenda = tipo === 'agenda_mensal';

    const campoSemana = document.getElementById('campoSemanaVigente');
    if (campoSemana) campoSemana.style.display = isAgenda ? 'none' : '';
    const campoMesAno = document.getElementById('campoMesAnoAgenda');
    if (campoMesAno) campoMesAno.style.display = isAgenda ? 'block' : 'none';
    const camposPlano = document.getElementById('camposPlanoAula');
    if (camposPlano) camposPlano.style.display = isAgenda ? 'none' : '';

    const btn = document.getElementById('btnGerarDocumentoIA');
    if (btn) btn.textContent = isAgenda ? '🖨️ Gerar e Imprimir Agenda' : 'Gerar Estrutura';
}

function restaurarPromptPadraoIA() {
    const defaultPromptTemplate = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
    const txt = document.getElementById('iaDocPrompt');
    if (txt) {
        txt.value = defaultPromptTemplate;
        localStorage.setItem('ia_prompt_template', defaultPromptTemplate);
    }
}

// Gera e imprime a Agenda Mensal de Trabalho a partir do modelo Docs/AgendaNova.html: só pede
// Mês/Ano (sem passar pela IA nem pela tela de revisão, já que aqui não há texto pra redigir - é um
// preenchimento mecânico da grade horária + aulas que o professor já organizou no Dashboard/Grade).
// Segue o mesmo esquema de placeholders {{REGIÃO}}/{{NOME COMPLETO DA ESCOLA}}/{{LOGO_ESTADO}}/
// {{LOGO_ESCOLA}} já usado no Plano de Aula (Docs/Base_Plano_Aula.html), pra reaproveitar as mesmas
// configurações da escola/sistema.
async function gerarAgendaMensalEstagiario() {
    const mes = parseInt(document.getElementById('iaAgendaMes').value);
    const ano = parseInt(document.getElementById('iaAgendaAno').value);
    if (isNaN(mes) || isNaN(ano) || ano < 2000) return alert('Informe um Mês e Ano válidos.');

    const btn = document.getElementById('btnGerarDocumentoIA');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando agenda... ⏳';
    btn.disabled = true;

    try {
        // 1. Carrega o modelo (template) da agenda
        let templateHtml = '';
        try {
            const response = await fetch('Docs/AgendaNova.html');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            templateHtml = await response.text();
        } catch (fetchErr) {
            console.error(fetchErr);
            return alert('Erro ao carregar o modelo Docs/AgendaNova.html. Verifique se o arquivo está na pasta do sistema.');
        }

        // 2. Busca configurações globais e da escola (mesmo padrão do Plano de Aula)
        let configSistema = {};
        let configEscola = {};
        try {
            configSistema = await getData('system', 'config_sistema') || {};
            if (currentUser && currentUser.schoolId) {
                const sData = await getData('system', 'schools_list');
                const schools = (sData && sData.list) ? sData.list : [];
                configEscola = schools.find(s => s.id == currentUser.schoolId) || {};
            }
        } catch (e) { console.warn('Erro ao buscar configs da escola', e); }

        const fallbackLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        const regiao = configSistema.regiao || 'REGIÃO NÃO CONFIGURADA';
        const logoEstado = configSistema.logoEstado || fallbackLogo;
        const nomeCompletoEscola = configEscola.nomeCompleto || configEscola.nome || 'ESCOLA NÃO CONFIGURADA';
        const logoEscola = configEscola.logoEscola || fallbackLogo;

        // 3. Substitui os marcadores globais do cabeçalho (uma única vez, texto puro)
        let htmlFinal = templateHtml
            // AgendaNova.html foi exportado do Google Docs, que grava acentos como entidades HTML
            // (Ã -> &Atilde;, ê -> &ecirc;) mesmo dentro dos marcadores {{ }} - por isso os dois
            // primeiros casamentos usam a forma decimal/entidade em vez do caractere acentuado.
            .replace(/{{REGI&Atilde;O}}/g, regiao)
            .replace(/{{NOME COMPLETO DA ESCOLA}}/g, nomeCompletoEscola)
            .replace(/{{TIPO DE DOC}}/g, 'AGENDA MENSAL DE TRABALHO')
            .replace(/{{Professor}}/g, currentUser.nome)
            .replace(/{{M&ecirc;s}}/g, MESES_AGENDA[mes])
            .replace(/{{Ano}}/g, ano);

        // 4. Carrega a grade fixa (definida pelo Gestor), exceções (dias atípicos) e as aulas que o
        // próprio professor organizou em sua Grade de Horários dentro do SisProf.
        const gradeEscola = await getGradeEscola();
        if (gradeEscola.length === 0) return alert('A grade de horários ainda não foi configurada pela gestão.');

        let excecoesGrade = [];
        if (currentUser && currentUser.schoolId) {
            const keyGestor = 'app_data_school_' + currentUser.schoolId + '_gestor';
            const gestorData = await getData('app_data', keyGestor);
            if (gestorData) excecoesGrade = gestorData.gradeHorariaExcecoes || [];
        }
        const minhasAulas = data.horariosAulas || [];
        const turmas = data.turmas || [];

        const mapFixed = { tutoria: 'Tutoria', almoco: 'Almoço', cafe: 'Café', atpca: 'ATPCA', apcg: 'APCG', reuniao: 'Reunião' };
        const mapProf = { tutoria: 'Tutoria', estudo: 'Estudo', apcg: 'APCG', atpca: 'ATPCA', reuniao: 'Reunião', almoco: 'Almoço', cafe: 'Café', ped_presenc: 'Ped. Presenç.', eletiva: 'Eletiva' };

        // Acha o bloco da grade correspondente a uma "N-ésima aula" de um dia (1=Seg...5=Sex), dando
        // preferência ao rótulo (label) configurado pelo gestor e caindo pra ordem de horário quando
        // não houver rótulo - e resolve o conteúdo (turma/disciplina ou tipo fixo) daquele bloco.
        function montarConteudoCelula(diaSemana, aulaNum, dataStr) {
            const excecao = excecoesGrade.find(e => e.data === dataStr);
            let bloco = null;

            if (excecao) {
                if (excecao.blocos && excecao.blocos.length >= aulaNum) bloco = excecao.blocos[aulaNum - 1];
            } else {
                bloco = gradeEscola.find(g => g.diaSemana == diaSemana && (g.label || '').trim().startsWith(aulaNum.toString()));
                if (!bloco) {
                    const blocosDoDia = gradeEscola.filter(g => g.diaSemana == diaSemana).sort((a, b) => a.inicio.localeCompare(b.inicio));
                    if (blocosDoDia.length >= aulaNum) bloco = blocosDoDia[aulaNum - 1];
                }
            }
            if (!bloco) return '';

            if (bloco.tipo) return mapFixed[bloco.tipo] || bloco.tipo.toUpperCase();

            const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
            if (!aula) return '';
            if (aula.tipo === 'aula' && aula.id_turma) {
                const t = turmas.find(x => x.id == aula.id_turma);
                if (!t) return 'Turma Excluída';
                return t.disciplina ? `${t.nome}<br><span style="font-size:8pt;">${t.disciplina}</span>` : t.nome;
            }
            const rotulo = mapProf[aula.tipo] || aula.tipo;
            return aula.tema ? `${rotulo}<br><span style="font-size:8pt;">${aula.tema}</span>` : rotulo;
        }

        // 5. Faz o parse do modelo e localiza os logos + a tabela semanal (que será duplicada)
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlFinal, 'text/html');

        const imgEstado = doc.querySelector('img.image-1');
        if (imgEstado) imgEstado.src = logoEstado;
        const imgEscola = doc.querySelector('img.image-2');
        if (imgEscola) imgEscola.src = logoEscola;

        const templateTable = doc.querySelector('table.c22');
        if (!templateTable) return alert('Modelo Docs/AgendaNova.html inválido: tabela semanal não encontrada.');

        // 6. Calcula quantas semanas (segunda a sábado) o mês precisa e clona a tabela-modelo pra cada uma
        const primeiroDia = new Date(ano, mes, 1);
        const ultimoDia = new Date(ano, mes + 1, 0);
        const folgaPrimeiraSemana = (primeiroDia.getDay() + 6) % 7; // 0=Seg ... 6=Dom
        const semanasNecessarias = Math.ceil((ultimoDia.getDate() + folgaPrimeiraSemana) / 7);
        const primeiraSegunda = new Date(ano, mes, 1 - folgaPrimeiraSemana);

        const tabelasSemana = [templateTable];
        let ultimaInserida = templateTable;
        for (let i = 1; i < semanasNecessarias; i++) {
            const clone = templateTable.cloneNode(true);
            clone.style.marginTop = '12px';
            ultimaInserida.parentNode.insertBefore(clone, ultimaInserida.nextSibling);
            ultimaInserida = clone;
            tabelasSemana.push(clone);
        }

        // 7. Preenche cada semana com as datas do mês e as aulas/compromissos do professor
        tabelasSemana.forEach((tabela, semanaIdx) => {
            const segunda = new Date(primeiraSegunda);
            segunda.setDate(primeiraSegunda.getDate() + semanaIdx * 7);

            const diasDaSemana = [];
            let temDiaNoMes = false;
            for (let d = 0; d < 6; d++) { // 0=Seg ... 5=Sáb
                const dt = new Date(segunda);
                dt.setDate(segunda.getDate() + d);
                diasDaSemana.push(dt);
                if (dt.getMonth() === mes) temDiaNoMes = true;
            }

            if (!temDiaNoMes) { tabela.remove(); return; }

            const linhas = Array.from(tabela.querySelectorAll('tr'));
            const linhaDatas = linhas[1]; // thead: [0]=nomes dos dias, [1]=números dos dias
            const celulasDatas = linhaDatas ? Array.from(linhaDatas.cells) : [];

            for (let d = 0; d < 6; d++) {
                const dt = diasDaSemana[d];
                const isMesAtual = dt.getMonth() === mes;
                const celula = celulasDatas[d + 1];
                const span = celula ? celula.querySelector('span') : null;
                if (span) span.textContent = isMesAtual ? dt.getDate() : '';
            }

            // tbody: linhas de "1ª Aula" a "9ª Aula" (a de Almoço não tem número e é ignorada, mantendo
            // seu texto fixo do modelo)
            linhas.slice(2).forEach(linha => {
                const rotuloLinha = linha.cells[0] ? linha.cells[0].textContent.trim() : '';
                const match = rotuloLinha.match(/(\d+)/);
                if (!match) return;
                const aulaNum = parseInt(match[1]);

                for (let d = 0; d < 5; d++) { // Segunda a Sexta (Sábado não tem aula fixa)
                    const dt = diasDaSemana[d];
                    const celula = linha.cells[d + 1];
                    const span = celula ? celula.querySelector('span') : null;
                    if (!span) continue;

                    if (dt.getMonth() !== mes) { span.innerHTML = ''; continue; }

                    const dataStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    span.innerHTML = montarConteudoCelula(d + 1, aulaNum, dataStr);
                }
            });
        });

        // 8. Garante que o CSS relativo do modelo (Docs/style.css) carregue na janela de impressão.
        // Precisa ser o primeiro elemento do <head> - o navegador já dispara o fetch do <link
        // rel="stylesheet"> ao encontrá-lo durante o parse do document.write(), antes de processar
        // qualquer <base> que viesse depois dele.
        const base = doc.createElement('base');
        base.href = new URL('Docs/AgendaNova.html', window.location.href).href;
        doc.head.insertBefore(base, doc.head.firstChild);

        const printStyle = doc.createElement('style');
        printStyle.textContent = '@media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }';
        doc.head.appendChild(printStyle);

        const win = window.open('', '', 'width=1200,height=800');
        if (!win) throw new Error('O navegador bloqueou a abertura da janela (Pop-up). Permita pop-ups no seu navegador para gerar a agenda.');
        win.document.write(doc.documentElement.outerHTML);
        win.document.close();
        setTimeout(() => { win.print(); }, 500);

        closeModal('modalGerarDocumentoIA');
    } catch (e) {
        alert('Erro ao gerar a agenda: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function gerarDocumentoIA() {
    const tipo = document.getElementById('iaDocTipo').value;
    if (tipo === 'agenda_mensal') return gerarAgendaMensalEstagiario();

    const tema = document.getElementById('iaDocTema').value;
    const serie = document.getElementById('iaDocSerie') ? document.getElementById('iaDocSerie').value : '';
    const disciplina = document.getElementById('iaDocDisciplina') ? document.getElementById('iaDocDisciplina').value : '';
    const semana = document.getElementById('iaDocSemana') ? document.getElementById('iaDocSemana').value : '';
    const semanaInicioISO = document.getElementById('iaDocSemanaInicio') ? document.getElementById('iaDocSemanaInicio').value : '';
    const semanaFimISO = document.getElementById('iaDocSemanaFim') ? document.getElementById('iaDocSemanaFim').value : '';

    if (!serie || !disciplina) return alert('Por favor, selecione a série e a disciplina.');
    if (!tema) return alert('Por favor, informe o tema/assunto.');

    // Busca a chave da API configurada com segurança no banco de dados
    let apiKeys = [];
    try {
        const configData = await getData('system', 'config_ia');
        if (configData && configData.apiKey) {
            apiKeys = configData.apiKey.split(',').map(k => k.trim()).filter(k => k);
        }
    } catch(e) {
        console.warn('Erro ao buscar chave da IA:', e);
    }

    if (apiKeys.length === 0) return alert('⚠️ A chave da API não foi configurada. Peça ao Administrador para entrar no painel Super Admin e adicioná-la na aba Migração.');

    const btn = document.querySelector('#modalGerarDocumentoIA .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando estrutura... ⏳';
    btn.disabled = true;

    // Extrai turmas e duração
    const getSerieNome = (nome) => {
        if (!nome) return '';
        let n = nome.trim();
        n = n.replace(/[\s-]+[A-Za-z]$/i, '');
        n = n.replace(/(\d)[A-Za-z]$/i, '$1');
        n = n.replace(/([ºª])[A-Za-z]$/i, '$1');
        return n.trim();
    };

    const turmasMatch = (data.turmas || []).filter(t => getSerieNome(t.ano_serie || t.nome) === serie && t.disciplina === disciplina);
    const turmasNomesStr = turmasMatch.length > 0 ? turmasMatch.map(t => t.nome).join(', ') : 'Não detectada';

    let duracaoAulas = 0;
    if (turmasMatch.length > 0) {
        const idPrimeiraTurma = turmasMatch[0].id;
        const minhasAulas = data.horariosAulas || [];
        duracaoAulas = minhasAulas.filter(a => a.id_turma == idPrimeiraTurma && a.tipo === 'aula').length;
    }
    const duracaoAulasStr = duracaoAulas > 0 ? `${duracaoAulas} aula(s) (${duracaoAulas * 50} min)` : 'Não definida';

    const hoje = getTodayString();
    const configBimestres = data.configBimestres || [];
    const configAtual = configBimestres.find(c => hoje >= c.inicio && hoje <= c.fim);
    const bimestreAtual = configAtual ? `${configAtual.bim}º BIMESTRE` : 'BIMESTRE VIGENTE';

    try {
        let dadosEstruturados = {};
        let promptText = '';

        // Busca a fundamentação oficial (planilha de escopo-sequência + PDFs com busca semântica)
        // antes de montar o prompt, pra IA usar dados reais em vez de "conhecimento profundo" de
        // memória - ver montarContextoCurriculoOficial no topo do arquivo.
        const contextoOficial = await montarContextoCurriculoOficial(disciplina, serie, tema, apiKeys);

        if (tipo === 'plano_aula') {
            let templateBase = document.getElementById('iaDocPrompt') ? document.getElementById('iaDocPrompt').value : '';
            if (!templateBase || templateBase.trim() === '') {
                templateBase = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
            }

            promptText = templateBase
                .replace(/{{disciplina}}/g, disciplina)
                .replace(/{{serie}}/g, serie)
                .replace(/{{tema}}/g, tema);
                
            // Verifica se o usuário colou um prompt externo que não contém os marcadores ou a estrutura JSON necessária
            const faltaMarcador = !templateBase.includes('{{disciplina}}') || !templateBase.includes('{{serie}}') || !templateBase.includes('{{tema}}');
            const faltaEstruturaJson = !templateBase.includes('{"aprendizagem_essencial"');

            // Injeta as diretrizes obrigatórias de forma invisível caso o prompt colado não as tenha
            if (faltaMarcador) {
                promptText += `\n\n[DADOS OBRIGATÓRIOS]\nO plano de aula DEVE ser sobre a disciplina de ${disciplina}, para a série/ano ${serie}, com o tema "${tema}".\nAs habilidades devem seguir o código e formato do Currículo Paulista específicos da disciplina de ${disciplina} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR...).`;
            }
            if (faltaEstruturaJson) {
                promptText += `\n\n[FORMATO DE SAÍDA OBRIGATÓRIO]\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades com códigos", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
            }

            // Injeta a fundamentação oficial (planilha/PDFs) sempre, independente do prompt usado -
            // mesmo princípio dos blocos [DADOS OBRIGATÓRIOS]/[FORMATO...] acima.
            promptText += montarBlocoContextoOficial(contextoOficial);
        }

        let success = false;
        let lastError = '';
        let respostaTexto = '';

        let tentativas = 3; // Tenta até 3 vezes
        const modelosFallback = ['gemini-1.5-flash', 'gemini-1.5-pro-latest', 'gemini-2.0-flash'];
        
        for (let i = 0; i < tentativas && !success; i++) {
            const modeloAtual = modelosFallback[i % modelosFallback.length];
            
            for (const currentKey of apiKeys) {
                try {
                    btn.textContent = `Gerando estrutura... ⏳ (Tentativa ${i+1}/3)`;
                    
                    // Implementa limite de tempo (20 segundos) para evitar congelamento da tela
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 20000);

                    // --- ROTEADOR MULTI-IA AUTOMÁTICO ---
                    if (currentKey.startsWith('sk-') && !currentKey.startsWith('sk-ant-')) {
                        // 1. OPENAI (ChatGPT - GPT-4o-mini)
                        const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
                            body: JSON.stringify({
                                model: 'gpt-4o-mini',
                                messages: [
                                    { role: 'system', content: 'Você deve retornar APENAS um JSON válido. Nenhuma formatação markdown.' },
                                    { role: 'user', content: promptText }
                                ],
                                temperature: 0.7,
                                response_format: { type: "json_object" }
                            }),
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);
                        if (!response.ok) throw new Error(`OpenAI Erro: ${response.statusText}`);
                        const apiDataObj = await response.json();
                        respostaTexto = apiDataObj.choices[0].message.content;

                    } else if (currentKey.startsWith('gsk_')) {
                        // 2. GROQ (Llama-3 - Super Rápido)
                        const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
                            body: JSON.stringify({
                                model: 'llama-3.3-70b-versatile',
                                messages: [
                                    { role: 'system', content: 'Você deve retornar APENAS um JSON válido. Nenhuma formatação markdown.' },
                                    { role: 'user', content: promptText }
                                ],
                                temperature: 0.7,
                                response_format: { type: "json_object" }
                            }),
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);
                        if (!response.ok) throw new Error(`Groq Erro: ${response.statusText}`);
                        const apiDataObj = await response.json();
                        respostaTexto = apiDataObj.choices[0].message.content;

                    } else {
                        // 3. GOOGLE GEMINI (Padrão)
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeloAtual}:generateContent?key=${currentKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: promptText }] }],
                                generationConfig: { temperature: 0.7, response_mime_type: "application/json" }
                            }),
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);
                        if (!response.ok) {
                            const errorObj = await response.json();
                            throw new Error(errorObj.error ? errorObj.error.message : response.statusText);
                        }
                        const apiDataObj = await response.json();
                        if (!apiDataObj.candidates || apiDataObj.candidates.length === 0 || !apiDataObj.candidates[0].content) {
                            throw new Error('A IA não retornou um conteúdo válido.');
                        }
                        respostaTexto = apiDataObj.candidates[0].content.parts[0].text;
                    }
                    
                    success = true;
                    break; // Sucesso, sai do loop de chaves
                } catch (err) {
                    lastError = err.name === 'AbortError' ? 'Tempo de resposta esgotado.' : err.message;
                    console.warn(`⚠️ Falha na API (Tentativa ${i+1}):`, lastError);
                }
            }
            if (!success && i < tentativas - 1) {
                // Aguarda 2 segundos (2000ms) antes de tentar novamente, para dar tempo da API desafogar
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!success) {
            throw new Error(`A Inteligência Artificial falhou ou rejeitou o pedido.\nMotivo: ${lastError}`);
        }

        // Limpa potenciais blocos markdown que a IA possa enviar por teimosia e converte para objeto
        let jsonLimpo = respostaTexto.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
        
        const jsonMatch = jsonLimpo.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonLimpo = jsonMatch[0];
        }
        
        try {
            dadosEstruturados = JSON.parse(jsonLimpo);
        } catch (parseErr) {
            console.error("Erro no JSON retornado pela IA:", respostaTexto);
            throw new Error("A IA não retornou os dados no formato esperado. Por favor, tente gerar novamente.");
        }

        // Quando a planilha oficial deu uma correspondência confiante, os campos com fonte 1:1 na
        // planilha (habilidades/conteúdos/objetivos) são sobrescritos com o dado real - não passam
        // pela IA, que ocasionalmente parafraseia ou corrompe um código alfanumérico mesmo tendo o
        // contexto correto no prompt.
        if (contextoOficial.tier1Confiante && contextoOficial.tier1) {
            const linhaOficial = contextoOficial.tier1;
            if ((linhaOficial.habilidades || []).length > 0) {
                dadosEstruturados.habilidades = linhaOficial.habilidades.map(h => `${h.codigo} - ${h.texto}`).join('\n');
            }
            if (linhaOficial.conteudo) dadosEstruturados.conteudos = linhaOficial.conteudo;
            if (linhaOficial.objetivos) dadosEstruturados.objetivos = linhaOficial.objetivos;
        }

        closeModal('modalGerarDocumentoIA');
        // Catálogo de Material Digital compartilhado pra essa disciplina+série (mesma coleção que
        // qualquer turma/professor da escola alimenta) - buscado aqui (função já é async) pra não
        // precisar tornar abrirModalRevisaoDocumento assíncrona.
        const cardsMaterialDigitalDisponiveis = await obterCardsCatalogoCompartilhado(disciplina, serie);
        const resumoFundamentacao = {
            grounded: contextoOficial.grounded,
            tier1Confiante: contextoOficial.tier1Confiante,
            fonte: contextoOficial.tier1 ? `${contextoOficial.tier1.fonteArquivo || ''} (aba ${contextoOficial.tier1.fonteAba || ''})` : null,
            qtdTrechosTier2: (contextoOficial.tier2Trechos || []).length
        };
        abrirModalRevisaoDocumento(tipo, serie, disciplina, tema, semana, turmasNomesStr, duracaoAulasStr, bimestreAtual, dadosEstruturados, semanaInicioISO, semanaFimISO, cardsMaterialDigitalDisponiveis, resumoFundamentacao);

    } catch (e) {
        console.error(e);
        alert('Erro ao gerar documento com IA:\n' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function abrirModalRevisaoDocumento(tipo, serie, disciplina, tema, semana, turmasStr, duracaoAulas, bimestreAtual, dados, semanaInicioISO, semanaFimISO, cardsMaterialDigitalDisponiveis, resumoFundamentacao) {
    if (!document.getElementById('modalRevisaoDocumento')) {
        const div = document.createElement('div');
        div.id = 'modalRevisaoDocumento';
        div.className = 'modal';
        document.body.appendChild(div);
    }

    // Salvar meta-dados no modal invisivelmente para uso na exportação final
    const modal = document.getElementById('modalRevisaoDocumento');
    modal.dataset.tipo = tipo;
    modal.dataset.serie = serie;
    modal.dataset.disciplina = disciplina;
    modal.dataset.tema = tema;
    modal.dataset.semana = semana;
    modal.dataset.turmasStr = turmasStr;
    modal.dataset.duracaoAulas = duracaoAulas;
    modal.dataset.bimestre = bimestreAtual;
    modal.dataset.semanaInicio = semanaInicioISO || '';
    modal.dataset.semanaFim = semanaFimISO || '';

    let formHtml = '';
    if (tipo === 'plano_aula') {
        formHtml = `
            <div style="max-height: 50vh; overflow-y: auto; padding-right: 10px;">
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Aprendizagem Essencial (AE):</label>
                    <textarea id="revDocAE" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.aprendizagem_essencial || ''}</textarea>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom: 15px;">
                    <div>
                        <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Conteúdos:</label>
                        <textarea id="revDocConteudos" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.conteudos || ''}</textarea>
                    </div>
                    <div>
                        <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Habilidades:</label>
                        <textarea id="revDocHabilidades" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.habilidades || ''}</textarea>
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Objetivos da Aula:</label>
                    <textarea id="revDocObjetivos" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.objetivos || ''}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Desenvolvimento / Metodologia:</label>
                    <textarea id="revDocDesenvolvimento" rows="5" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.desenvolvimento || ''}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Materiais e Recursos:</label>
                    <textarea id="revDocMateriais" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.materiais || ''}</textarea>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Avaliação:</label>
                <textarea id="revDocAvaliacao" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.avaliacao || ''}</textarea>
            </div>
        `;
    }

    // Seletor de "qual aula do Material Digital foi dada" - reaproveita o catálogo compartilhado da
    // escola pra essa disciplina+série (já resolvido em gerarDocumentoIA, antes de chamar esta função).
    // Fica de fora do PDF por exigência do usuário - só é lido em exportarDocumentoFinal() pra anexar
    // aos rascunhos de registrosAula (automações).
    const cardsMaterialDigitalHtml = renderizarSeletorCardsMaterialDigitalDeLista(cardsMaterialDigitalDisponiveis || [], [], 'revDocCardsMaterialDigital');

    // Aviso de fundamentação na base curricular oficial (planilha/PDFs) - ver montarContextoCurriculoOficial.
    const fundamentacaoHtml = resumoFundamentacao && resumoFundamentacao.grounded
        ? `<div style="background:#f0fff4; border:1px solid #9ae6b4; color:#276749; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;">✅ Fundamentado no Currículo Paulista${resumoFundamentacao.fonte ? ` (${resumoFundamentacao.fonte})` : ''}${resumoFundamentacao.qtdTrechosTier2 ? ` + ${resumoFundamentacao.qtdTrechosTier2} trecho(s) de material oficial` : ''}.</div>`
        : `<div style="background:#fffaf0; border:1px solid #fbd38d; color:#975a16; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;">⚠️ Gerado sem fundamentação na base curricular oficial — revise os códigos de habilidade com atenção.</div>`;

    document.getElementById('modalRevisaoDocumento').innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                <h2 style="margin: 0;">📝 Revisar e Editar Documento</h2>
                <button class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="closeModal('modalRevisaoDocumento')">×</button>
            </div>
            <div style="background:#ebf8ff; border:1px solid #bee3f8; padding:12px; border-radius:6px; margin-bottom:20px; font-size:14px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:5px;">
                    <div><strong style="color:#2b6cb0;">Professor:</strong> <span>${currentUser.nome}</span></div>
                    <div><strong style="color:#2b6cb0;">Disciplina:</strong> <span>${disciplina}</span></div>
                    <div><strong style="color:#2b6cb0;">Turmas:</strong> <span style="font-size:12px;">${turmasStr}</span></div>
                    <div><strong style="color:#2b6cb0;">Duração Prevista:</strong> <span>${duracaoAulas}</span></div>
                </div>
                <div style="border-top:1px dashed #bee3f8; margin-top:5px; padding-top:5px;">
                    <strong style="color:#2b6cb0;">Semana:</strong> <span>${semana}</span> | <strong style="color:#2b6cb0;">Tema:</strong> <span>${tema}</span> | <strong style="color:#2b6cb0;">Bimestre:</strong> <span>${bimestreAtual}</span>
                </div>
            </div>
            <p style="font-size:13px; color:#666; margin-bottom:15px;">Abaixo está a estrutura pré-gerada. Fique à vontade para ajustar o texto antes de exportar o arquivo final.</p>
            ${fundamentacaoHtml}
            ${formHtml}
            ${cardsMaterialDigitalHtml}
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:15px;">
                <button class="btn btn-secondary" onclick="closeModal('modalRevisaoDocumento'); showModal('modalGerarDocumentoIA')">← Voltar</button>
                <button class="btn btn-success" onclick="exportarDocumentoFinal('${tipo}')" id="btnExportarDoc">💾 Gerar PDF Final</button>
            </div>
        </div>
    `;
    showModal('modalRevisaoDocumento');
}

async function exportarDocumentoFinal(tipo) {

    const btn = document.getElementById('btnExportarDoc');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando Documento... ⏳';
    btn.disabled = true;

    const modal = document.getElementById('modalRevisaoDocumento');
    const payload = {
        tipo: modal.dataset.tipo,
        professor: currentUser.nome,
        disciplina: modal.dataset.disciplina,
        serie: modal.dataset.serie,
        turmasStr: modal.dataset.turmasStr,
        semana: modal.dataset.semana,
        tema: modal.dataset.tema,
        duracaoAulas: modal.dataset.duracaoAulas,
        bimestre: modal.dataset.bimestre,
        dados: {
            aprendizagem_essencial: document.getElementById('revDocAE') ? document.getElementById('revDocAE').value : '',
            conteudos: document.getElementById('revDocConteudos') ? document.getElementById('revDocConteudos').value : '',
            habilidades: document.getElementById('revDocHabilidades') ? document.getElementById('revDocHabilidades').value : '',
            objetivos: document.getElementById('revDocObjetivos') ? document.getElementById('revDocObjetivos').value : '',
            desenvolvimento: document.getElementById('revDocDesenvolvimento') ? document.getElementById('revDocDesenvolvimento').value : '',
            materiais: document.getElementById('revDocMateriais') ? document.getElementById('revDocMateriais').value : '',
            avaliacao: document.getElementById('revDocAvaliacao') ? document.getElementById('revDocAvaliacao').value : ''
        }
    };

    try {
        let templateHtml = '';
        try {
            const response = await fetch('Docs/Base_Plano_Aula.html');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            templateHtml = await response.text();
        } catch (fetchErr) {
            console.warn("Template local não carregado (CORS/file://). Usando template embutido.", fetchErr);
            templateHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Planos de Aula Semanais</title>
<style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; }
    .page-break { page-break-after: always; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid black; padding: 6px; text-align: left; vertical-align: top; }
    .header-table { border: none; width: 100%; margin-bottom: 10px; }
    .header-table td { border: none; text-align: center; vertical-align: middle; }
    .header-left { text-align: left; width: 250px; }
    .header-right { text-align: right; width: 150px; }
    .header-center { font-weight: bold; font-size: 14px; }
    .subtitle { text-align: center; font-weight: bold; margin-bottom: 10px; font-size: 13px; }
    .gray-bg { background-color: #f2f2f2; font-weight: bold; text-align: center; }
    .center { text-align: center; }
</style>
</head>
<body>
<div class="page-break">
    <table class="header-table">
        <tr>
            <td class="header-left"><img src="{{LOGO_ESTADO}}" style="max-width: 220px; max-height: 80px;"></td>
            <td class="header-center">UNIDADE REGIONAL DE ENSINO - {{REGIÃO}}<br>{{NOME COMPLETO DA ESCOLA}}<br>{{TIPO DE DOC}}</td>
            <td class="header-right"><img src="{{LOGO_ESCOLA}}" style="max-width: 120px; max-height: 80px;"></td>
        </tr>
    </table>
    <div class="subtitle">{{BIMESTRE}}</div>
    <table>
        <tr>
            <td colspan="4"><b>PROFESSOR:</b> {{PROFESSOR}}</td>
            <td colspan="3"><b>DISCIPLINA:</b> {{DISCIPLINA}}</td>
        </tr>
        <tr>
            <td colspan="4"><b>ANO:</b>{{SERIE}} {{TURMAS}}</td>
            <td colspan="3"><b>DATA:</b> {{SEMANA}}</td>
        </tr>
        <tr>
            <td colspan="4"><b>TEMA DA AULA:</b> {{TEMA}}</td>
            <td colspan="3"><b>Aprendizagem essencial:</b> {{APRENDIZAGEM_ESSENCIAL}}</td>
        </tr>
        <tr class="gray-bg">
            <td width="12%">CONTEÚDOS</td>
            <td width="15%">HABILIDADES</td>
            <td width="13%">OBJETIVOS</td>
            <td width="30%">DESENVOLVIMENTO</td>
            <td width="10%">MATERIAIS</td>
            <td width="10%">AVALIAÇÃO</td>
            <td width="10%">DURAÇÃO</td>
        </tr>
        <tr>
            <td>{{CONTEUDOS}}</td>
            <td>{{HABILIDADES}}</td>
            <td>{{OBJETIVOS}}</td>
            <td>
                {{DESENVOLVIMENTO}}
            </td>
            <td>{{MATERIAIS}}</td>
            <td>{{AVALIACAO}}</td>
            <td class="center"><b>{{DURACAO}}</b></td>
        </tr>
        <tr>
            <td colspan="7" style="height: 60px;">
                <b>* OBSERVAÇÃO DO CGPG:</b><br><br>
                <b>CIÊNCIA DO PROFESSOR:</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>CIÊNCIA DO CGPG:</b>
            </td>
        </tr>
    </table>
</div>
</body>
</html>`;
        }

        // Busca configurações globais e da escola
        let configSistema = {};
        let configEscola = {};
        try {
            configSistema = await getData('system', 'config_sistema') || {};
            if (currentUser && currentUser.schoolId) {
                const sData = await getData('system', 'schools_list');
                const schools = (sData && sData.list) ? sData.list : [];
                configEscola = schools.find(s => s.id == currentUser.schoolId) || {};
            }
        } catch(e) { console.warn("Erro ao buscar configs da escola", e); }

        const fallbackLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        const regiao = configSistema.regiao || 'REGIÃO NÃO CONFIGURADA';
        const logoEstado = configSistema.logoEstado || fallbackLogo;
        const nomeCompletoEscola = configEscola.nomeCompleto || configEscola.nome || 'ESCOLA NÃO CONFIGURADA';
        const logoEscola = configEscola.logoEscola || fallbackLogo;
        const tipoDoc = payload.tipo === 'plano_aula' ? 'PLANO DE AULA' : payload.tipo.toUpperCase().replace('_', ' ');

        // Substitui todos os marcadores (placeholders) pelos dados reais globalmente (/g)
        let htmlFinal = templateHtml
            .replace(/{{REGIÃO}}/g, regiao)
            .replace(/{{NOME COMPLETO DA ESCOLA}}/g, nomeCompletoEscola)
            .replace(/{{TIPO DE DOC}}/g, tipoDoc)
            .replace(/{{LOGO_ESTADO}}/g, logoEstado)
            .replace(/{{LOGO_ESCOLA}}/g, logoEscola)
            .replace(/{{PROFESSOR}}/g, payload.professor || '')
            .replace(/{{DISCIPLINA}}/g, payload.disciplina || '')
            .replace(/{{SERIE}}/g, payload.serie || '')
            .replace(/{{TURMAS}}/g, payload.turmasStr || '')
            .replace(/{{TEMA}}/g, payload.tema || '')
            .replace(/{{SEMANA}}/g, payload.semana || '')
            .replace(/{{DURACAO}}/g, payload.duracaoAulas || '')
            .replace(/{{BIMESTRE}}/g, payload.bimestre || '')
            .replace(/{{APRENDIZAGEM_ESSENCIAL}}/g, payload.dados.aprendizagem_essencial || '')
            .replace(/{{OBJETIVOS}}/g, payload.dados.objetivos || '')
            .replace(/{{CONTEUDOS}}/g, payload.dados.conteudos || '')
            .replace(/{{HABILIDADES}}/g, payload.dados.habilidades || '')
            .replace(/{{DESENVOLVIMENTO}}/g, payload.dados.desenvolvimento || '')
            .replace(/{{MATERIAIS}}/g, payload.dados.materiais || '')
            .replace(/{{AVALIACAO}}/g, payload.dados.avaliacao || '');

        // Injeta o script de auto-imprimir se ele não existir no seu arquivo base
        if (!htmlFinal.includes('window.print')) {
            htmlFinal += '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>';
        }

        const win = window.open('', '', 'width=900,height=800');
        if (!win) {
            throw new Error('O navegador bloqueou a abertura da janela (Pop-up). Permita pop-ups no seu navegador para gerar o documento.');
        }
        win.document.write(htmlFinal);
        win.document.close();
        
        closeModal('modalRevisaoDocumento');
        
        // [NOVO] AUTO-SALVAR DRAFT DO REGISTRO DE AULA
        // Gera um rascunho de registro para CADA dia em que a turma realmente tem aula dentro da
        // semana informada no plano (não só "hoje"), assim o rascunho já aparece pré-preenchido na
        // Chamada de qualquer um desses dias. Nunca sobrescreve um registro que o professor já tenha
        // feito manualmente para aquele dia (checagem de "registroExistente" por turma+data).
        try {
            if (!data.registrosAula) data.registrosAula = [];

            const getSerieNomeLocal = (nome) => {
                if (!nome) return '';
                let n = nome.trim();
                n = n.replace(/[\s-]+[A-Za-z]$/i, '');
                n = n.replace(/(\d)[A-Za-z]$/i, '$1');
                n = n.replace(/([ºª])[A-Za-z]$/i, '$1');
                return n.trim();
            };

            // Busca a grade/exceções da escola direto no banco (mesmo padrão do renderDashboard/
            // renderChamada), em vez de confiar em data.schoolGrade/schoolExceptions - que só ficam
            // preenchidos se o professor já tiver aberto o Dashboard nesta sessão.
            let gradeEscola = data.schoolGrade || [];
            let excecoesGrade = data.schoolExceptions || [];
            if (currentUser && currentUser.schoolId) {
                const keyGestor = 'app_data_school_' + currentUser.schoolId + '_gestor';
                const gestorData = await getData('app_data', keyGestor);
                if (gestorData) {
                    gradeEscola = gestorData.gradeHoraria || [];
                    excecoesGrade = gestorData.gradeHorariaExcecoes || [];
                }
            }
            const minhasAulas = data.horariosAulas || [];

            const turmaTemAulaNoDia = (turmaId, dataStr) => {
                const diaSemana = new Date(dataStr + 'T12:00:00').getDay();
                const excecao = excecoesGrade.find(e => e.data === dataStr);
                const blocosDoDia = excecao ? (excecao.blocos || []) : gradeEscola.filter(g => g.diaSemana == diaSemana);
                return blocosDoDia.some(bloco => {
                    const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
                    return aula && aula.tipo === 'aula' && aula.id_turma == turmaId;
                });
            };

            const turmasAlvo = (data.turmas || []).filter(t => t.disciplina === payload.disciplina && getSerieNomeLocal(t.ano_serie || t.nome) === payload.serie);

            // Monta a lista de dias da semana do plano (inclusive); cai para "hoje" se as datas não vieram.
            const diasDaSemana = [];
            const inicioISO = modal.dataset.semanaInicio;
            const fimISO = modal.dataset.semanaFim;
            if (inicioISO && fimISO) {
                const cursor = new Date(inicioISO + 'T12:00:00');
                const fim = new Date(fimISO + 'T12:00:00');
                while (cursor <= fim) {
                    diasDaSemana.push(cursor.toISOString().split('T')[0]);
                    cursor.setDate(cursor.getDate() + 1);
                }
            } else {
                diasDaSemana.push(getTodayString());
            }

            const conteudoResumo = `Tema: ${payload.tema}\n\nObjetivo: ${payload.dados.objetivos || 'Apresentado no plano de aula.'}\n\nDesenvolvimento: ${payload.dados.desenvolvimento || ''}`;
            let algumCriado = false;

            // Lido do seletor de "Material Digital" do modal de revisão - NÃO entra no template/PDF
            // exportado (fica de fora dos placeholders substituídos acima), só é anexado aos rascunhos
            // de registrosAula abaixo, para as automações (extensão) que preenchem a SED depois.
            const cardsMaterialDigitalSelecionados = lerCardsMaterialDigitalSelecionados('revDocCardsMaterialDigital');

            turmasAlvo.forEach(turma => {
                // Se a turma não tem nenhum bloco de grade configurado, não há como saber os dias de
                // aula dela - cai para o comportamento antigo (rascunho só em "hoje") em vez de não
                // criar nada.
                const turmaTemGradeConfigurada = gradeEscola.some(g => minhasAulas.some(a => a.id_bloco == g.id && a.id_turma == turma.id));
                const diasAlvo = turmaTemGradeConfigurada ? diasDaSemana.filter(d => turmaTemAulaNoDia(turma.id, d)) : [getTodayString()];

                diasAlvo.forEach(diaStr => {
                    const registroExistente = data.registrosAula.find(r => r.id_turma == turma.id && r.data == diaStr);
                    if (registroExistente) return;
                    data.registrosAula.push({ id: Date.now() + Math.random(), id_turma: turma.id, data: diaStr, conteudo: conteudoResumo.substring(0, 1000), cardsMaterialDigital: cardsMaterialDigitalSelecionados });
                    algumCriado = true;
                });
            });

            if (algumCriado) {
                persistirDados();
                if (typeof window.enviarDadosParaExtensao === 'function') window.enviarDadosParaExtensao(true);
            }
        } catch(er) { console.warn("Erro ao auto-salvar registro", er); }

    } catch (e) {
        alert('Erro ao formatar o documento: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}