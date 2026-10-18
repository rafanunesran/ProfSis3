// quiz_operacoes.js — AS CONTAS DO "NA MOSCA!", o quiz ao vivo em sala.
//
// POR QUE ISTO EXISTE SEPARADO
//   A tela (quiz.js) e a pagina do aluno (jogar.html) falam com o banco e desenham;
//   aqui mora so' o que e' conta: quanto vale uma resposta, quem esta' na frente, se
//   um quiz esta' pronto para ir ao ar, como a resposta da IA vira pergunta. Sem
//   navegador e sem banco, isto roda no Node e e' testado com numero (testes/teste-quiz.js).
//
// A PONTUACAO (regra propria do Na Mosca!)
//   Errou ou nao respondeu: 0.
//   Acertou: 500 pontos fixos + ate' 500 pela rapidez (cai em linha reta do primeiro
//   ao ultimo segundo do tempo da pergunta). Arredonda para dezena.
//   Sequencia: a partir do 2o acerto seguido, +50 por acerto da sequencia, no maximo +250.
//   "Vale dobro" multiplica o total da pergunta por 2; "Sem pontos" (e as enquetes) da' 0.

(function () {
'use strict';

const TIPOS = {
    multipla: { nome: 'Múltipla escolha', minOpcoes: 2, maxOpcoes: 4 },
    vf:       { nome: 'Verdadeiro ou falso', minOpcoes: 2, maxOpcoes: 2 },
    enquete:  { nome: 'Enquete (sem resposta certa)', minOpcoes: 2, maxOpcoes: 4 }
};
const TEMPOS = [5, 10, 20, 30, 45, 60, 90, 120];
const TEMPO_PADRAO = 20;
const MAX_PERGUNTAS = 60;
const MAX_TEXTO = 240;
const MAX_OPCAO = 90;
const MAX_APELIDO = 20;
const BASE_ACERTO = 500;
const BONUS_RAPIDEZ = 500;
const BONUS_SEQUENCIA = 50;
const TETO_SEQUENCIA = 250;

function texto(s, max) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 10000);
}

function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// PIN de 6 digitos que nao comeca com 0 (ninguem perde o zero ao ditar).
function gerarPin(aleatorio) {
    const r = aleatorio || Math.random;
    return String(100000 + Math.floor(r() * 900000));
}

function pinValido(pin) {
    return /^[1-9]\d{5}$/.test(String(pin || '').replace(/\s/g, ''));
}

function limparPin(pin) {
    return String(pin || '').replace(/\D/g, '').slice(0, 6);
}

