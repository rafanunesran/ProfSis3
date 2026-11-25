// avisos_ia.js — "📥 Aviso da gestão": o professor (ou a gestão) cola a mensagem que chegou pelo
// WhatsApp, ou o print dela, e a IA monta a lista do que lançar no EdiProf:
//   - compromisso (reunião, conselho, ATPC, entrega...) com data, hora e lembrete;
//   - lembrete (prazo, "não esquecer de...");
//   - estudante faltoso ou com atestado médico.
// Tudo é COMPARTILHADO COM A EQUIPE por padrão (pedido do Rafael, 25/11/2026): quem lançou pode
// desmarcar "Compartilhar com a equipe" num compromisso/lembrete para ficar só seu.
// NADA é salvo antes de a pessoa conferir item por item na tela de revisão.
//
// Onde fica cada coisa:
//   data.compromissos  — compromissos/lembretes só da própria pessoa (campo pessoal, vai cifrado).
//   data.compromissosEquipe / data.registrosEquipe — no PROFESSOR: o que ele compartilhou com a
//                        equipe (compromissos/lembretes e faltosos/atestados). Vão cifrados no
//                        recorte dele para a escola (listaescola.js recorteDoProfessor); os colegas
//                        leem com lerContribuicoesDaEscola e a gestão traz os faltosos/atestados
//                        para Registros (trazerRegistrosEquipeDosProfessores).
//   data.eventosEscola — na GESTÃO: compromissos publicados para todos os professores da escola
//                        (campo de nuvem, em claro: por isso o título não leva nome de estudante).
//                        No PROFESSOR é a cópia que chega da gestão (app.js, junto com o mural).
//   Faltoso            — data.registrosAdministrativos {tipo:'Faltoso'}, igual ao "Novo registro"
//                        da gestão (gestor.js salvarRegistroGestao).
//
// Privacidade: vai para a IA só o que a pessoa colou (texto/foto) e os NOMES DAS TURMAS. A lista de
// estudantes não sai do aparelho: a IA devolve o nome como leu e a busca do estudante é feita aqui.

const LEMBRETE_OPCOES_AVISO = [
    ['nenhum', 'Sem lembrete'], ['no_dia', 'No dia'], ['1_dia', '1 dia antes'],
    ['2_dias', '2 dias antes'], ['1_semana', '1 semana antes']
];
const DIAS_LEMBRETE_AVISO = { no_dia: 0, '1_dia': 1, '2_dias': 2, '1_semana': 7 };
const MAX_FOTOS_AVISO = 4;
// Itens que viram registro administrativo de um estudante (gestor.js salvarRegistroGestao).
const TIPOS_ESTUDANTE_AVISO = { faltoso: 'Faltoso', atestado: 'Atestado' };

