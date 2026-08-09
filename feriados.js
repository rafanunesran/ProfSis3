// feriados.js — Calendário escolar: feriados nacionais/regionais, períodos de bimestre e
// verificação de dia letivo. Módulo PURO (sem UI, sem Firebase) para poder ser reutilizado
// tanto pela sincronização do Google Agenda quanto pelo auto-agendador de tutoria.
//
// Regras acordadas:
//  - Só é dia letivo se cair DENTRO de algum intervalo de `configBimestres` (fora = férias/recesso).
//  - Feriados nacionais (fixos + móveis) são calculados automaticamente por ano.
//  - Feriados regionais/municipais e recessos extras vêm de uma lista mantida pelo gestor
//    (`feriadosEscolares`), que é a fonte confiável da região da escola.
//  - Exceções de grade sem blocos (`gradeHorariaExcecoes` com blocos vazios) contam como dia sem expediente.

(function (global) {
    'use strict';

    // --- Feriados nacionais móveis: cálculo da Páscoa (algoritmo de Meeus/Butcher, calendário gregoriano) ---
    function domingoDePascoa(ano) {
        const a = ano % 19;
        const b = Math.floor(ano / 100);
        const c = ano % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3=março, 4=abril
        const dia = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(Date.UTC(ano, mes - 1, dia));
    }

    function ymd(date) {
        return date.toISOString().split('T')[0];
    }

    function somaDias(date, dias) {
        const d = new Date(date);
        d.setUTCDate(d.getUTCDate() + dias);
        return d;
    }

    // Cache por ano para não recalcular a cada verificação de data.
    const _cacheNacionais = {};

    // Retorna um Map<YYYY-MM-DD, nome> dos feriados nacionais do ano.
    function feriadosNacionais(ano) {
        if (_cacheNacionais[ano]) return _cacheNacionais[ano];
        const pascoa = domingoDePascoa(ano);
        const feriados = {
            [`${ano}-01-01`]: 'Confraternização Universal',
            [`${ano}-04-21`]: 'Tiradentes',
            [`${ano}-05-01`]: 'Dia do Trabalho',
            [`${ano}-09-07`]: 'Independência do Brasil',
            [`${ano}-10-12`]: 'Nossa Senhora Aparecida',
            [`${ano}-11-02`]: 'Finados',
            [`${ano}-11-15`]: 'Proclamação da República',
            [`${ano}-11-20`]: 'Dia da Consciência Negra', // nacional desde 2024 (Lei 14.759/2023)
            [`${ano}-12-25`]: 'Natal',
            // Móveis
            [ymd(somaDias(pascoa, -48))]: 'Carnaval (segunda)',
            [ymd(somaDias(pascoa, -47))]: 'Carnaval (terça)',
            [ymd(somaDias(pascoa, -46))]: 'Quarta-feira de Cinzas',
            [ymd(somaDias(pascoa, -2))]: 'Sexta-feira Santa',
            [ymd(somaDias(pascoa, 60))]: 'Corpus Christi'
        };
        _cacheNacionais[ano] = feriados;
        return feriados;
    }

    // Feriados estaduais/municipais conhecidos por região (semente editável pelo gestor).
    // Chave por UF e, opcionalmente, por cidade em minúsculas.
    function feriadosRegionaisConhecidos(ano, uf, cidade) {
        const out = {};
        const UF = (uf || '').toUpperCase();
        const CID = (cidade || '').trim().toLowerCase();
        if (UF === 'SP') {
            out[`${ano}-07-09`] = 'Revolução Constitucionalista (SP)';
        }
        if (CID === 'osasco') {
            out[`${ano}-02-19`] = 'Aniversário de Osasco';
        }
        return out;
    }

    // Monta o "contexto de calendário" a partir dos dados de gestor + professor.
    // Aceita objetos possivelmente indefinidos e normaliza tudo.
    function montarContextoCalendario(opts) {
        opts = opts || {};
        const configBimestres = (opts.configBimestres || []).filter(b => b && b.inicio && b.fim);
        const feriadosEscolares = opts.feriadosEscolares || []; // [{ data, nome }]
        const excecoes = opts.gradeHorariaExcecoes || [];
        const uf = opts.uf || '';
        const cidade = opts.cidade || '';

        // Dias sem expediente: exceções de grade com lista de blocos vazia.
        const diasOff = new Set(
            excecoes.filter(e => e && e.data && (!e.blocos || e.blocos.length === 0)).map(e => e.data)
        );

        // Conjunto explícito de feriados escolares (regionais/recessos) cadastrados pelo gestor.
        const feriadosManuais = new Set(feriadosEscolares.filter(f => f && f.data).map(f => f.data));

        return { configBimestres, feriadosManuais, diasOff, uf, cidade };
    }

    // Verifica se uma data (YYYY-MM-DD) é feriado (nacional, regional conhecido ou cadastrado).
    function ehFeriado(dateStr, ctx) {
        if (!dateStr) return false;
        const ano = parseInt(dateStr.slice(0, 4), 10);
        if (feriadosNacionais(ano)[dateStr]) return true;
        if (ctx) {
            if (ctx.feriadosManuais && ctx.feriadosManuais.has(dateStr)) return true;
            const reg = feriadosRegionaisConhecidos(ano, ctx.uf, ctx.cidade);
            if (reg[dateStr]) return true;
        }
        return false;
    }

    // Retorna o nome do feriado, se houver (para descrição/depuração).
    function nomeFeriado(dateStr, ctx) {
        if (!dateStr) return null;
        const ano = parseInt(dateStr.slice(0, 4), 10);
        const nac = feriadosNacionais(ano)[dateStr];
        if (nac) return nac;
        if (ctx) {
            const reg = feriadosRegionaisConhecidos(ano, ctx.uf, ctx.cidade);
            if (reg[dateStr]) return reg[dateStr];
        }
        return null;
    }

    // Está dentro de algum bimestre cadastrado?
    function dentroDeBimestre(dateStr, ctx) {
        return (ctx.configBimestres || []).some(b => dateStr >= b.inicio && dateStr <= b.fim);
    }

    // A data é um dia letivo válido para marcar compromissos?
    function estaEmPeriodoLetivo(dateStr, ctx) {
        if (!dateStr || !ctx) return false;
        // Se não há bimestres cadastrados, não temos como saber o calendário — não agenda nada.
        if (!ctx.configBimestres || ctx.configBimestres.length === 0) return false;
        if (!dentroDeBimestre(dateStr, ctx)) return false; // férias/recesso
        if (ctx.diasOff && ctx.diasOff.has(dateStr)) return false; // dia sem expediente
        if (ehFeriado(dateStr, ctx)) return false;
        return true;
    }

    // Fim do último bimestre (limite superior do horizonte de agendamento).
    function fimDoAnoLetivo(ctx) {
        const bims = ctx.configBimestres || [];
        if (bims.length === 0) return null;
        return bims.reduce((max, b) => (b.fim > max ? b.fim : max), bims[0].fim);
    }

    global.CalendarioEscolar = {
        domingoDePascoa,
        feriadosNacionais,
        feriadosRegionaisConhecidos,
        montarContextoCalendario,
        ehFeriado,
        nomeFeriado,
        dentroDeBimestre,
        estaEmPeriodoLetivo,
        fimDoAnoLetivo
    };
})(typeof window !== 'undefined' ? window : this);
