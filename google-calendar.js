// google-calendar.js — Integração com o Google Agenda (client-side, sem servidor).
//
// Fluxo: o professor conecta a conta Google (OAuth via Google Identity Services), o sistema cria
// um calendário dedicado "SisProf — Agenda Escolar" e mantém nele os blocos da grade (aulas,
// almoço, café, reunião, tutoria, etc.) como EVENTOS RECORRENTES semanais — um por bloco, com o
// período indo até o fim do ano letivo e com EXDATE (exceções) para feriados, férias e recessos.
//
// Modelo recorrente (em vez de 1 evento por dia): reduz de ~900 eventos para ~30, evita o limite
// de taxa da API e faz uma edição na grade mexer em UMA série. A reconciliação é idempotente: cada
// série carrega uma chave estável (sisprofKey) e um hash de conteúdo (sisprofHash); a cada sync o
// sistema cria as séries que faltam, atualiza as que mudaram e apaga as obsoletas.

(function (global) {
    'use strict';

    // =========================================================================
    // CONFIGURAÇÃO
    // =========================================================================
    // OAuth Client ID (tipo "Aplicativo Web") criado no Google Cloud Console, com a Google Calendar
    // API habilitada e as origens autorizadas cadastradas (URL do site + http://localhost:8080).
    // O Client ID é público (pode ficar no código). Se ficar em branco, o app pede ao professor
    // para colar o ID na primeira conexão e guarda em localStorage.
    const GOOGLE_OAUTH_CLIENT_ID_PADRAO = '411519047707-gmomve1rn249lt0743qrbp10j0b14qcu.apps.googleusercontent.com';

    const SCOPES = 'https://www.googleapis.com/auth/calendar';
    const CAL_SUMMARY = 'SisProf — Agenda Escolar';
    const TIMEZONE = 'America/Sao_Paulo';
    const API = 'https://www.googleapis.com/calendar/v3';
    const DESC = 'Criado automaticamente pelo SisProf. Não edite manualmente — será sobrescrito na próxima sincronização.';

    // Títulos dos blocos fixos — texto puro, sem emojis.
    const MAP_FIXO = {
        almoco: 'Almoço',
        cafe: 'Café',
        atpca: 'ATPCA',
        apcg: 'APCG',
        reuniao: 'Reunião',
        estudo: 'Estudo'
    };

    const BYDAY = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR' };

    // Tutorias são individuais (mostram o nome do tutorado, que muda a cada semana no rodízio),
    // então são sincronizadas só numa janela rolante à frente — mantém poucos eventos e sem rate limit.
    const HORIZON_TUTORIA_DIAS = 21;

    // =========================================================================
    // ESTADO EM MEMÓRIA (o token nunca é persistido)
    // =========================================================================
    let tokenClient = null;
    let accessToken = null;
    let tokenExpiry = 0;
    let sincronizando = false;
    let debounceTimer = null;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function getClientId() {
        return GOOGLE_OAUTH_CLIENT_ID_PADRAO || localStorage.getItem('gcal_client_id') || '';
    }

    function gcalConectado() {
        return !!(data && data.googleCalendar && data.googleCalendar.calendarId);
    }

    function ehModoProfessor() {
        return typeof currentViewMode === 'undefined' || currentViewMode !== 'gestor';
    }

    // =========================================================================
    // OAUTH (Google Identity Services — token model)
    // =========================================================================
    function inicializarTokenClient() {
        if (tokenClient) return true;
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return false;
        const clientId = getClientId();
        if (!clientId) return false;
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: () => {} // sobrescrito a cada pedido
        });
        return true;
    }

    // Solicita um access token. interativo=true abre o consentimento; false tenta silenciosamente.
    function pedirToken(interativo) {
        return new Promise((resolve, reject) => {
            if (accessToken && Date.now() < tokenExpiry - 60000) return resolve(accessToken);
            if (!inicializarTokenClient()) return reject(new Error('Google Identity Services indisponível ou Client ID não configurado.'));
            tokenClient.callback = (resp) => {
                if (resp && resp.error) return reject(new Error(resp.error));
                accessToken = resp.access_token;
                tokenExpiry = Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000;
                resolve(accessToken);
            };
            try {
                tokenClient.requestAccessToken({ prompt: interativo ? 'consent' : '' });
            } catch (e) {
                reject(e);
            }
        });
    }

    async function apiFetchOnce(path, opts) {
        opts = opts || {};
        const token = await pedirToken(false).catch(() => accessToken);
        if (!token) throw new Error('Sem autorização do Google.');
        const doFetch = (tk) => fetch(API + path, {
            method: opts.method || 'GET',
            headers: { 'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json' },
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        let resp = await doFetch(token);
        if (resp.status === 401) {
            accessToken = null;
            const t2 = await pedirToken(false);
            resp = await doFetch(t2);
        }
        return finalizarResposta(resp);
    }

    // Wrapper com retry + backoff exponencial para o limite de taxa do Google (403/429).
    async function apiFetch(path, opts) {
        let ultimoErro;
        for (let tentativa = 0; tentativa < 6; tentativa++) {
            try {
                return await apiFetchOnce(path, opts);
            } catch (e) {
                ultimoErro = e;
                const msg = (e && e.message) || '';
                const ehLimite = /rate limit|ratelimitexceeded|userratelimitexceeded|quota|\b429\b|backenderror/i.test(msg);
                if (ehLimite && tentativa < 5) {
                    await sleep(1000 * Math.pow(2, tentativa) + Math.floor(Math.random() * 400));
                    continue;
                }
                throw e;
            }
        }
        throw ultimoErro;
    }

    async function finalizarResposta(resp) {
        if (resp.status === 204) return null;
        const txt = await resp.text();
        const json = txt ? JSON.parse(txt) : null;
        if (!resp.ok) {
            const msg = json && json.error ? (json.error.message || JSON.stringify(json.error)) : ('HTTP ' + resp.status);
            const err = new Error(msg);
            err.status = resp.status;
            throw err;
        }
        return json;
    }

    // =========================================================================
    // CALENDÁRIO DEDICADO
    // =========================================================================
    async function garantirCalendario() {
        const gc = data.googleCalendar;
        if (gc && gc.calendarId) {
            try {
                await apiFetch('/calendars/' + encodeURIComponent(gc.calendarId));
                return gc.calendarId;
            } catch (e) {
                // Foi apagado no Google — recria abaixo.
            }
        }
        const lista = await apiFetch('/users/me/calendarList?maxResults=250');
        const existente = (lista.items || []).find(c => c.summary === CAL_SUMMARY);
        if (existente) return existente.id;
        const criado = await apiFetch('/calendars', {
            method: 'POST',
            body: { summary: CAL_SUMMARY, timeZone: TIMEZONE, description: 'Grade, blocos fixos e tutorias sincronizados pelo SisProf.' }
        });
        return criado.id;
    }

    // =========================================================================
    // CONTEXTO (dados de gestor + professor)
    // =========================================================================
    async function carregarContexto() {
        const user = currentUser;
        let gradeEscola = [], excecoes = [], configBimestres = [], feriadosEscolares = [], uf = '', cidade = '';

        if (user && user.schoolId) {
            const key = 'app_data_school_' + user.schoolId + '_gestor';
            const gestorData = await getData('app_data', key);
            if (gestorData) {
                gradeEscola = gestorData.gradeHoraria || [];
                excecoes = gestorData.gradeHorariaExcecoes || [];
                configBimestres = gestorData.configBimestres || [];
                feriadosEscolares = gestorData.feriadosEscolares || [];
                uf = gestorData.escolaUF || '';
                cidade = gestorData.escolaCidade || '';
            }
        }

        const ctx = CalendarioEscolar.montarContextoCalendario({
            configBimestres, feriadosEscolares, gradeHorariaExcecoes: excecoes, uf, cidade
        });

        return { ctx, gradeEscola, excecoes, configBimestres };
    }

    function classificarBloco(bloco, aula, turmas) {
        const tipo = (aula && aula.tipo) || bloco.tipo || '';
        if (tipo === 'aula' && aula && aula.id_turma) {
            const turma = (turmas || []).find(t => t.id == aula.id_turma);
            // Resumo por turma/série + disciplina, ex.: "9B Arte".
            const titulo = turma
                ? (turma.nome + (turma.disciplina ? ' ' + turma.disciplina : '')).trim()
                : 'Aula';
            return { incluir: true, titulo };
        }
        // Tutoria NÃO entra como série recorrente: é gerada individualmente (com nome do aluno) abaixo.
        if (tipo === 'tutoria') return { incluir: false };
        // Estudo: usa exatamente o texto digitado pelo professor (aula.tema).
        if (tipo === 'estudo') {
            const texto = (aula && aula.tema && aula.tema.trim()) ? aula.tema.trim() : 'Estudo';
            return { incluir: true, titulo: texto };
        }
        if (MAP_FIXO[tipo]) return { incluir: true, titulo: MAP_FIXO[tipo] };
        return { incluir: false }; // bloco livre / não atribuído
    }

    // --- Helpers de data para recorrência ---
    function primeiraOcorrencia(fromDateStr, diaSemana) {
        const d = new Date(fromDateStr + 'T12:00:00Z');
        while (d.getUTCDay() !== diaSemana) d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().split('T')[0];
    }
    function untilUTC(untilDateStr) {
        // Fim do dia (SP) convertido para UTC no formato básico exigido pelo RRULE.
        const iso = new Date(untilDateStr + 'T23:59:59-03:00').toISOString();
        return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    }
    function exdateLocal(dateStr, hhmm) {
        return dateStr.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00';
    }
    function addDias(dateStr, n) {
        const d = new Date(dateStr + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().split('T')[0];
    }
    function hashStr(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return String(h);
    }

    // Constrói as SÉRIES recorrentes desejadas + eventos avulsos (dias atípicos com grade especial).
    function construirDesejados(ctxWrap) {
        const { ctx, gradeEscola, excecoes } = ctxWrap;
        const CE = CalendarioEscolar;
        const hoje = getTodayString();
        const fim = CE.fimDoAnoLetivo(ctx);
        const itens = [];
        if (!fim || fim < hoje) return itens;

        const bims = ctx.configBimestres || [];
        const inicioAno = bims.reduce((min, b) => (b.inicio < min ? b.inicio : min), bims[0].inicio);
        const rangeStart = hoje > inicioAno ? hoje : inicioAno;

        const horariosAulas = (data && data.horariosAulas) || [];
        const turmas = (data && data.turmas) || [];

        // 1) Uma série recorrente por bloco da grade semanal (dias 1..5).
        gradeEscola.forEach(bloco => {
            const dia = parseInt(bloco.diaSemana, 10);
            if (!(dia >= 1 && dia <= 5) || !bloco.inicio || !bloco.fim) return;
            const aula = horariosAulas.find(a => a.id_bloco == bloco.id);
            const info = classificarBloco(bloco, aula, turmas);
            if (!info.incluir) return;

            const dtstart = primeiraOcorrencia(rangeStart, dia);
            if (dtstart > fim) return;

            // EXDATE: ocorrências semanais que caem em não-letivo OU em dia com grade especial.
            const exdates = [];
            let c = new Date(dtstart + 'T12:00:00Z');
            const end = new Date(fim + 'T12:00:00Z');
            while (c <= end) {
                const ds = c.toISOString().split('T')[0];
                const exc = excecoes.find(e => e.data === ds);
                const especial = exc && exc.blocos && exc.blocos.length > 0;
                if (!CE.estaEmPeriodoLetivo(ds, ctx) || especial) exdates.push(ds);
                c.setUTCDate(c.getUTCDate() + 7);
            }

            const hash = hashStr([info.titulo, bloco.inicio, bloco.fim, BYDAY[dia], fim, exdates.join(',')].join('|'));
            itens.push({
                key: 'serie-' + bloco.id,
                hash,
                serie: { titulo: info.titulo, inicio: bloco.inicio, fim: bloco.fim, byday: BYDAY[dia], dtstart, until: fim, exdates }
            });
        });

        // 2) Eventos avulsos para dias atípicos com grade especial (substituem a série naquele dia).
        excecoes.forEach(exc => {
            if (!exc.blocos || exc.blocos.length === 0) return;
            if (exc.data < hoje || exc.data > fim) return;
            if (!CE.estaEmPeriodoLetivo(exc.data, ctx)) return;
            exc.blocos.forEach((b, idx) => {
                if (!b.inicio || !b.fim) return;
                const aula = horariosAulas.find(a => a.id_bloco == b.id);
                const info = classificarBloco(b, aula, turmas);
                if (!info.incluir) return;
                const hash = hashStr([info.titulo, exc.data, b.inicio, b.fim].join('|'));
                itens.push({
                    key: 'exc-' + exc.data + '-' + idx,
                    hash,
                    avulso: { titulo: info.titulo, date: exc.data, inicio: b.inicio, fim: b.fim }
                });
            });
        });

        // 3) Tutorias individuais (com nome do aluno) na janela rolante [hoje, hoje+HORIZON].
        const agendamentos = (data && data.agendamentos) || [];
        const tutorados = (data && data.tutorados) || [];
        const limiteTutoria = addDias(hoje, HORIZON_TUTORIA_DIAS);
        agendamentos.forEach(a => {
            if (!a.tutoradoId || !a.data || !a.inicio || !a.fim) return;
            if (a.data < hoje || a.data > limiteTutoria || a.data > fim) return;
            if (!CE.estaEmPeriodoLetivo(a.data, ctx)) return;
            const t = tutorados.find(x => x.id == a.tutoradoId);
            const nome = t ? (t.nome_estudante || t.nome_completo || 'Tutorado') : 'Tutorado';
            const titulo = 'Tut - ' + nome;
            const hash = hashStr([titulo, a.data, a.inicio, a.fim].join('|'));
            itens.push({
                key: 'tutoria-' + a.id,
                hash,
                avulso: { titulo, date: a.data, inicio: a.inicio, fim: a.fim }
            });
        });

        return itens;
    }

    function recursoGoogle(item, userId) {
        const ext = { private: { sisprofOwner: String(userId), sisprofKey: item.key, sisprofHash: item.hash } };
        if (item.serie) {
            const s = item.serie;
            const recurrence = ['RRULE:FREQ=WEEKLY;BYDAY=' + s.byday + ';UNTIL=' + untilUTC(s.until)];
            if (s.exdates.length) {
                recurrence.push('EXDATE;TZID=' + TIMEZONE + ':' + s.exdates.map(d => exdateLocal(d, s.inicio)).join(','));
            }
            return {
                summary: s.titulo, description: DESC,
                start: { dateTime: s.dtstart + 'T' + s.inicio + ':00', timeZone: TIMEZONE },
                end: { dateTime: s.dtstart + 'T' + s.fim + ':00', timeZone: TIMEZONE },
                recurrence, extendedProperties: ext
            };
        }
        const a = item.avulso;
        return {
            summary: a.titulo, description: DESC,
            start: { dateTime: a.date + 'T' + a.inicio + ':00', timeZone: TIMEZONE },
            end: { dateTime: a.date + 'T' + a.fim + ':00', timeZone: TIMEZONE },
            extendedProperties: ext
        };
    }

    // =========================================================================
    // RECONCILIAÇÃO
    // =========================================================================
    async function listarEventosSisprof(calendarId, userId) {
        // singleEvents=false: pega as SÉRIES (não expande em instâncias). Sem timeMin para achar
        // também séries cujo início já ficou no passado.
        const existentes = new Map(); // sisprofKey -> { id, hash }
        let pageToken = null;
        do {
            const params = new URLSearchParams({
                privateExtendedProperty: 'sisprofOwner=' + String(userId),
                maxResults: '2500',
                singleEvents: 'false',
                showDeleted: 'false'
            });
            if (pageToken) params.set('pageToken', pageToken);
            const resp = await apiFetch('/calendars/' + encodeURIComponent(calendarId) + '/events?' + params.toString());
            (resp.items || []).forEach(ev => {
                const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
                if (!priv.sisprofKey) return;
                const start = ((ev.start && (ev.start.dateTime || ev.start.date)) || '').slice(0, 10);
                const isSeries = !!(ev.recurrence && ev.recurrence.length);
                existentes.set(priv.sisprofKey, { id: ev.id, hash: priv.sisprofHash, start, isSeries });
            });
            pageToken = resp.nextPageToken;
        } while (pageToken);
        return existentes;
    }

    // Executa em lotes pequenos com pausa entre lotes (evita estourar o limite de taxa).
    async function emLote(itens, tamanho, fn, onProgress) {
        for (let i = 0; i < itens.length; i += tamanho) {
            const fatia = itens.slice(i, i + tamanho);
            await Promise.all(fatia.map(async it => { await fn(it); if (onProgress) onProgress(); }));
            if (i + tamanho < itens.length) await sleep(300);
        }
    }

    async function sincronizar(interativo) {
        if (sincronizando) return;
        if (!ehModoProfessor()) return;
        if (!getClientId()) { if (interativo) return conectar(); return; }
        sincronizando = true;
        atualizarStatus('⏳ Sincronizando com o Google Agenda…');
        try {
            await pedirToken(!!interativo);
            const userId = currentUser.uid || currentUser.id;
            const calendarId = await garantirCalendario();

            if (!data.googleCalendar || data.googleCalendar.calendarId !== calendarId) {
                data.googleCalendar = Object.assign({}, data.googleCalendar, { calendarId });
                await salvarSilencioso();
            }

            const ctxWrap = await carregarContexto();
            const desejados = construirDesejados(ctxWrap);
            const existentes = await listarEventosSisprof(calendarId, userId);

            const criar = [], atualizar = [], vistos = new Set();
            desejados.forEach(it => {
                vistos.add(it.key);
                const atual = existentes.get(it.key);
                if (!atual) criar.push(it);
                else if (atual.hash !== it.hash) atualizar.push({ it, id: atual.id });
            });
            const hojeStr = getTodayString();
            const apagar = [];
            existentes.forEach((v, key) => {
                if (vistos.has(key)) return;
                // Resíduo do modelo antigo (1 evento por dia, chave "fixo-<bloco>-<data>"): remove sempre,
                // inclusive no passado, para limpar automaticamente quem migrou da versão anterior.
                const ehLegado = key.indexOf('fixo-') === 0;
                // Fora isso, só mexe nos pendentes: nunca apaga evento avulso já no passado (preserva histórico).
                if (!ehLegado && !v.isSeries && v.start && v.start < hojeStr) return;
                apagar.push(v.id);
            });

            const total = criar.length + atualizar.length + apagar.length;
            let feitos = 0;
            const prog = () => { feitos++; atualizarStatus(`⏳ Sincronizando… ${feitos}/${total}`); };

            const base = '/calendars/' + encodeURIComponent(calendarId) + '/events';
            await emLote(criar, 3, it => apiFetch(base, { method: 'POST', body: recursoGoogle(it, userId) }), prog);
            await emLote(atualizar, 3, ({ it, id }) => apiFetch(base + '/' + id, { method: 'PUT', body: recursoGoogle(it, userId) }), prog);
            await emLote(apagar, 3, id => apiFetch(base + '/' + id, { method: 'DELETE' }), prog);

            data.googleCalendar.lastSyncAt = new Date().toISOString();
            await salvarSilencioso();
            atualizarStatus(`✅ Sincronizado: ${criar.length} criados, ${atualizar.length} atualizados, ${apagar.length} removidos.`);
        } catch (err) {
            console.error('[GCal] Erro na sincronização:', err);
            atualizarStatus('❌ Erro: ' + err.message);
            if (interativo) alert('Não foi possível sincronizar com o Google Agenda:\n' + err.message);
        } finally {
            sincronizando = false;
            renderCard();
        }
    }

    async function salvarSilencioso() {
        if (typeof persistirDados === 'function') {
            try { await persistirDados(); } catch (e) { console.warn('[GCal] persistir falhou:', e); }
        }
    }

    // =========================================================================
    // CONECTAR / DESCONECTAR / RECRIAR
    // =========================================================================
    async function conectar() {
        if (!getClientId()) {
            const id = prompt('Cole o OAuth Client ID do Google (…apps.googleusercontent.com):');
            if (!id) return;
            localStorage.setItem('gcal_client_id', id.trim());
            tokenClient = null;
        }
        try {
            await pedirToken(true);
            if (!data.googleCalendar) data.googleCalendar = {};
            await sincronizar(true);
        } catch (e) {
            alert('Falha ao conectar ao Google: ' + e.message);
        }
    }

    async function desconectar() {
        const apagar = confirm('Deseja também APAGAR do Google Agenda os eventos criados pelo SisProf?\n\nOK = apagar os eventos.\nCancelar = manter os eventos, apenas desconectar.');
        try {
            if (apagar && gcalConectado()) {
                atualizarStatus('⏳ Removendo eventos…');
                const userId = currentUser.uid || currentUser.id;
                const calendarId = data.googleCalendar.calendarId;
                const existentes = await listarEventosSisprof(calendarId, userId);
                const ids = Array.from(existentes.values()).map(v => v.id);
                const base = '/calendars/' + encodeURIComponent(calendarId) + '/events';
                await emLote(ids, 3, id => apiFetch(base + '/' + id, { method: 'DELETE' }));
            }
        } catch (e) {
            console.warn('[GCal] erro ao remover eventos:', e);
        }
        if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
        }
        accessToken = null; tokenExpiry = 0;
        delete data.googleCalendar;
        await salvarSilencioso();
        renderCard();
    }

    // Apaga o calendário dedicado inteiro (1 chamada) e recria do zero — útil para limpar eventos
    // antigos/duplicados sem precisar apagar centenas um a um.
    async function recriarCalendario() {
        if (!confirm('Isso vai APAGAR o calendário "SisProf — Agenda Escolar" atual (removendo de uma vez todos os eventos que o app criou) e recriar do zero com eventos recorrentes.\n\nSeus outros calendários não são afetados. Continuar?')) return;
        try {
            await pedirToken(true);
            if (data.googleCalendar && data.googleCalendar.calendarId) {
                atualizarStatus('⏳ Apagando calendário antigo…');
                try { await apiFetch('/calendars/' + encodeURIComponent(data.googleCalendar.calendarId), { method: 'DELETE' }); }
                catch (e) { console.warn('[GCal] falha ao apagar calendário:', e); }
            }
            delete data.googleCalendar;
            await salvarSilencioso();
            await sincronizar(true);
        } catch (e) {
            alert('Falha ao recriar o calendário: ' + e.message);
        }
    }

    // =========================================================================
    // UI (card na tela Agenda)
    // =========================================================================
    function atualizarStatus(txt) {
        const el = document.getElementById('gcalStatus');
        if (el) el.textContent = txt;
    }

    function renderCard() {
        const alvo = document.getElementById('gcalCard');
        if (!alvo) return;
        if (!ehModoProfessor()) { alvo.innerHTML = ''; return; }

        const conectado = gcalConectado();
        const gc = (data && data.googleCalendar) || {};
        const ultima = gc.lastSyncAt ? new Date(gc.lastSyncAt).toLocaleString('pt-BR') : '—';

        alvo.innerHTML = `
            <div class="card" style="background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0; color:#2c5282;">📆 Google Agenda</h3>
                        <p style="margin:4px 0 0; font-size:13px; color:#718096;">
                            ${conectado
                                ? 'Conectado. Sua grade é espelhada como eventos semanais recorrentes, pulando feriados e férias.'
                                : 'Conecte sua conta Google para espelhar automaticamente sua agenda escolar.'}
                        </p>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${conectado
                            ? `<button class="btn btn-primary btn-sm" onclick="gcalSync(true)">🔄 Sincronizar agora</button>
                               <button class="btn btn-secondary btn-sm" onclick="gcalRecriar()">🧹 Recriar do zero</button>
                               <button class="btn btn-secondary btn-sm" onclick="gcalAjudaIOS()">📱 iPhone/iPad</button>
                               <button class="btn btn-danger btn-sm" onclick="gcalDesconectar()">Desconectar</button>`
                            : `<button class="btn btn-success btn-sm" onclick="gcalConectar()">🔗 Conectar Google Agenda</button>
                               <button class="btn btn-secondary btn-sm" onclick="gcalAjudaIOS()">📱 iPhone/iPad</button>`}
                    </div>
                </div>
                ${conectado ? `<div style="margin-top:10px; font-size:12px; color:#4a5568;">Última sincronização: <strong>${ultima}</strong></div>` : ''}
                <div id="gcalStatus" style="margin-top:8px; font-size:12px; color:#2b6cb0;"></div>
            </div>`;
    }

    function ajudaIOS() {
        alert(
            '📱 Usando no iPhone / iPad\n\n' +
            '1) Abra o SisProf no Safari e toque em Compartilhar → "Adicionar à Tela de Início" para instalar o app.\n\n' +
            '2) Toque em "Conectar Google Agenda" e autorize com sua conta Google.\n\n' +
            '3) Para os eventos aparecerem no app Calendário da Apple: abra Ajustes → Calendário → Contas → Adicionar Conta → Google e ative "Calendários".\n\n' +
            'Pronto: a agenda "SisProf — Agenda Escolar" aparecerá no seu iPhone/iPad e será atualizada automaticamente.'
        );
    }

    // =========================================================================
    // GATILHOS
    // =========================================================================
    function aoAbrirAgenda() {
        renderCard();
        if (gcalConectado() && getClientId()) sincronizar(false);
    }

    function aoMudarDados() {
        if (!ehModoProfessor() || !gcalConectado() || !getClientId()) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => sincronizar(false), 4000);
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================
    global.gcalConectar = conectar;
    global.gcalDesconectar = desconectar;
    global.gcalRecriar = recriarCalendario;
    global.gcalSync = sincronizar;
    global.gcalAjudaIOS = ajudaIOS;
    global.gcalRenderCard = renderCard;
    global.gcalAoAbrirAgenda = aoAbrirAgenda;
    global.gcalOnDataChanged = aoMudarDados;
})(typeof window !== 'undefined' ? window : this);