let avisoIA = { texto: '', imagens: [], itens: [] };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function escAviso(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Data de hoje no fuso do aparelho (getTodayString usa UTC e, depois das 21h no Brasil, já é amanhã).
function hojeLocalAviso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function somarDiasAviso(iso, n) {
    const [a, m, d] = String(iso).split('-').map(Number);
    const dt = new Date(a, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const DIAS_SEMANA_AVISO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function formatarDataAviso(iso, comSemana) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'sem data';
    const [a, m, d] = iso.split('-').map(Number);
    const sem = DIAS_SEMANA_AVISO[new Date(a, m - 1, d).getDay()].slice(0, 3);
    return (comSemana === false ? '' : sem + ', ') + `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function normAviso(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// "7º Ano A", "7A", "7° A - Manhã" → "7a". Serve para casar a turma escrita na mensagem.
function chaveTurmaAviso(nome) {
    const n = normAviso(nome).replace(/\b(ano|anos|serie|series|em|ef|turma|manha|tarde|noite|integral)\b/g, ' ').replace(/\s+/g, '');
    const m = /(\d{1,2})o?([a-z])\b|(\d{1,2})o?([a-z])$/.exec(n) || /(\d{1,2})([a-z])/.exec(n);
    if (m) return (m[1] || m[3]) + (m[2] || m[4]);
    return n;
}

function ehGestaoAviso() { return typeof currentViewMode !== 'undefined' && currentViewMode === 'gestor'; }

function estudanteAtivoAviso(e) { return e && (!e.status || String(e.status).trim().toLowerCase() === 'ativo'); }

function nomeTurmaAviso(idTurma) {
    const t = ((typeof data !== 'undefined' && data && data.turmas) || []).find(x => x.id == idTurma);
    return t ? t.nome : '';
}

// ---------------------------------------------------------------------------
// Procura do estudante (no aparelho)
// ---------------------------------------------------------------------------
const PALAVRAS_FRACAS_AVISO = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function procurarEstudantesAviso(nomeEscrito, turmaEscrita) {
    const toks = normAviso(nomeEscrito).split(' ').filter(t => t.length >= 2 && !PALAVRAS_FRACAS_AVISO.has(t));
    if (!toks.length) return [];
    const chaveT = turmaEscrita ? chaveTurmaAviso(turmaEscrita) : '';
    const lista = [];
    ((data && data.estudantes) || []).filter(estudanteAtivoAviso).forEach(e => {
        const etoks = normAviso(e.nome_completo).split(' ');
        const bate = toks.filter(t => etoks.some(x => x === t || (t.length >= 3 && x.startsWith(t))));
        if (!bate.length) return;
        const todos = bate.length === toks.length;
        if (!todos && bate.length < 2) return;
        let pontos = (bate.length / toks.length) * 10 + (todos ? 5 : 0);
        if (etoks[0] === toks[0]) pontos += 2;
        const turmaNome = nomeTurmaAviso(e.id_turma);
        if (chaveT && turmaNome && chaveTurmaAviso(turmaNome) === chaveT) pontos += 4;
        lista.push({ id: e.id, nome: e.nome_completo, turma: turmaNome, idTurma: e.id_turma, pontos, todos });
    });
    lista.sort((a, b) => b.pontos - a.pontos || compararNomes(a.nome, b.nome));
    return lista.slice(0, 6);
}

function escolherEstudanteAviso(cands) {
    if (!cands.length || !cands[0].todos) return '';
    if (cands.length > 1 && cands[0].pontos - cands[1].pontos < 2) return '';
    return String(cands[0].id);
}

// ---------------------------------------------------------------------------
// Compromissos guardados
// ---------------------------------------------------------------------------
// O que os COLEGAS publicaram (lido do recorte de cada um). Fica só na memória.
let equipeAviso = { quando: 0, compromissos: [], registros: [], carregando: null };
const EQUIPE_AVISO_CACHE_MS = 60000;

function meuIdAviso() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.id != null) ? String(currentUser.id) : ''; }

async function carregarEquipeAviso(forcar) {
    if (typeof lerContribuicoesDaEscola !== 'function') return false;
    if (!forcar && Date.now() - equipeAviso.quando < EQUIPE_AVISO_CACHE_MS) return false;
    if (equipeAviso.carregando) return equipeAviso.carregando;
    equipeAviso.carregando = (async () => {
        try {
            const r = await lerContribuicoesDaEscola(forcar ? { forcar: true } : undefined);
            const eu = meuIdAviso();
            const comps = [], regs = [];
            ((r && r.lista) || []).forEach(c => {
                if (String(c.autorId) === eu) return;
                ((c.dados && c.dados.compromissosEquipe) || []).forEach(x => { if (x && x.id != null) comps.push(Object.assign({}, x, { autorNome: x.autorNome || c.autorNome || '' })); });
                ((c.dados && c.dados.registrosEquipe) || []).forEach(x => { if (x && x.id != null) regs.push(Object.assign({}, x, { origem: 'equipe', autorNome: x.autorNome || c.autorNome || '' })); });
            });
            const antes = JSON.stringify([equipeAviso.compromissos, equipeAviso.registros]);
            equipeAviso.compromissos = comps; equipeAviso.registros = regs; equipeAviso.quando = Date.now();
            const mudou = antes !== JSON.stringify([comps, regs]);
            if (typeof data !== 'undefined' && data && !ehGestaoAviso()) data.registrosAdministrativos = juntarRegistrosEquipeAviso(data.registrosAdministrativos || []);
            return mudou;
        } catch (e) { console.warn('[Aviso] não deu para ler o que a equipe publicou:', e); equipeAviso.quando = Date.now(); return false; }
        finally { equipeAviso.carregando = null; }
    })();
    return equipeAviso.carregando;
}

// Professor: junta aos registros que vieram da gestão os faltosos/atestados que ele e os colegas
// lançaram e que a gestão ainda não trouxe (nem excluiu). Chamada por enriquecerRegistrosComNome.
function juntarRegistrosEquipeAviso(registros) {
    if (!Array.isArray(registros) || typeof data === 'undefined' || !data || ehGestaoAviso()) return registros;
    const removidos = new Set((data.registrosEquipeRemovidos || []).map(String));
    const ids = new Set(registros.map(x => String(x.id)));
    const extras = [...(data.registrosEquipe || []), ...equipeAviso.registros]
        .filter(x => x && x.id != null && !ids.has(String(x.id)) && !removidos.has(String(x.id)) && (ids.add(String(x.id)), true))
        .map(x => Object.assign({}, x, { origem: 'equipe' }));
    return extras.length ? [...registros, ...extras] : registros;
}

function todosCompromissosAviso() {
    const meus = ((data && data.compromissos) || []).map(c => Object.assign({}, c, { _origem: 'meu', _campo: 'compromissos' }));
    const meusEquipe = ((data && data.compromissosEquipe) || []).map(c => Object.assign({}, c, { _origem: 'equipeMeu', _campo: 'compromissosEquipe' }));
    const escola = ((data && data.eventosEscola) || []).map(c => Object.assign({}, c, { _origem: 'escola', _campo: ehGestaoAviso() ? 'eventosEscola' : '' }));
    const colegas = equipeAviso.compromissos.map(c => Object.assign({}, c, { _origem: 'equipe', _campo: '' }));
    return [...meus, ...meusEquipe, ...escola, ...colegas].sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || String(a.inicio || '').localeCompare(String(b.inicio || '')));
}

// O lembrete está "tocando" hoje? (de N dias antes até o próprio dia)
function lembreteAtivoAviso(c, hoje) {
    if (!c || c.feito || !c.data) return false;
    const dias = DIAS_LEMBRETE_AVISO[c.lembrete];
    if (dias == null) return false;
    return hoje >= somarDiasAviso(c.data, -dias) && hoje <= c.data;
}

function parecidoAviso(a, b) {
    const na = normAviso(a), nb = normAviso(b);
    if (!na || !nb) return false;
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    const ta = new Set(na.split(' ').filter(t => t.length > 3));
    const tb = nb.split(' ').filter(t => t.length > 3);
    if (!ta.size || !tb.length) return false;
    const comuns = tb.filter(t => ta.has(t)).length;
    return comuns / Math.min(ta.size, tb.length) >= 0.6;
}

function jaExisteCompromissoAviso(item) {
    return todosCompromissosAviso().find(c => c.data === item.data && parecidoAviso(c.titulo, item.titulo));
}

// ---------------------------------------------------------------------------
// Tela 1: colar o aviso
// ---------------------------------------------------------------------------
function garantirModalAvisoIA() {
    if (document.getElementById('modalAvisoIA')) return;
    const modal = document.createElement('div');
    modal.id = 'modalAvisoIA';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:760px;">
            <div class="modal-header">
                <h2 id="avisoIATitulo">📥 Aviso da gestão</h2>
                <button class="close-btn" onclick="closeModal('modalAvisoIA')">×</button>
            </div>
            <div id="avisoIACorpo"></div>
        </div>`;
    document.body.appendChild(modal);
}

function abrirAvisoGestaoIA(inicial) {
    garantirModalAvisoIA();
    avisoIA = { texto: (inicial && inicial.texto) || '', imagens: (inicial && inicial.imagens) || [], itens: [] };
    renderEntradaAvisoIA();
    showModal('modalAvisoIA');
}

function renderEntradaAvisoIA() {
    const corpo = document.getElementById('avisoIACorpo');
    if (!corpo) return;
    document.getElementById('avisoIATitulo').textContent = '📥 Aviso da gestão';
    const gestao = ehGestaoAviso();
    corpo.innerHTML = `
        <p style="margin-top:0; color:#3d4759; font-size:14px;">
            Cole aqui a mensagem que chegou${gestao ? '' : ' da gestão'} pelo WhatsApp, ou anexe o print.
            A IA monta a lista do que lançar: compromissos, lembretes, estudantes faltosos e atestados.
            Tudo fica <strong>compartilhado com a equipe</strong> (professores e gestão), a não ser o que você desmarcar.
            <strong>Nada é salvo antes de você conferir.</strong>
        </p>
        <textarea id="avisoIATexto" rows="7" style="width:100%; box-sizing:border-box;" placeholder="Ex.: Bom dia, professores! Reunião pedagógica quinta (27) às 18h30 na sala dos professores. Entregar as notas do 4º bimestre até dia 5/12."
            oninput="avisoIA.texto = this.value">${escAviso(avisoIA.texto)}</textarea>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:8px 0;">
            <label class="btn btn-sm btn-secondary" style="cursor:pointer; margin:0;">🖼️ Anexar print
                <input type="file" accept="image/*" multiple style="display:none;" onchange="adicionarFotosAviso(this.files); this.value='';">
            </label>
            <span style="font-size:12px; color:#5f6b7f;">Até ${MAX_FOTOS_AVISO} fotos. Também dá para colar a imagem (Ctrl+V) na caixa de texto.</span>
        </div>
        <div id="avisoIAFotos" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
        <p style="font-size:12px; color:#5f6b7f; background:#f6f8fb; border:1px solid #e3e8ef; border-radius:6px; padding:8px;">
            🔒 O texto e as fotos vão para o servidor de IA do EdiProf. A lista de estudantes não sai do aparelho:
            a IA só devolve os nomes que leu na mensagem, e o EdiProf procura o estudante aqui.
        </p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="abrirRevisaoAvisoIA([itemVazioAviso('compromisso')])">✍️ Criar compromisso sem IA</button>
            <button class="btn btn-primary" id="btnLerAvisoIA" onclick="lerAvisoComIA()">✨ Ler com IA</button>
        </div>`;
    const ta = document.getElementById('avisoIATexto');
    ta.addEventListener('paste', (ev) => {
        const arqs = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter(f => /^image\//.test(f.type));
        if (arqs.length) { ev.preventDefault(); adicionarFotosAviso(arqs); }
    });
    renderFotosAviso();
}

function renderFotosAviso() {
    const caixa = document.getElementById('avisoIAFotos');
    if (!caixa) return;
    caixa.innerHTML = avisoIA.imagens.map((im, i) => `
        <div style="position:relative; width:84px; height:84px; border:1px solid #cdd5e1; border-radius:6px; overflow:hidden; background:#fff;">
            <img src="${im.src}" alt="Print ${i + 1}" style="width:100%; height:100%; object-fit:cover;">
            <button type="button" onclick="removerFotoAviso(${i})" title="Tirar esta foto" aria-label="Tirar esta foto"
                style="position:absolute; top:2px; right:2px; border:none; border-radius:50%; width:22px; height:22px; background:rgba(0,0,0,.65); color:#fff; cursor:pointer; line-height:22px; padding:0;">×</button>
        </div>`).join('');
}

function removerFotoAviso(i) { avisoIA.imagens.splice(i, 1); renderFotosAviso(); }

// Reduz a foto (lado maior 1600 px, JPEG) para o pedido ficar leve e a IA ainda ler as letras.
function reduzirFotoAviso(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const lado = 1600;
            const esc = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * esc));
            c.height = Math.max(1, Math.round(img.naturalHeight * esc));
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            const src = c.toDataURL('image/jpeg', 0.85);
            resolve({ mime: 'image/jpeg', dados: src.split(',')[1], src });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('não deu para abrir a imagem')); };
        img.src = url;
    });
}