// Apelido: sem espacos sobrando, sem simbolos que quebrem a tela, ate' 20 letras.
function limparApelido(s) {
    return texto(String(s || '').replace(/[<>"'`\\]/g, ''), MAX_APELIDO);
}

function novaPergunta(tipo) {
    const t = TIPOS[tipo] ? tipo : 'multipla';
    return {
        id: novoId(),
        tipo: t,
        texto: '',
        opcoes: t === 'vf' ? ['Verdadeiro', 'Falso'] : ['', '', '', ''],
        corretas: t === 'enquete' ? [] : [0],
        tempo: TEMPO_PADRAO,
        pontos: 1,           // 0 sem pontos, 1 normal, 2 vale dobro
        imagem: ''           // dataURL ja' reduzida (ver quiz.js)
    };
}

function novoQuiz() {
    return { id: novoId(), titulo: '', descricao: '', disciplina: '', serie: '', perguntas: [novaPergunta('multipla')] };
}

// Deixa uma pergunta em forma (vinda do editor, do banco ou da IA). Nunca lanca erro.
function normalizarPergunta(p) {
    p = p || {};
    const tipo = TIPOS[p.tipo] ? p.tipo : 'multipla';
    const lim = TIPOS[tipo];
    let opcoes = Array.isArray(p.opcoes) ? p.opcoes.map(o => texto(o, MAX_OPCAO)) : [];
    if (tipo === 'vf') opcoes = ['Verdadeiro', 'Falso'];
    opcoes = opcoes.slice(0, lim.maxOpcoes);
    while (opcoes.length < lim.minOpcoes) opcoes.push('');

    let corretas = Array.isArray(p.corretas) ? p.corretas : (p.correta != null ? [p.correta] : []);
    corretas = corretas.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < opcoes.length);
    corretas = Array.from(new Set(corretas)).sort((a, b) => a - b);
    if (tipo === 'enquete') corretas = [];

    let tempo = Number(p.tempo);
    if (!TEMPOS.includes(tempo)) {
        tempo = isFinite(tempo) && tempo > 0 ? TEMPOS.reduce((m, t) => Math.abs(t - tempo) < Math.abs(m - tempo) ? t : m, TEMPO_PADRAO) : TEMPO_PADRAO;
    }
    let pontos = Number(p.pontos);
    if (![0, 1, 2].includes(pontos)) pontos = 1;
    if (tipo === 'enquete') pontos = 0;

    const imagem = (typeof p.imagem === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(p.imagem)) ? p.imagem : '';
    return { id: p.id ? String(p.id) : novoId(), tipo, texto: texto(p.texto, MAX_TEXTO), opcoes, corretas, tempo, pontos, imagem };
}

function normalizarQuiz(q) {
    q = q || {};
    const perguntas = (Array.isArray(q.perguntas) ? q.perguntas : []).slice(0, MAX_PERGUNTAS).map(normalizarPergunta);
    return {
        id: q.id ? String(q.id) : novoId(),
        titulo: texto(q.titulo, 120),
        descricao: texto(q.descricao, 400),
        disciplina: texto(q.disciplina, 80),
        serie: texto(q.serie, 40),
        perguntas,
        criadoEm: Number(q.criadoEm) || Date.now(),
        atualizadoEm: Number(q.atualizadoEm) || Date.now()
    };
}

// O que impede o quiz de ir ao ar. Lista vazia = pronto.
function problemasDoQuiz(q) {
    const erros = [];
    if (!q || !texto(q.titulo)) erros.push('Dê um título ao quiz.');
    const ps = (q && q.perguntas) || [];
    if (!ps.length) erros.push('O quiz precisa de pelo menos uma pergunta.');
    ps.forEach((p, i) => {
        const n = 'Pergunta ' + (i + 1) + ': ';
        if (!texto(p.texto)) erros.push(n + 'escreva o enunciado.');
        const preenchidas = (p.opcoes || []).filter(o => texto(o)).length;
        if (preenchidas < 2) erros.push(n + 'preencha pelo menos duas alternativas.');
        if (p.tipo !== 'enquete') {
            if (!(p.corretas || []).length) erros.push(n + 'marque a alternativa certa.');
            else if ((p.corretas || []).some(c => !texto((p.opcoes || [])[c]))) erros.push(n + 'a alternativa marcada como certa está vazia.');
        }
    });
    return erros;
}

// A pergunta como vai para o banco publico da sala: SEM o gabarito, e sem alternativa vazia
// (o indice de cada uma e' guardado em `mapa`, para o gabarito sair certo depois).
function perguntaPublica(p) {
    const mapa = [];
    const opcoes = [];
    (p.opcoes || []).forEach((o, i) => { if (texto(o)) { mapa.push(i); opcoes.push(texto(o, MAX_OPCAO)); } });
    return {
        publica: { tipo: p.tipo, texto: p.texto, opcoes, tempo: p.tempo, pontos: p.pontos, imagem: p.imagem || '' },
        mapa,
        // o gabarito no indice PUBLICO (o que o aluno ve e responde)
        gabarito: (p.corretas || []).map(c => mapa.indexOf(c)).filter(i => i >= 0)
    };
}

// Pontos de UMA resposta. ms = quanto tempo depois de a pergunta abrir a resposta chegou.
function pontosDaResposta({ acertou, ms, tempoSeg, multiplicador, sequencia }) {
    const mult = multiplicador == null ? 1 : Number(multiplicador);
    if (!acertou || !mult) return 0;
    const total = Math.max(1, Number(tempoSeg) || TEMPO_PADRAO) * 1000;
    const usado = Math.min(1, Math.max(0, (Number(ms) || 0) / total));
    let pts = BASE_ACERTO + BONUS_RAPIDEZ * (1 - usado);
    const seq = Math.max(0, (Number(sequencia) || 1) - 1);
    pts += Math.min(TETO_SEQUENCIA, seq * BONUS_SEQUENCIA);
    return Math.round((pts * mult) / 10) * 10;
}

// Ordena os jogadores: mais pontos primeiro; empate, quem acertou mais; depois quem entrou antes.
function ranking(jogadores) {
    return (jogadores || []).slice().sort((a, b) =>
        (Number(b.pontos) || 0) - (Number(a.pontos) || 0) ||
        (Number(b.acertos) || 0) - (Number(a.acertos) || 0) ||
        String(a.apelido || '').localeCompare(String(b.apelido || ''))
    ).map((j, i) => Object.assign({}, j, { posicao: i + 1 }));
}

// Fecha uma pergunta: recebe o estado de cada jogador e as respostas que chegaram, devolve
// o estado novo de cada um + a distribuicao das escolhas. Funcao pura: o host chama, grava.
//   jogadores: { [id]: { apelido, pontos, acertos, sequencia } }
//   respostas: [{ jogadorId, escolha, ms }]
function fecharPergunta({ jogadores, respostas, publica, gabarito }) {
    const dist = (publica.opcoes || []).map(() => 0);
    const porJogador = {};
    (respostas || []).forEach(r => {
        if (!r || porJogador[r.jogadorId]) return;          // vale a primeira
        const e = Number(r.escolha);
        if (!Number.isInteger(e) || e < 0 || e >= dist.length) return;
        porJogador[r.jogadorId] = r;
        dist[e]++;
    });
    const enquete = publica.tipo === 'enquete';
    const novos = {};
    const detalhes = {};
    Object.keys(jogadores || {}).forEach(id => {
        const j = jogadores[id] || {};
        const r = porJogador[id];
        const respondeu = !!r;
        const acertou = !enquete && respondeu && (gabarito || []).includes(Number(r.escolha));
        const sequencia = acertou ? (Number(j.sequencia) || 0) + 1 : (enquete ? (Number(j.sequencia) || 0) : 0);
        const ganhou = enquete ? 0 : pontosDaResposta({ acertou, ms: r && r.ms, tempoSeg: publica.tempo, multiplicador: publica.pontos, sequencia });
        novos[id] = {
            apelido: j.apelido,
            pontos: (Number(j.pontos) || 0) + ganhou,
            acertos: (Number(j.acertos) || 0) + (acertou ? 1 : 0),
            sequencia
        };
        detalhes[id] = { respondeu, escolha: respondeu ? Number(r.escolha) : null, acertou, ganhou, ms: respondeu ? Math.max(0, Number(r.ms) || 0) : null };
    });
    return { jogadores: novos, detalhes, distribuicao: dist };
}

// O relatorio da partida: por pergunta e por jogador.
//   historico: [{ publica, gabarito, detalhes, distribuicao }]   (uma entrada por pergunta)
function montarRelatorio({ titulo, jogadores, historico, data }) {
    const rank = ranking(Object.keys(jogadores || {}).map(id => Object.assign({ id }, jogadores[id])));
    const perguntas = (historico || []).map((h, i) => {
        const ds = Object.values(h.detalhes || {});
        const responderam = ds.filter(d => d.respondeu);
        const acertaram = ds.filter(d => d.acertou);
        const tempos = responderam.map(d => d.ms).filter(n => n != null);
        return {
            numero: i + 1,
            texto: h.publica.texto,
            tipo: h.publica.tipo,
            opcoes: h.publica.opcoes,
            gabarito: h.gabarito || [],
            distribuicao: h.distribuicao || [],
            responderam: responderam.length,
            acertaram: acertaram.length,
            jogadores: ds.length,
            pctAcerto: (h.publica.tipo === 'enquete' || !ds.length) ? null : Math.round(100 * acertaram.length / ds.length),
            tempoMedioSeg: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length / 100) / 10 : null
        };
    });
    const avaliadas = perguntas.filter(p => p.pctAcerto != null);
    const linhas = rank.map(j => {
        const respostas = (historico || []).map(h => (h.detalhes || {})[j.id] || null);
        return {
            posicao: j.posicao, apelido: j.apelido, pontos: j.pontos || 0, acertos: j.acertos || 0,
            avaliadas: avaliadas.length,
            semResposta: respostas.filter(r => !r || !r.respondeu).length,
            respostas
        };
    });
    return {
        titulo: titulo || 'Quiz', data: data || new Date().toISOString(),
        jogadores: linhas, perguntas,
        mediaAcerto: avaliadas.length ? Math.round(avaliadas.reduce((a, p) => a + p.pctAcerto, 0) / avaliadas.length) : null,
        // As 3 que a turma mais errou: e' por onde o professor retoma a aula.
        maisErradas: avaliadas.slice().sort((a, b) => a.pctAcerto - b.pctAcerto).slice(0, 3).map(p => p.numero)
    };
}

function csvCelula(v) {
    const s = String(v == null ? '' : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// CSV com ponto e virgula (abre direto no Excel em portugues).
function relatorioCsv(rel) {
    const letra = i => (i == null || i < 0) ? '' : String.fromCharCode(65 + i);
    const cab = ['Posição', 'Apelido', 'Pontos', 'Acertos'].concat(rel.perguntas.map(p => 'P' + p.numero));
    const linhas = [cab];
    rel.jogadores.forEach(j => {
        linhas.push([j.posicao, j.apelido, j.pontos, j.acertos + '/' + j.avaliadas].concat(j.respostas.map((r, i) => {
            if (!r || !r.respondeu) return '-';
            const p = rel.perguntas[i];
            return letra(r.escolha) + (p.tipo === 'enquete' ? '' : (r.acertou ? ' (certo)' : ' (errado)'));
        })));
    });
    linhas.push([]);
    linhas.push(['Pergunta', 'Enunciado', 'Gabarito', '% de acerto', 'Responderam', 'Tempo médio (s)']);
    rel.perguntas.forEach(p => linhas.push([
        'P' + p.numero, p.texto, p.gabarito.map(letra).join(' '),
        p.pctAcerto == null ? 'enquete' : p.pctAcerto + '%', p.responderam + '/' + p.jogadores,
        p.tempoMedioSeg == null ? '' : String(p.tempoMedioSeg).replace('.', ',')
    ]));
    return '﻿' + linhas.map(l => l.map(csvCelula).join(';')).join('\r\n');
}

// A resposta da IA ({perguntas:[...]}, ou a lista direto) vira perguntas do editor.
// Aceita `correta` como numero, letra ("B") ou o proprio texto da alternativa.
function perguntasDaIA(resposta) {
    let lista = Array.isArray(resposta) ? resposta : (resposta && Array.isArray(resposta.perguntas) ? resposta.perguntas : []);
    return lista.slice(0, MAX_PERGUNTAS).map(item => {
        if (!item || typeof item !== 'object') return null;
        const tipoIA = String(item.tipo || '').toLowerCase();
        const tipo = /v.?f|verdadeiro/.test(tipoIA) ? 'vf' : 'multipla';
        let opcoes = Array.isArray(item.opcoes || item.alternativas) ? (item.opcoes || item.alternativas) : [];
        if (tipo === 'vf') opcoes = ['Verdadeiro', 'Falso'];
        opcoes = opcoes.map(o => texto(typeof o === 'object' && o ? (o.texto || o.text || '') : o, MAX_OPCAO)).filter(Boolean).slice(0, 4);
        let c = item.correta != null ? item.correta : item.resposta;
        let idx = -1;
        if (typeof c === 'number') idx = c;
        else if (typeof c === 'boolean') idx = c ? 0 : 1;
        else if (typeof c === 'string') {
            const s = c.trim();
            if (/^[A-Da-d]$/.test(s)) idx = s.toUpperCase().charCodeAt(0) - 65;
            else if (/^\d$/.test(s)) idx = Number(s);
            else if (tipo === 'vf' && /^(v|verdadeir|true|sim)/i.test(s)) idx = 0;
            else if (tipo === 'vf' && /^(f|fals|false|n[aã]o)/i.test(s)) idx = 1;
            else idx = opcoes.findIndex(o => o.toLowerCase() === s.toLowerCase());
        }
        const p = normalizarPergunta({ tipo, texto: item.texto || item.pergunta || item.enunciado, opcoes, corretas: idx >= 0 ? [idx] : [], tempo: item.tempo || TEMPO_PADRAO });
        return (p.texto && p.opcoes.filter(Boolean).length >= 2 && p.corretas.length) ? p : null;
    }).filter(Boolean);
}

function promptGerarPerguntas({ tema, serie, disciplina, quantidade, tipos, material }) {
    const n = Math.min(20, Math.max(1, Number(quantidade) || 8));
    const tiposTxt = tipos === 'vf' ? 'todas de verdadeiro ou falso' : (tipos === 'misto' ? 'misture múltipla escolha (4 alternativas) e algumas de verdadeiro ou falso' : 'todas de múltipla escolha com 4 alternativas');
    return 'Você prepara perguntas para um quiz ao vivo em sala de aula, de uma escola pública brasileira.' +
        (disciplina ? ' Disciplina: ' + texto(disciplina, 80) + '.' : '') +
        (serie ? ' Série/ano: ' + texto(serie, 40) + '.' : '') +
        ' Tema: ' + texto(tema || 'conteúdo do material abaixo', 300) + '.' +
        ' Crie ' + n + ' perguntas, ' + tiposTxt + '. Enunciados curtos (até 200 caracteres), alternativas curtas (até 70 caracteres),' +
        ' uma única alternativa correta, distratores plausíveis, linguagem adequada à idade. Não use "todas as anteriores" nem "nenhuma das anteriores".' +
        ' Responda APENAS com um JSON válido, sem markdown, no formato exato:' +
        ' {"perguntas": [{"tipo": "multipla" ou "vf", "texto": "enunciado", "opcoes": ["A", "B", "C", "D"], "correta": índice da alternativa certa começando em 0, "tempo": segundos (10, 20 ou 30)}]}.' +
        ' Para verdadeiro ou falso use opcoes ["Verdadeiro", "Falso"] e correta 0 (verdadeiro) ou 1 (falso).' +
        (material ? '\n\nBaseie as perguntas no MATERIAL abaixo (da Biblioteca do professor):\n' + String(material).slice(0, 6000) : '');
}

const QUIZOPS = {
    TIPOS, TEMPOS, TEMPO_PADRAO, MAX_PERGUNTAS, MAX_APELIDO,
    novoId, gerarPin, pinValido, limparPin, limparApelido,
    novaPergunta, novoQuiz, normalizarPergunta, normalizarQuiz, problemasDoQuiz,
    perguntaPublica, pontosDaResposta, ranking, fecharPergunta,
    montarRelatorio, relatorioCsv, perguntasDaIA, promptGerarPerguntas
};

if (typeof window !== 'undefined') window.QUIZOPS = QUIZOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = QUIZOPS;

})();
