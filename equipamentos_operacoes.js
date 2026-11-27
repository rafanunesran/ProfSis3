// equipamentos_operacoes.js — AS CONTAS DA AGENDA DE EQUIPAMENTOS (notebooks, tablets...).
//
// POR QUE ISTO EXISTE SEPARADO
//   A tela (equipamentos.js) e a pagina do estudante (equipamento.html) falam com o banco
//   e desenham; aqui mora so' o que e' conta: o que esta' livre num horario, se uma reserva
//   bate com outra, quem esta' com qual equipamento depois das trocas, o relatorio do dia.
//   Sem navegador e sem banco, isto roda no Node e e' testado com numero
//   (testes/teste-equipamentos.js).
//
// O QUE FICA ONDE (ver equipamentos.js para o desenho inteiro)
//   app_data/equip_school_<escola>                  cadastro: { equipamentos: [...] }
//   app_data/equip_reservas_school_<escola>_<AAAA-MM> { reservas: [...] }  (um por mes)
//   app_data/equip_uso_school_<escola>_<AAAA-MM-DD>   { usos: { <reservaId>: { registros } } }
//   equip_sessoes/<codigo>                          o link temporario da aula (sem nome de
//     registros/<id>                                estudante: so' numero da chamada)
//
// PRIVACIDADE
//   Nada daqui leva nome de estudante. O estudante aparece como o NUMERO dele na chamada
//   da turma (ordem alfabetica dos ativos, a mesma da lista da turma). Quem transforma
//   numero em nome e' o aparelho do professor, na hora de mostrar.

(function () {
'use strict';

const TIPOS = {
    notebook: { nome: 'Notebook', icone: '💻' },
    tablet:   { nome: 'Tablet', icone: '📱' },
    chromebook: { nome: 'Chromebook', icone: '💻' },
    outro:    { nome: 'Outro', icone: '🔌' }
};

// Sem I, L, O, U, 0 e 1 (o estudante erra ao copiar da lousa).
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const TAM_CODIGO = 6;
const MAX_ROTULO = 40;

// Quanto o link vale depois do fim da aula (o professor pode fechar antes).
const FOLGA_LINK_MIN = 20;

function novoId(prefixo) {
    let s = '';
    const bytes = aleatorios(10);
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] % 36).toString(36);
    return (prefixo || 'e') + Date.now().toString(36) + s;
}

function aleatorios(n) {
    const b = new Uint8Array(n);
    const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (c) c.getRandomValues(b);
    else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
}

function gerarCodigo() {
    const b = aleatorios(TAM_CODIGO);
    let s = '';
    for (let i = 0; i < b.length; i++) s += ALFABETO_CODIGO[b[i] % ALFABETO_CODIGO.length];
    return s;
}

function limparCodigo(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TAM_CODIGO);
}

function codigoValido(c) {
    return new RegExp('^[' + ALFABETO_CODIGO + ']{' + TAM_CODIGO + '}$').test(String(c || ''));
}

function limparRotulo(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_ROTULO);
}

// --- Datas e horas --------------------------------------------------------------