async function adicionarFotosAviso(arquivos) {
    const lista = Array.from(arquivos || []).filter(f => /^image\//.test(f.type || 'image/'));
    for (const f of lista) {
        if (avisoIA.imagens.length >= MAX_FOTOS_AVISO) { alert(`Dá para mandar até ${MAX_FOTOS_AVISO} fotos de uma vez.`); break; }
        try { avisoIA.imagens.push(await reduzirFotoAviso(f)); }
        catch (e) { alert('Não deu para abrir uma das imagens: ' + e.message); }
    }
    renderFotosAviso();
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------
function montarPromptAvisoIA(texto, nFotos) {
    const hoje = hojeLocalAviso();
    const [a, m, d] = hoje.split('-').map(Number);
    const semana = DIAS_SEMANA_AVISO[new Date(a, m - 1, d).getDay()];
    const turmas = ((data && data.turmas) || []).map(t => t.nome).filter(Boolean);
    const gestao = ehGestaoAviso();
    return `Você ajuda ${gestao ? 'a gestão (direção/coordenação)' : 'um(a) professor(a)'} de uma escola pública a lançar no sistema escolar o que foi avisado numa mensagem de WhatsApp${nFotos ? ` (junto vão ${nFotos} print(s) da conversa: leia o texto das imagens)` : ''}.
Hoje é ${semana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a} (${hoje}).
Turmas da escola: ${turmas.length ? turmas.join(', ') : '(não informadas)'}.

Devolva APENAS um JSON neste formato: {"acoes": [ ... ]}
Cada ação é um destes objetos:
1) Estudante faltoso (um item POR estudante citado como faltoso, com muitas faltas, em busca ativa ou que precisa de contato por faltas):
   {"tipo":"faltoso","nome":"nome do estudante exatamente como está escrito","turma":"turma como está escrita, ou \\"\\"","observacao":"detalhe curto do aviso, ou \\"\\""}
1b) Estudante com atestado médico / falta justificada por documento (um item POR estudante):
   {"tipo":"atestado","nome":"nome como está escrito","turma":"turma como está escrita, ou \\"\\"","dataInicio":"AAAA-MM-DD do primeiro dia do afastamento, ou \\"\\"","dias":número de dias (se disser "até dia X", conte os dias corridos incluindo o primeiro e o último; se não disser, 1),"observacao":"curto, ou \\"\\" (não escreva doença/CID)"}
2) Compromisso com dia marcado (reunião, ATPC, conselho de classe, formação, evento, prova, plantão, entrega com hora):
   {"tipo":"compromisso","titulo":"curto, até 60 letras","data":"AAAA-MM-DD","inicio":"HH:MM ou \\"\\"","fim":"HH:MM ou \\"\\"","local":"ou \\"\\"","descricao":"o que levar/fazer, curto, ou \\"\\"","paraTodos":true ou false,"lembrete":"nenhum|no_dia|1_dia|2_dias|1_semana"}
   paraTodos = true quando o aviso vale para a equipe (quase sempre: reunião, ATPC, conselho, prazo de notas, evento da escola); false só se for claramente algo pessoal de quem recebeu.
3) Lembrete (prazo ou tarefa sem hora: entregar diário, lançar notas, preencher formulário, levar documento):
   {"tipo":"lembrete","titulo":"o que fazer, curto","data":"AAAA-MM-DD (o prazo ou o dia de lembrar)","inicio":"","paraTodos":true ou false,"lembrete":"no_dia|1_dia|2_dias|1_semana"}

Regras:
- Converta datas relativas ("amanhã", "quinta", "dia 28", "semana que vem") a partir de hoje, sempre para a data futura mais próxima. Sem ano escrito: use a próxima ocorrência dessa data.
- Se a data não estiver clara, deixe "data": "" (não invente).
- Horas no formato 24h: "18h30" vira "18:30".
- Lembrete padrão: compromisso no mesmo dia ou no dia seguinte = "no_dia"; mais longe = "1_dia"; prazo de entrega = "2_dias".
- No título, na descrição e no local de compromissos e lembretes NÃO escreva nomes de estudantes (vão para a agenda de todos). Nomes de estudantes só nos itens "faltoso" e "atestado".
- Ignore saudações, figurinhas e conversa que não pede nada.
- Se não houver nada para lançar, devolva {"acoes": []}.

Mensagem:
"""
${String(texto || '').slice(0, 12000) || '(sem texto: leia os prints)'}
"""`;
}

function itemVazioAviso(tipo) {
    return {
        uid: 'i' + Math.random().toString(36).slice(2, 9), tipo, usar: true,
        titulo: '', data: tipo === 'lembrete' ? hojeLocalAviso() : '', inicio: '', fim: '', local: '', descricao: '',
        paraTodos: true, lembrete: tipo === 'lembrete' ? '1_dia' : 'no_dia',
        nome: '', turma: '', observacao: '', estudanteId: '', candidatos: [], dataInicio: hojeLocalAviso(), dias: 1, avisos: []
    };
}

const DATA_OK_AVISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T12:00:00'));
const HORA_OK_AVISO = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');

// Confere e arruma o que a IA devolveu. Exportada para o teste.
function normalizarAcoesAvisoIA(resposta) {
    const acoes = (resposta && Array.isArray(resposta.acoes)) ? resposta.acoes : [];
    const gestao = ehGestaoAviso();
    const itens = [];
    acoes.forEach(a => {
        if (!a || typeof a !== 'object') return;
        const tipo = String(a.tipo || '').toLowerCase();
        if (TIPOS_ESTUDANTE_AVISO[tipo]) {
            const nome = String(a.nome || '').trim();
            if (!nome) return;
            const dias = Math.max(1, Math.min(120, parseInt(a.dias, 10) || 1));
            const inicio = DATA_OK_AVISO(a.dataInicio) ? a.dataInicio : '';
            const it = itemVazioAviso(tipo);
            if (tipo === 'atestado') { it.dias = dias; if (inicio) it.dataInicio = inicio; }
            it.nome = nome.slice(0, 120);
            it.turma = String(a.turma || '').trim().slice(0, 40);
            it.observacao = String(a.observacao || '').trim().slice(0, 300);
            it.candidatos = procurarEstudantesAviso(it.nome, it.turma);
            it.estudanteId = escolherEstudanteAviso(it.candidatos);
            if (!it.candidatos.length) { it.usar = false; it.avisos.push('Não achei esse nome na lista de estudantes. Escolha na lista abaixo.'); }
            else if (!it.estudanteId) it.avisos.push('Achei mais de um nome parecido. Confira quem é.');
            const regs = data.registrosAdministrativos || [];
            const jaTem = it.estudanteId && (tipo === 'faltoso'
                ? regs.some(r => r.tipo === 'Faltoso' && !r.arquivado && String(r.estudanteId) === String(it.estudanteId))
                : regs.some(r => r.tipo === 'Atestado' && !r.arquivado && String(r.estudanteId) === String(it.estudanteId) && r.data === it.dataInicio));
            if (jaTem) { it.usar = false; it.avisos.push(tipo === 'faltoso' ? 'Este estudante já está marcado como faltoso.' : 'Já existe atestado deste estudante com essa data.'); }
            itens.push(it);
            return;
        }
        if (tipo !== 'compromisso' && tipo !== 'lembrete') return;
        const it = itemVazioAviso(tipo);
        it.titulo = String(a.titulo || '').trim().slice(0, 120);
        if (!it.titulo) return;
        it.data = DATA_OK_AVISO(a.data) ? a.data : '';
        it.inicio = HORA_OK_AVISO(a.inicio) ? a.inicio : '';
        it.fim = HORA_OK_AVISO(a.fim) ? a.fim : '';
        it.local = String(a.local || '').trim().slice(0, 120);
        it.descricao = String(a.descricao || '').trim().slice(0, 500);
        it.paraTodos = a.paraTodos !== false;
        it.lembrete = DIAS_LEMBRETE_AVISO[a.lembrete] != null || a.lembrete === 'nenhum' ? a.lembrete : (tipo === 'lembrete' ? '1_dia' : 'no_dia');
        if (!it.data) it.avisos.push('A IA não achou a data. Preencha antes de salvar.');
        else if (it.data < hojeLocalAviso()) it.avisos.push('Essa data já passou. Confira.');
        const igual = it.data && jaExisteCompromissoAviso(it);
        if (igual) {
            it.usar = false;
            it.avisos.push(igual._origem === 'escola' && !gestao ? 'A gestão já colocou isso na agenda da escola.'
                : igual._origem === 'equipe' ? `${igual.autorNome || 'Um colega'} já colocou isso na agenda da equipe.` : 'Parece que isso já está na agenda.');
        }
        itens.push(it);
    });
    return itens;
}

async function lerAvisoComIA() {
    const ta = document.getElementById('avisoIATexto');
    if (ta) avisoIA.texto = ta.value;
    if (!avisoIA.texto.trim() && !avisoIA.imagens.length) return alert('Cole a mensagem ou anexe o print do aviso.');
    const btn = document.getElementById('btnLerAvisoIA');
    const rotulo = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Lendo o aviso... ⏳'; }
    try {
        const resp = await chamarIAEstruturada(montarPromptAvisoIA(avisoIA.texto, avisoIA.imagens.length), btn,
            { imagens: avisoIA.imagens.map(i => ({ mime: i.mime, dados: i.dados })) });
        const itens = normalizarAcoesAvisoIA(resp);
        if (!itens.length) {
            alert('A IA não achou nada para lançar nesse aviso (nenhum compromisso, prazo, faltoso ou atestado). Se tiver, você pode criar à mão em "✍️ Criar compromisso sem IA".');
            return;
        }
        abrirRevisaoAvisoIA(itens);
    } catch (e) {
        alert(e && e.message ? e.message : String(e));
    } finally {
        if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = rotulo; }
    }
}

// ---------------------------------------------------------------------------
// Tela 2: revisão item por item
// ---------------------------------------------------------------------------
function abrirRevisaoAvisoIA(itens) {
    garantirModalAvisoIA();
    avisoIA.itens = itens;
    if (!document.getElementById('modalAvisoIA').classList.contains('active')) showModal('modalAvisoIA');
    renderRevisaoAvisoIA();
}

function mudarItemAviso(uid, campo, valor) {
    const it = avisoIA.itens.find(x => x.uid === uid);
    if (!it) return;
    it[campo] = valor;
    if (campo === 'usar' || campo === 'paraTodos') renderRevisaoAvisoIA();
}

function adicionarItemAviso(tipo) { avisoIA.itens.push(itemVazioAviso(tipo)); renderRevisaoAvisoIA(); }

function opcoesEstudanteAviso(it) {
    const cands = it.candidatos || [];
    const idsCand = new Set(cands.map(c => String(c.id)));
    const porTurma = {};
    ((data && data.estudantes) || []).filter(estudanteAtivoAviso).forEach(e => {
        if (idsCand.has(String(e.id))) return;
        const t = nomeTurmaAviso(e.id_turma) || 'Sem turma';
        (porTurma[t] = porTurma[t] || []).push(e);
    });
    const sel = (id) => String(id) === String(it.estudanteId) ? ' selected' : '';
    let html = `<option value="">— escolha o estudante —</option>`;
    if (cands.length) html += `<optgroup label="Parecidos com &quot;${escAviso(it.nome)}&quot;">${cands.map(c => `<option value="${escAviso(c.id)}"${sel(c.id)}>${escAviso(c.nome)}${c.turma ? ' — ' + escAviso(c.turma) : ''}</option>`).join('')}</optgroup>`;
    Object.keys(porTurma).sort(compararNomes).forEach(t => {
        html += `<optgroup label="${escAviso(t)}">${porTurma[t].sort((a, b) => compararNomes(a.nome_completo, b.nome_completo)).map(e => `<option value="${escAviso(e.id)}"${sel(e.id)}>${escAviso(e.nome_completo)}</option>`).join('')}</optgroup>`;
    });
    return html;
}

function htmlItemAviso(it, i) {
    const gestao = ehGestaoAviso();
    const u = escAviso(it.uid);
    const campo = (rotulo, conteudo, largo) => `<label style="display:block; font-size:12px; color:#3d4759; margin:0; ${largo ? 'grid-column:1 / -1;' : ''}">${rotulo}${conteudo}</label>`;
    const inp = (nome, tipo, extra) => `<input type="${tipo}" value="${escAviso(it[nome])}" oninput="mudarItemAviso('${u}', '${nome}', this.value)" style="width:100%; box-sizing:border-box;" ${extra || ''}>`;
    const rot = { faltoso: '🚸 Estudante faltoso', atestado: '🩺 Atestado médico', compromisso: '📅 Compromisso', lembrete: '🔔 Lembrete' }[it.tipo];
    let corpo = '';
    if (TIPOS_ESTUDANTE_AVISO[it.tipo]) {
        corpo = `
            <p style="font-size:12px; color:#5f6b7f; margin:0 0 6px; grid-column:1 / -1;">Na mensagem: <strong>${escAviso(it.nome)}</strong>${it.turma ? ' · turma ' + escAviso(it.turma) : ''}</p>
            ${campo('Estudante', `<select onchange="mudarItemAviso('${u}', 'estudanteId', this.value)" style="width:100%;">${opcoesEstudanteAviso(it)}</select>`, true)}
            ${campo(it.tipo === 'atestado' ? 'Primeiro dia' : 'Desde', inp('dataInicio', 'date'))}
            ${it.tipo === 'atestado' ? campo('Dias de atestado', inp('dias', 'number', 'min="1" max="120"')) : ''}
            ${campo('Observação', inp('observacao', 'text', 'placeholder="opcional"'), it.tipo === 'atestado')}
            <p style="grid-column:1 / -1; font-size:12px; color:#5f6b7f; margin:0;">👥 ${gestao ? 'Vai para Registros e chega a todos os professores.' : 'Vai para a gestão (Registros) e aparece para os professores da escola.'}</p>`;
    } else {
        corpo = `
            ${campo(it.tipo === 'lembrete' ? 'O que lembrar' : 'Título', inp('titulo', 'text'), true)}
            ${campo(it.tipo === 'lembrete' ? 'Prazo / dia' : 'Dia', inp('data', 'date'))}
            ${campo('Lembrar', `<select onchange="mudarItemAviso('${u}', 'lembrete', this.value)" style="width:100%;">${LEMBRETE_OPCOES_AVISO.map(([v, r]) => `<option value="${v}"${it.lembrete === v ? ' selected' : ''}>${r}</option>`).join('')}</select>`)}
            ${it.tipo === 'compromisso' ? `
                ${campo('Começa', inp('inicio', 'time'))}
                ${campo('Termina', inp('fim', 'time'))}
                ${campo('Local', inp('local', 'text', 'placeholder="opcional"'), true)}
                ${campo('Detalhes', inp('descricao', 'text', 'placeholder="opcional"'), true)}` : ''}
            <label style="grid-column:1 / -1; display:flex; gap:6px; align-items:center; font-size:13px; margin:2px 0 0; color:#1b4488;">
                <input type="checkbox" ${it.paraTodos ? 'checked' : ''} onchange="mudarItemAviso('${u}', 'paraTodos', this.checked)" style="width:auto;">
                👥 Compartilhar com a equipe <span style="color:#5f6b7f;">(${gestao ? 'aparece na agenda de todos os professores' : 'professores e gestão veem'})</span></label>`;
    }
    return `
        <div class="aviso-ia-item" data-uid="${u}" style="border:1px solid ${it.usar ? '#9fb7e3' : '#e3e8ef'}; background:${it.usar ? '#fff' : '#f6f8fb'}; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
            <label style="display:flex; gap:8px; align-items:center; font-weight:bold; color:#1c2536; margin:0 0 6px;">
                <input type="checkbox" class="aviso-ia-usar" ${it.usar ? 'checked' : ''} onchange="mudarItemAviso('${u}', 'usar', this.checked)" style="width:auto;">
                ${rot}
            </label>
            ${(it.avisos || []).map(t => `<div style="font-size:12px; color:#9c4221; background:#fffaf0; border-radius:4px; padding:4px 6px; margin-bottom:6px;">⚠️ ${escAviso(t)}</div>`).join('')}
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; ${it.usar ? '' : 'opacity:.6;'}">${corpo}</div>
        </div>`;
}

function renderRevisaoAvisoIA() {
    const corpo = document.getElementById('avisoIACorpo');
    if (!corpo) return;
    document.getElementById('avisoIATitulo').textContent = '✅ Confira antes de salvar';
    const marcados = avisoIA.itens.filter(i => i.usar).length;
    const gestao = ehGestaoAviso();
    corpo.innerHTML = `
        <p style="margin-top:0; color:#3d4759; font-size:14px;">Desmarque o que não quiser e corrija o que a IA leu errado. Só os itens marcados são salvos.</p>
        <div id="avisoIAItens">${avisoIA.itens.map(htmlItemAviso).join('')}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <button class="btn btn-sm btn-secondary" onclick="adicionarItemAviso('compromisso')">+ Compromisso</button>
            <button class="btn btn-sm btn-secondary" onclick="adicionarItemAviso('lembrete')">+ Lembrete</button>
            <button class="btn btn-sm btn-secondary" onclick="adicionarItemAviso('faltoso')">+ Faltoso</button>
            <button class="btn btn-sm btn-secondary" onclick="adicionarItemAviso('atestado')">+ Atestado</button>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between;">
            <button class="btn btn-secondary" onclick="renderEntradaAvisoIA()">← Voltar ao aviso</button>
            <button class="btn btn-primary" id="btnSalvarAvisoIA" onclick="salvarAvisoIA()" ${marcados ? '' : 'disabled'}>💾 Salvar ${marcados} ${marcados === 1 ? 'item' : 'itens'}</button>
        </div>`;
}

function salvarAvisoIA() {
    const gestao = ehGestaoAviso();
    const marcados = avisoIA.itens.filter(i => i.usar);
    if (!marcados.length) return alert('Marque pelo menos um item.');
    for (const it of marcados) {
        if (TIPOS_ESTUDANTE_AVISO[it.tipo]) {
            if (!it.estudanteId) return alert(`Escolha o estudante de "${it.nome || it.tipo}".`);
            if (!DATA_OK_AVISO(it.dataInicio)) return alert(`Preencha o primeiro dia (${it.tipo}).`);
            if (it.tipo === 'atestado' && !(parseInt(it.dias, 10) >= 1)) return alert('Preencha quantos dias de atestado.');
        } else {
            if (!String(it.titulo || '').trim()) return alert('Há um item sem título.');
            if (!DATA_OK_AVISO(it.data)) return alert(`Preencha o dia de "${it.titulo}".`);
        }
    }
    const compartilhados = marcados.filter(i => TIPOS_ESTUDANTE_AVISO[i.tipo] || i.paraTodos);
    const descrever = (i) => TIPOS_ESTUDANTE_AVISO[i.tipo]
        ? `• ${i.tipo === 'atestado' ? 'Atestado' : 'Faltoso'}: ${((data.estudantes || []).find(e => String(e.id) === String(i.estudanteId)) || {}).nome_completo || i.nome}`
        : `• ${formatarDataAviso(i.data)} — ${i.titulo}`;
    if (compartilhados.length && !confirm(`${compartilhados.length} item(ns) vão ficar visíveis para a EQUIPE da escola (professores e gestão):\n\n${compartilhados.map(descrever).join('\n')}\n\nConfirmar?`)) return;

    const agora = new Date().toISOString();
    const autor = (typeof currentUser !== 'undefined' && currentUser && (currentUser.nome || currentUser.email)) || '';
    let nFalt = 0, nAtest = 0, nMeus = 0, nEscola = 0, base = Date.now();
    marcados.forEach(it => {
        if (TIPOS_ESTUDANTE_AVISO[it.tipo]) {
            const est = (data.estudantes || []).find(e => String(e.id) === String(it.estudanteId));
            if (!est) return;
            if (!data.registrosAdministrativos) data.registrosAdministrativos = [];
            const atestado = it.tipo === 'atestado';
            const registro = {
                id: base++, turmaId: est.id_turma, estudanteId: est.id, tipo: TIPOS_ESTUDANTE_AVISO[it.tipo],
                data: it.dataInicio, dias: atestado ? Math.max(1, parseInt(it.dias, 10) || 1) : 0,
                descricao: it.observacao || '', origem: 'aviso-ia'
            };
            if (!gestao) {
                // Professor: a turma da escola (masterId) e o nome vão junto, para a gestão e os colegas casarem.
                const t = (data.turmas || []).find(x => x.id == est.id_turma);
                if (t && t.masterId != null && t.masterId !== '') registro.turmaId = t.masterId;
                Object.assign(registro, { origem: 'equipe', nomeEstudante: est.nome_completo, autorNome: autor, criadoEm: agora });
                if (!data.registrosEquipe) data.registrosEquipe = [];
                data.registrosEquipe.push(registro);
            }
            data.registrosAdministrativos.push(registro);
            if (atestado) nAtest++; else nFalt++;
            return;
        }
        const reg = {
            id: (typeof novoId === 'function') ? novoId() : String(base++), tipo: it.tipo,
            titulo: String(it.titulo).trim(), data: it.data,
            inicio: HORA_OK_AVISO(it.inicio) ? it.inicio : '', fim: HORA_OK_AVISO(it.fim) ? it.fim : '',
            local: String(it.local || '').trim(), descricao: String(it.descricao || '').trim(),
            lembrete: it.lembrete || 'nenhum', origem: 'aviso-ia', criadoEm: agora, atualizadoEm: agora
        };
        if (it.paraTodos) {
            reg.autor = autor; reg.autorNome = autor;
            const campo = gestao ? 'eventosEscola' : 'compromissosEquipe';
            if (!data[campo]) data[campo] = [];
            data[campo].push(reg); nEscola++;
        } else {
            if (!data.compromissos) data.compromissos = [];
            data.compromissos.push(reg); nMeus++;
        }
    });
    persistirDados();
    closeModal('modalAvisoIA');
    const partes = [];
    if (nEscola) partes.push(`${nEscola} na agenda da equipe`);
    if (nMeus) partes.push(`${nMeus} só na sua agenda`);
    if (nFalt) partes.push(`${nFalt} faltoso(s)`);
    if (nAtest) partes.push(`${nAtest} atestado(s)`);
    if (!gestao && (nFalt || nAtest)) partes.push('a gestão recebe os faltosos/atestados em Registros quando abrir o painel');
    alert('Pronto! Salvo: ' + partes.join(', ') + '.');
    atualizarTelasAviso();
}

function atualizarTelasAviso() {
    const ativo = (id) => { const el = document.getElementById(id); return el && el.classList.contains('active'); };
    try { if (ativo('dashboard') && typeof renderDashboard === 'function') renderDashboard(); } catch (e) { console.warn(e); }
    try { if (ativo('registrosGestor') && typeof renderRegistrosGestor === 'function') renderRegistrosGestor(); } catch (e) { console.warn(e); }
    try { renderCompromissosAgenda(); } catch (e) { console.warn(e); }
}

// ---------------------------------------------------------------------------
// Listas (Início, Minha Agenda, painel da gestão)
// ---------------------------------------------------------------------------
function linhaCompromissoAviso(c, opcoes) {
    opcoes = opcoes || {};
    const hoje = hojeLocalAviso();
    const hora = c.inicio ? (c.fim ? `${c.inicio}–${c.fim}` : c.inicio) : '';
    const podeApagar = !!c._campo;
    const tocando = lembreteAtivoAviso(c, hoje);
    const id = escAviso(String(c.id)).replace(/'/g, '');
    return `
        <div class="compromisso-linha" style="display:flex; gap:8px; align-items:flex-start; padding:6px 0; border-bottom:1px solid #eef2f7; ${c.feito ? 'opacity:.55;' : ''}">
            <div style="min-width:74px; font-size:12px; color:${c.data === hoje ? '#c53030' : '#1b4488'}; font-weight:bold;">${c.data === hoje ? 'Hoje' : formatarDataAviso(c.data)}${hora ? `<br><span style="font-weight:normal; color:#5f6b7f;">${escAviso(hora)}</span>` : ''}</div>
            <div style="flex:1; font-size:13px; color:#1c2536;">
                ${c.tipo === 'lembrete' ? '🔔 ' : ''}${c.feito ? '<s>' : ''}${escAviso(c.titulo)}${c.feito ? '</s>' : ''}
                ${c._origem === 'escola' && !ehGestaoAviso() ? '<span style="font-size:11px; background:#e8f0fe; color:#1b4488; border-radius:4px; padding:1px 5px; margin-left:4px;">🏫 gestão</span>' : ''}
                ${c._origem === 'equipe' ? `<span style="font-size:11px; background:#e6fffa; color:#234e52; border-radius:4px; padding:1px 5px; margin-left:4px;">👥 ${escAviso(c.autorNome || 'equipe')}</span>` : ''}
                ${c._origem === 'equipeMeu' || (c._origem === 'escola' && ehGestaoAviso()) ? '<span style="font-size:11px; background:#e6fffa; color:#234e52; border-radius:4px; padding:1px 5px; margin-left:4px;">👥 compartilhado</span>' : ''}
                ${tocando && !opcoes.semSino ? '<span style="font-size:11px; background:#fefcbf; color:#744210; border-radius:4px; padding:1px 5px; margin-left:4px;">lembrete</span>' : ''}
                ${c.local || c.descricao ? `<div style="font-size:12px; color:#5f6b7f;">${escAviso([c.local, c.descricao].filter(Boolean).join(' · '))}</div>` : ''}
            </div>
            <div style="display:flex; gap:4px;">
                ${c._origem === 'meu' && c.tipo === 'lembrete' ? `<button class="btn btn-xs btn-secondary" style="padding:1px 6px;" title="${c.feito ? 'Desfazer' : 'Feito'}" onclick="marcarFeitoCompromissoAviso('${id}')">${c.feito ? '↺' : '✓'}</button>` : ''}
                ${podeApagar ? `<button class="btn btn-xs btn-danger" style="padding:1px 6px;" title="Apagar" onclick="apagarCompromissoAviso('${id}', '${c._campo}')">×</button>` : ''}
            </div>
        </div>`;
}

function marcarFeitoCompromissoAviso(id) {
    const c = (data.compromissos || []).find(x => String(x.id) === String(id));
    if (!c) return;
    c.feito = !c.feito;
    c.atualizadoEm = new Date().toISOString();
    persistirDados();
    atualizarTelasAviso();
}

// campo = de qual lista é: compromissos (só meu), compromissosEquipe (compartilhei), eventosEscola
// (gestão). O que veio da gestão ou de um colega só quem lançou apaga (aqui é cópia e voltaria).
function apagarCompromissoAviso(id, campo) {
    if (campo === 'eventosEscola' && !ehGestaoAviso()) return;
    if (['compromissos', 'compromissosEquipe', 'eventosEscola'].indexOf(campo) === -1) return;
    const lista = data[campo] || [];
    const c = lista.find(x => String(x.id) === String(id));
    if (!c) return;
    const msg = campo !== 'compromissos' ? `Apagar "${c.titulo}" da agenda de toda a equipe?` : `Apagar "${c.titulo}"?`;
    if (!confirm(msg)) return;
    data[campo] = lista.filter(x => String(x.id) !== String(id));
    persistirDados();
    atualizarTelasAviso();
}

// Lê o que a equipe publicou e, se mudou, redesenha só os blocos de compromissos.
function pedirEquipeAviso() {
    setTimeout(() => {
        carregarEquipeAviso().then(mudou => { if (mudou) redesenharBlocosAviso(); }).catch(() => {});
    }, 0);
}

function redesenharBlocosAviso() {
    const d = document.getElementById('compromissosDashboard');
    if (d) d.outerHTML = htmlCompromissosDashboard(true);
    renderCompromissosAgenda(true);
    const g = document.getElementById('agendaEscolaGestor');
    if (g) g.innerHTML = htmlAgendaEscolaGestor(true);
}

// Bloco que entra no card "Agenda do Dia" do Início do professor.
function htmlCompromissosDashboard(semCarregar) {
    if (!semCarregar) pedirEquipeAviso();
    const hoje = hojeLocalAviso();
    const ate = somarDiasAviso(hoje, 7);
    const todos = todosCompromissosAviso();
    const deHoje = todos.filter(c => c.data === hoje && !c.feito);
    const lembretes = todos.filter(c => c.data > hoje && lembreteAtivoAviso(c, hoje));
    const idsMostrados = new Set([...deHoje, ...lembretes].map(c => c._origem + c.id));
    const proximos = todos.filter(c => c.data > hoje && c.data <= ate && !c.feito && !idsMostrados.has(c._origem + c.id)).slice(0, 5);
    const bloco = (titulo, lista, op) => lista.length ? `<div style="font-size:12px; font-weight:bold; color:#5f6b7f; margin:8px 0 2px;">${titulo}</div>${lista.map(c => linhaCompromissoAviso(c, op)).join('')}` : '';
    const vazio = !deHoje.length && !lembretes.length && !proximos.length;
    return `
        <div id="compromissosDashboard" style="margin-top:12px; border-top:1px solid #e3e8ef; padding-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                <strong style="font-size:14px; color:#1c2536;">📌 Compromissos e lembretes</strong>
                <button class="btn btn-sm btn-primary" onclick="abrirAvisoGestaoIA()" title="Cole a mensagem ou o print da gestão e a IA lança na agenda">📥 Aviso da gestão</button>
            </div>
            ${vazio ? '<p style="font-size:12px; color:#7a869a; margin:6px 0 0;">Nada para os próximos 7 dias.</p>' : ''}
            ${bloco('Hoje', deHoje)}
            ${bloco('🔔 Lembretes', lembretes, { semSino: true })}
            ${bloco('Próximos 7 dias', proximos)}
        </div>`;
}

// Minha Agenda (Documentos › Minha Agenda): a lista completa, com os passados recentes.
function renderCompromissosAgenda(semCarregar) {
    const caixa = document.getElementById('compromissosAgenda');
    if (!caixa) return;
    if (!semCarregar) pedirEquipeAviso();
    const hoje = hojeLocalAviso();
    const todos = todosCompromissosAviso();
    const futuros = todos.filter(c => c.data >= hoje);
    const passados = todos.filter(c => c.data < hoje && c.data >= somarDiasAviso(hoje, -30)).reverse();
    caixa.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <h3 style="margin:0;">📌 Compromissos e lembretes</h3>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-sm btn-secondary" onclick="abrirRevisaoAvisoIA([itemVazioAviso('compromisso')])">+ Novo</button>
                    <button class="btn btn-sm btn-primary" onclick="abrirAvisoGestaoIA()">📥 Aviso da gestão (IA)</button>
                </div>
            </div>
            ${futuros.length ? futuros.map(c => linhaCompromissoAviso(c)).join('') : '<p style="font-size:13px; color:#7a869a;">Nenhum compromisso marcado. Cole um aviso da gestão em "📥 Aviso da gestão" e a IA lança aqui.</p>'}
            ${passados.length ? `<details style="margin-top:8px;"><summary style="cursor:pointer; font-size:12px; color:#5f6b7f;">Últimos 30 dias (${passados.length})</summary>${passados.map(c => linhaCompromissoAviso(c, { semSino: true })).join('')}</details>` : ''}
        </div>`;
}

// Card do painel da gestão: o que foi publicado para todos os professores.
function htmlAgendaEscolaGestor(semCarregar) {
    if (!semCarregar) pedirEquipeAviso();
    const hoje = hojeLocalAviso();
    const lista = todosCompromissosAviso().filter(c => c.data >= hoje);
    return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
            <h2 style="margin:0;">📅 Agenda da escola</h2>
            <button class="btn btn-sm btn-primary" onclick="abrirAvisoGestaoIA()">📥 Lançar aviso com IA</button>
        </div>
        <p style="font-size:12px; color:#5f6b7f; margin:4px 0 6px;">👥 = compartilhado com a equipe (o nome diz qual professor lançou). Sem 👥 é só seu.</p>
        <div id="listaAgendaEscolaGestor" style="max-height:260px; overflow-y:auto;">
            ${lista.length ? lista.map(c => linhaCompromissoAviso(c)).join('') : '<p class="empty-state">Nenhum compromisso marcado.</p>'}
        </div>`;
}

// ---------------------------------------------------------------------------
// Compartilhar do WhatsApp direto para o EdiProf (app instalado no Android pelo navegador):
// o manifest tem share_target → o sw.js guarda texto e fotos no cache e abre
// index.html?aviso-compartilhado=1. Aqui pegamos e abrimos a tela já preenchida.
// ---------------------------------------------------------------------------
async function lerCompartilhadoAviso() {
    if (!('caches' in window)) return null;
    const cache = await caches.open('ediprof-compartilhado');
    const rTexto = await cache.match('./compartilhado/texto');
    const rQtd = await cache.match('./compartilhado/qtd');
    const texto = rTexto ? await rTexto.text() : '';
    const qtd = rQtd ? parseInt(await rQtd.text(), 10) || 0 : 0;
    const blobs = [];
    for (let i = 0; i < Math.min(qtd, MAX_FOTOS_AVISO); i++) {
        const r = await cache.match('./compartilhado/foto-' + i);
        if (r) blobs.push(await r.blob());
    }
    const chaves = await cache.keys();
    await Promise.all(chaves.map(k => cache.delete(k)));
    const imagens = [];
    for (const b of blobs) { try { imagens.push(await reduzirFotoAviso(b)); } catch (_) { /* foto ilegível: segue sem ela */ } }
    return { texto, imagens };
}

(function esperarCompartilhadoAviso() {
    if (typeof window === 'undefined' || !/[?&]aviso-compartilhado=1/.test(window.location.search)) return;
    let tentativas = 0;
    const tique = async () => {
        tentativas++;
        const pronto = typeof currentUser !== 'undefined' && currentUser && window.dadosCarregados && typeof data !== 'undefined' && data;
        if (!pronto) { if (tentativas < 240) setTimeout(tique, 500); return; }
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('aviso-compartilhado');
            history.replaceState(null, '', url.pathname + url.search + url.hash);
            const compartilhado = await lerCompartilhadoAviso();
            abrirAvisoGestaoIA(compartilhado || {});
        } catch (e) { console.warn('[Aviso] não deu para abrir o que foi compartilhado:', e); abrirAvisoGestaoIA(); }
    };
    setTimeout(tique, 800);
})();