// "AAAA-MM-DD" na hora LOCAL (toISOString daria o dia seguinte depois das 21h no Brasil).
function dataLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function horaLocal(d) {
    d = d || new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function mesDe(dataStr) { return String(dataStr || '').slice(0, 7); }

function horaValida(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')); }

// Dois intervalos [ini, fim) se cruzam? (07:00–07:50 e 07:50–08:40 NAO se cruzam)
function cruza(aIni, aFim, bIni, bFim) {
    return String(aIni) < String(bFim) && String(bIni) < String(aFim);
}

// --- Cadastro -------------------------------------------------------------------

// "Notebook", 1, 30, "Carrinho 1" -> Notebook 01 ... Notebook 30.
// Quem ja' existe com o mesmo rotulo nao e' duplicado.
function gerarLote(opcoes, existentes) {
    const o = opcoes || {};
    const tipo = TIPOS[o.tipo] ? o.tipo : 'notebook';
    const base = limparRotulo(o.base) || TIPOS[tipo].nome;
    const de = Math.max(0, parseInt(o.de, 10) || 1);
    const ate = Math.min(de + 199, Math.max(de, parseInt(o.ate, 10) || de));
    const largura = Math.max(2, String(ate).length);
    const grupo = limparRotulo(o.grupo);
    const jaTem = new Set((existentes || []).map(e => normalizar(e.rotulo)));
    const novos = [];
    for (let n = de; n <= ate; n++) {
        const rotulo = limparRotulo(base + ' ' + String(n).padStart(largura, '0'));
        if (jaTem.has(normalizar(rotulo))) continue;
        jaTem.add(normalizar(rotulo));
        novos.push({ id: novoId('eq'), rotulo, tipo, grupo, situacao: 'ok' });
    }
    return novos;
}

function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Ordem natural: "Notebook 2" antes de "Notebook 10"; agrupa por grupo e tipo.
function ordenarEquipamentos(lista) {
    return (lista || []).slice().sort((a, b) =>
        String(a.grupo || '').localeCompare(String(b.grupo || ''), 'pt-BR', { numeric: true, sensitivity: 'base' })
        || String(a.tipo || '').localeCompare(String(b.tipo || ''))
        || String(a.rotulo || '').localeCompare(String(b.rotulo || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

function funciona(e) { return !!e && (e.situacao || 'ok') === 'ok'; }

// "Notebook 01–12, Tablet 03" — o resumo curto que vai abaixo da turma.
function resumirIds(ids, equipamentos) {
    const porId = {};
    (equipamentos || []).forEach(e => { porId[e.id] = e; });
    const itens = (ids || []).map(id => porId[id]).filter(Boolean);
    if (!itens.length) return '';
    const grupos = {};
    ordenarEquipamentos(itens).forEach(e => {
        const m = String(e.rotulo).match(/^(.*?)(\d+)$/);
        const base = m ? m[1].trim() : e.rotulo;
        const num = m ? m[2] : null;
        if (!grupos[base]) grupos[base] = [];
        grupos[base].push(num);
    });
    return Object.keys(grupos).map(base => {
        const nums = grupos[base];
        if (nums.some(n => n === null)) return base + (nums.length > 1 ? ' (' + nums.length + ')' : '');
        // junta sequencias: 01,02,03,05 -> 01–03, 05
        const partes = [];
        let ini = nums[0], ant = nums[0];
        for (let i = 1; i <= nums.length; i++) {
            const n = nums[i];
            if (n != null && parseInt(n, 10) === parseInt(ant, 10) + 1) { ant = n; continue; }
            partes.push(ini === ant ? ini : ini + '–' + ant);
            ini = n; ant = n;
        }
        return base + ' ' + partes.join(', ');
    }).join(' · ');
}

// --- Reservas e disponibilidade -------------------------------------------------

function normalizarReserva(r) {
    const x = r || {};
    return {
        id: String(x.id || novoId('rs')),
        data: String(x.data || ''),
        inicio: String(x.inicio || ''),
        fim: String(x.fim || ''),
        profUid: String(x.profUid || ''),
        profNome: limparRotulo(x.profNome) || 'Professor(a)',
        turmaId: x.turmaId == null ? '' : String(x.turmaId),
        turmaNome: limparRotulo(x.turmaNome),
        equipIds: Array.from(new Set((x.equipIds || []).map(String))),
        reservaTroca: Array.from(new Set((x.reservaTroca || []).map(String))),
        obs: String(x.obs || '').slice(0, 300),
        criadoEm: x.criadoEm || Date.now()
    };
}

function problemasDaReserva(r) {
    const p = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) p.push('Escolha o dia.');
    if (!horaValida(r.inicio) || !horaValida(r.fim)) p.push('Escolha o horário (início e fim).');
    else if (r.inicio >= r.fim) p.push('O fim precisa ser depois do início.');
    if (!(r.equipIds || []).length) p.push('Escolha pelo menos um equipamento.');
    return p;
}

// Ids ocupados por OUTRAS reservas que cruzam o horario (inclui a reserva para troca).
function ocupadosNoHorario(reservas, dataStr, ini, fim, ignorarId) {
    const ocupado = {};
    (reservas || []).forEach(r => {
        if (!r || r.data !== dataStr || (ignorarId && r.id === ignorarId)) return;
        if (!cruza(ini, fim, r.inicio, r.fim)) return;
        (r.equipIds || []).concat(r.reservaTroca || []).forEach(id => { if (!ocupado[id]) ocupado[id] = r; });
    });
    return ocupado;
}

// Cada equipamento com a situacao naquele horario: 'livre' | 'reservado' | 'defeito'.
function disponibilidade(equipamentos, reservas, dataStr, ini, fim, ignorarId) {
    const ocupado = ocupadosNoHorario(reservas, dataStr, ini, fim, ignorarId);
    return ordenarEquipamentos(equipamentos).map(e => ({
        equip: e,
        estado: !funciona(e) ? 'defeito' : (ocupado[e.id] ? 'reservado' : 'livre'),
        reserva: ocupado[e.id] || null
    }));
}

// Contagem por tipo: { notebook: { total, livres, defeito } }
function contarPorTipo(disp) {
    const c = {};
    (disp || []).forEach(d => {
        const t = d.equip.tipo || 'outro';
        if (!c[t]) c[t] = { total: 0, livres: 0, defeito: 0, reservados: 0 };
        c[t].total++;
        if (d.estado === 'livre') c[t].livres++;
        else if (d.estado === 'defeito') c[t].defeito++;
        else c[t].reservados++;
    });
    return c;
}

// Escolhe automaticamente `qtd` livres do tipo (na ordem natural, preferindo o mesmo grupo
// para o professor buscar tudo num carrinho so') e mais `troca` para a reserva de troca.
function escolherLivres(disp, tipo, qtd, troca) {
    const livres = (disp || []).filter(d => d.estado === 'livre' && (!tipo || d.equip.tipo === tipo)).map(d => d.equip);
    const porGrupo = {};
    livres.forEach(e => { (porGrupo[e.grupo || ''] = porGrupo[e.grupo || ''] || []).push(e); });
    const total = (qtd || 0) + (troca || 0);
    // um grupo que sozinho da' conta vem primeiro; senao, a ordem natural
    const gruposQueDao = Object.keys(porGrupo).filter(g => porGrupo[g].length >= total);
    const fila = gruposQueDao.length ? porGrupo[gruposQueDao[0]].concat(livres.filter(e => (e.grupo || '') !== gruposQueDao[0])) : livres;
    const escolhidos = fila.slice(0, qtd || 0).map(e => e.id);
    const reserva = fila.slice(qtd || 0, (qtd || 0) + (troca || 0)).map(e => e.id);
    return { equipIds: escolhidos, reservaTroca: reserva, faltaram: Math.max(0, total - fila.length) };
}

// Quantos de reserva para troca o sistema sugere: 1 a cada 10, no minimo 1 (se houver).
function trocaSugerida(qtd) {
    const n = parseInt(qtd, 10) || 0;
    if (n <= 0) return 0;
    return Math.max(1, Math.round(n / 10));
}

// Reserva que tem equipamento que quebrou DEPOIS de reservada: o sistema propoe a troca
// por um livre do mesmo tipo. Devolve [{ de, para }] (para = null quando nao ha' livre).
function trocasPrevistas(reserva, equipamentos, reservas) {
    const porId = {};
    (equipamentos || []).forEach(e => { porId[e.id] = e; });
    const quebrados = (reserva.equipIds || []).filter(id => porId[id] && !funciona(porId[id]));
    if (!quebrados.length) return [];
    const disp = disponibilidade(equipamentos, reservas, reserva.data, reserva.inicio, reserva.fim, reserva.id);
    const ja = new Set((reserva.equipIds || []).concat(reserva.reservaTroca || []));
    // primeiro usa a propria reserva de troca da reserva
    const daTroca = (reserva.reservaTroca || []).filter(id => porId[id] && funciona(porId[id]));
    const livres = disp.filter(d => d.estado === 'livre' && !ja.has(d.equip.id)).map(d => d.equip);
    return quebrados.map(id => {
        const tipo = porId[id].tipo;
        let para = null;
        const iT = daTroca.findIndex(x => porId[x].tipo === tipo);
        if (iT >= 0) { para = daTroca[iT]; daTroca.splice(iT, 1); }
        else {
            const iL = livres.findIndex(e => e.tipo === tipo);
            if (iL >= 0) { para = livres[iL].id; livres.splice(iL, 1); }
        }
        return { de: id, para };
    });
}

function aplicarTrocas(reserva, trocas) {
    const r = Object.assign({}, reserva);
    const ids = (r.equipIds || []).slice();
    let troca = (r.reservaTroca || []).slice();
    (trocas || []).forEach(t => {
        if (!t.para) return;
        const i = ids.indexOf(t.de);
        if (i >= 0) ids[i] = t.para;
        troca = troca.filter(x => x !== t.para);
    });
    r.equipIds = ids;
    r.reservaTroca = troca;
    return r;
}

// --- Uso na aula (o que o estudante informa) -----------------------------------

// registro: { num, equip, tipo: 'pegou'|'defeito'|'troca'|'devolveu', anterior?, em (ms), origem }
// Devolve, por numero, o equipamento ATUAL e o historico de trocas, na ordem do tempo.
function consolidarUso(registros) {
    const porNum = {};
    (registros || []).slice()
        .filter(r => r && r.num != null)
        .sort((a, b) => (a.em || 0) - (b.em || 0))
        .forEach(r => {
            const n = parseInt(r.num, 10);
            if (!(n > 0)) return;
            const atual = porNum[n] || (porNum[n] = { num: n, equip: '', trocas: [], defeitos: [], origem: r.origem || 'aluno', em: r.em || 0 });
            if (r.tipo === 'devolveu') { atual.equip = ''; atual.em = r.em || 0; return; }
            const antes = r.anterior || atual.equip || '';
            if (antes && antes !== r.equip) {
                atual.trocas.push({ de: antes, para: r.equip, defeito: r.tipo === 'defeito', em: r.em || 0 });
                if (r.tipo === 'defeito') atual.defeitos.push(antes);
            }
            atual.equip = String(r.equip || '');
            atual.origem = r.origem || atual.origem;
            atual.em = r.em || atual.em;
        });
    return Object.keys(porNum).map(k => porNum[k]).sort((a, b) => a.num - b.num);
}

// Equipamentos relatados com defeito nos registros (ids, sem repetir).
function defeitosRelatados(registros) {
    const s = [];
    (registros || []).forEach(r => {
        if (r && r.tipo === 'defeito' && r.anterior && s.indexOf(r.anterior) === -1) s.push(r.anterior);
    });
    return s;
}

// Dois estudantes dizendo que estao com o mesmo equipamento: provavel erro de toque.
function conflitosDeUso(consolidado) {
    const por = {};
    (consolidado || []).forEach(c => { if (c.equip) (por[c.equip] = por[c.equip] || []).push(c.num); });
    return Object.keys(por).filter(k => por[k].length > 1).map(k => ({ equip: k, nums: por[k] }));
}

// Nome do equipamento para mostrar. O estudante pode ter digitado um que nao esta' na
// lista ("txt:Notebook da sala 5"); um id que sumiu do cadastro aparece como "(removido)".
function rotuloDe(id, porId) {
    const s = String(id || '');
    if (!s) return '';
    if (porId && porId[s]) return porId[s].rotulo;
    if (s.indexOf('txt:') === 0) return s.slice(4) + ' (digitado)';
    return '(equipamento removido)';
}

// --- Relatorio do dia -----------------------------------------------------------

// reservas do dia + usos do dia -> linhas prontas para mostrar / imprimir / CSV.
// nomeDoNumero(reserva, num) devolve o nome (so' o aparelho do professor sabe) ou ''.
function relatorioDoDia(dataStr, reservas, usos, equipamentos, nomeDoNumero) {
    const porId = {};
    (equipamentos || []).forEach(e => { porId[e.id] = e; });
    const rot = id => rotuloDe(id, porId);
    const doDia = (reservas || []).filter(r => r.data === dataStr)
        .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)) || String(a.turmaNome).localeCompare(String(b.turmaNome)));
    const blocos = doDia.map(r => {
        const regs = ((usos || {})[r.id] || {}).registros || [];
        const cons = consolidarUso(regs);
        const linhas = cons.map(c => ({
            num: c.num,
            nome: (typeof nomeDoNumero === 'function' ? nomeDoNumero(r, c.num) : '') || '',
            equip: rot(c.equip),
            trocas: c.trocas.map(t => rot(t.de) + ' → ' + rot(t.para) + (t.defeito ? ' (defeito)' : '')),
            origem: c.origem
        }));
        const usados = new Set(cons.map(c => c.equip).filter(Boolean));
        cons.forEach(c => c.trocas.forEach(t => { if (t.de) usados.add(t.de); }));
        return {
            reserva: r,
            reservados: (r.equipIds || []).map(rot),
            troca: (r.reservaTroca || []).map(rot),
            linhas,
            semRegistro: (r.equipIds || []).filter(id => !usados.has(id)).map(rot),
            defeitos: defeitosRelatados(regs).map(rot),
            conflitos: conflitosDeUso(cons).map(c => ({ equip: rot(c.equip), nums: c.nums }))
        };
    });
    const totalUsados = blocos.reduce((s, b) => s + b.linhas.filter(l => l.equip).length, 0);
    const defeitos = [];
    blocos.forEach(b => b.defeitos.forEach(d => { if (defeitos.indexOf(d) === -1) defeitos.push(d); }));
    return { data: dataStr, blocos, totalReservas: blocos.length, totalUsados, defeitos };
}

function csvCampo(v) {
    const s = String(v == null ? '' : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function relatorioCsv(rel) {
    const linhas = [['Data', 'Início', 'Fim', 'Professor(a)', 'Turma', 'Nº', 'Estudante', 'Equipamento', 'Trocas', 'Lançado por'].join(';')];
    (rel.blocos || []).forEach(b => {
        const r = b.reserva;
        if (!b.linhas.length) {
            linhas.push([rel.data, r.inicio, r.fim, r.profNome, r.turmaNome, '', '', '(sem registro) ' + b.reservados.join(', '), '', ''].map(csvCampo).join(';'));
        }
        b.linhas.forEach(l => {
            linhas.push([rel.data, r.inicio, r.fim, r.profNome, r.turmaNome, l.num, l.nome, l.equip, l.trocas.join(' | '),
                l.origem === 'prof' ? 'professor' : 'estudante'].map(csvCampo).join(';'));
        });
    });
    return '﻿' + linhas.join('\n');
}

const EQUIPOPS = {
    TIPOS, TAM_CODIGO, FOLGA_LINK_MIN, MAX_ROTULO,
    novoId, gerarCodigo, limparCodigo, codigoValido, limparRotulo, normalizar,
    dataLocal, horaLocal, mesDe, horaValida, cruza,
    gerarLote, ordenarEquipamentos, funciona, resumirIds, rotuloDe,
    normalizarReserva, problemasDaReserva, ocupadosNoHorario, disponibilidade, contarPorTipo,
    escolherLivres, trocaSugerida, trocasPrevistas, aplicarTrocas,
    consolidarUso, defeitosRelatados, conflitosDeUso, relatorioDoDia, relatorioCsv
};

if (typeof window !== 'undefined') window.EQUIPOPS = EQUIPOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = EQUIPOPS;

})();
