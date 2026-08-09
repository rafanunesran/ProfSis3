// google-calendar.js — Integração com o Google Agenda (client-side, sem servidor).
//
// Fluxo: o professor conecta a conta Google (OAuth via Google Identity Services), o sistema cria
// um calendário dedicado "SisProf — Agenda Escolar" e mantém nele os blocos fixos (almoço, café,
// reunião, etc.), as aulas mapeadas e os atendimentos de tutoria — sempre dentro dos bimestres e
// pulando feriados/férias/recesso (via CalendarioEscolar, em feriados.js).
//
// Sincronização é reconciliação idempotente: cada evento carrega uma chave estável em
// extendedProperties.private (sisprofKey) e um hash de conteúdo (sisprofHash). A cada sync o
// sistema calcula o conjunto desejado e cria o que falta, atualiza o que mudou e apaga o obsoleto.
// É isso que faz uma alteração na grade/tutoria refletir no Google Agenda.

(function (global) {
    'use strict';

    // =========================================================================
    // CONFIGURAÇÃO
    // =========================================================================
    // OAuth Client ID (tipo "Aplicativo Web") criado no Google Cloud Console, com a Google Calendar
    // API habilitada e as origens autorizadas cadastradas (URL do site + http://localhost:8080).
    // O Client ID é público (pode ficar no código). Se ficar em branco, o app pede ao professor
    // para colar o ID na primeira conexão e guarda em localStorage.
    const GOOGLE_OAUTH_CLIENT_ID_PADRAO = ''; // <-- PREENCHER com o Client ID (…apps.googleusercontent.com)

    const SCOPES = 'https://www.googleapis.com/auth/calendar';
    const CAL_SUMMARY = 'SisProf — Agenda Escolar';
    const TIMEZONE = 'America/Sao_Paulo';
    const API = 'https://www.googleapis.com/calendar/v3';

    const MAP_FIXO = {
        almoco: '🍽️ Almoço',
        cafe: '☕ Café',
        atpca: '📝 ATPCA',
        apcg: '📋 APCG',
        reuniao: '🤝 Reunião',
        estudo: '📖 Estudo'
    };

    // =========================================================================
    // ESTADO EM MEMÓRIA (o token nunca é persistido)
    // =========================================================================
    let tokenClient = null;
    let accessToken = null;
    let tokenExpiry = 0;
    let sincronizando = false;
    let debounceTimer = null;

    function getClientId() {
        return GOOGLE_OAUTH_CLIENT_ID_PADRAO || localStorage.getItem('gcal_client_id') || '';
    }

    function gcalConectado() {
        return !!(global.data && global.data.googleCalendar && global.data.googleCalendar.calendarId);
    }

    function ehModoProfessor() {
        return typeof global.currentViewMode === 'undefined' || global.currentViewMode !== 'gestor';
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

    async function apiFetch(path, opts) {
        opts = opts || {};
        const token = await pedirToken(false).catch(() => accessToken);
        if (!token) throw new Error('Sem autorização do Google.');
        const resp = await fetch(API + path, {
            method: opts.method || 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        if (resp.status === 401) {
            // Token expirou no meio do caminho — força novo e repete uma vez.
            accessToken = null;
            const t2 = await pedirToken(false);
            const r2 = await fetch(API + path, {
                method: opts.method || 'GET',
                headers: { 'Authorization': 'Bearer ' + t2, 'Content-Type': 'application/json' },
                body: opts.body ? JSON.stringify(opts.body) : undefined
            });
            return finalizarResposta(r2);
        }
        return finalizarResposta(resp);
    }

    async function finalizarResposta(resp) {
        if (resp.status === 204) return null;
        const txt = await resp.text();
        const json = txt ? JSON.parse(txt) : null;
        if (!resp.ok) {
            const msg = json && json.error ? (json.error.message || JSON.stringify(json.error)) : ('HTTP ' + resp.status);
            throw new Error(msg);
        }
        return json;
    }

    // =========================================================================
    // CALENDÁRIO DEDICADO
    // =========================================================================
    async function garantirCalendario() {
        const gc = global.data.googleCalendar;
        if (gc && gc.calendarId) {
            // Confirma que ainda existe.
            try {
                await apiFetch('/calendars/' + encodeURIComponent(gc.calendarId));
                return gc.calendarId;
            } catch (e) {
                // Foi apagado no Google — recria abaixo.
            }
        }
        // Procura por um calendário já criado antes.
        const lista = await apiFetch('/users/me/calendarList?maxResults=250');
        const existente = (lista.items || []).find(c => c.summary === CAL_SUMMARY);
        let calendarId;
        if (existente) {
            calendarId = existente.id;
        } else {
            const criado = await apiFetch('/calendars', {
                method: 'POST',
                body: { summary: CAL_SUMMARY, timeZone: TIMEZONE, description: 'Grade, blocos fixos e tutorias sincronizados pelo SisProf.' }
            });
            calendarId = criado.id;
        }
        return calendarId;
    }

    // =========================================================================
    // CONTEXTO (dados de gestor + professor)
    // =========================================================================
    async function carregarContexto() {
        const user = global.currentUser;
        let gradeEscola = [], excecoes = [], configBimestres = [], feriadosEscolares = [], uf = '', cidade = '';

        if (user && user.schoolId) {
            const key = 'app_data_school_' + user.schoolId + '_gestor';
            const gestorData = await global.getData('app_data', key);
            if (gestorData) {
                gradeEscola = gestorData.gradeHoraria || [];
                excecoes = gestorData.gradeHorariaExcecoes || [];
                configBimestres = gestorData.configBimestres || [];
                feriadosEscolares = gestorData.feriadosEscolares || [];
                uf = gestorData.escolaUF || '';
                cidade = gestorData.escolaCidade || '';
            }
        }

        const ctx = global.CalendarioEscolar.montarContextoCalendario({
            configBimestres, feriadosEscolares, gradeHorariaExcecoes: excecoes, uf, cidade
        });

        return { ctx, gradeEscola, excecoes };
    }

    function classificarBloco(bloco, aula, turmas) {
        const tipo = (aula && aula.tipo) || bloco.tipo || '';
        if (tipo === 'aula' && aula && aula.id_turma) {
            const turma = (turmas || []).find(t => t.id == aula.id_turma);
            return { incluir: true, titulo: '📚 Aula' + (turma ? ' — ' + turma.nome : '') };
        }
        if (tipo === 'tutoria') return { incluir: false }; // coberto pelos agendamentos
        if (MAP_FIXO[tipo]) return { incluir: true, titulo: MAP_FIXO[tipo] };
        return { incluir: false }; // bloco livre / não atribuído
    }

    // Constrói a lista de eventos desejados no horizonte (hoje → fim do ano letivo).
    function construirEventosDesejados(ctxWrap) {
        const { ctx, gradeEscola, excecoes } = ctxWrap;
        const CE = global.CalendarioEscolar;
        const hoje = global.getTodayString();
        const fim = CE.fimDoAnoLetivo(ctx);
        const eventos = [];
        if (!fim || fim < hoje) return eventos;

        const horariosAulas = (global.data && global.data.horariosAulas) || [];
        const turmas = (global.data && global.data.turmas) || [];
        const agendamentos = (global.data && global.data.agendamentos) || [];
        const tutorados = (global.data && global.data.tutorados) || [];

        // Blocos fixos + aulas, dia a dia.
        let cursor = new Date(hoje + 'T12:00:00Z');
        const dataFim = new Date(fim + 'T12:00:00Z');
        while (cursor <= dataFim) {
            const dataStr = cursor.toISOString().split('T')[0];
            if (CE.estaEmPeriodoLetivo(dataStr, ctx)) {
                const dia = cursor.getUTCDay(); // 0=Dom … 6=Sáb
                const exc = excecoes.find(e => e.data === dataStr);
                const blocos = exc ? (exc.blocos || []) : gradeEscola.filter(g => g.diaSemana == dia);
                blocos.forEach(bloco => {
                    if (!bloco.inicio || !bloco.fim) return;
                    const aula = horariosAulas.find(a => a.id_bloco == bloco.id);
                    const info = classificarBloco(bloco, aula, turmas);
                    if (info.incluir) {
                        eventos.push({
                            key: 'fixo-' + bloco.id + '-' + dataStr,
                            date: dataStr, inicio: bloco.inicio, fim: bloco.fim, titulo: info.titulo
                        });
                    }
                });
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        // Tutorias (agendamentos com tutorado atribuído).
        agendamentos.forEach(a => {
            if (!a.tutoradoId || !a.data || a.data < hoje || a.data > fim) return;
            if (!CE.estaEmPeriodoLetivo(a.data, ctx)) return;
            const t = tutorados.find(x => x.id == a.tutoradoId);
            const nome = t ? (t.nome_estudante || t.nome_completo || 'Tutorado') : 'Tutorado';
            eventos.push({
                key: 'tutoria-' + a.id,
                date: a.data, inicio: a.inicio, fim: a.fim, titulo: '🎓 Tutoria — ' + nome
            });
        });

        return eventos;
    }

    function hashEvento(e) {
        const s = e.titulo + '|' + e.date + '|' + e.inicio + '|' + e.fim;
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return String(h);
    }

    function paraRecursoGoogle(e, userId) {
        return {
            summary: e.titulo,
            description: 'Criado automaticamente pelo SisProf. Não edite manualmente — será sobrescrito na próxima sincronização.',
            start: { dateTime: e.date + 'T' + e.inicio + ':00', timeZone: TIMEZONE },
            end: { dateTime: e.date + 'T' + e.fim + ':00', timeZone: TIMEZONE },
            extendedProperties: {
                private: { sisprofOwner: String(userId), sisprofKey: e.key, sisprofHash: hashEvento(e) }
            }
        };
    }

    // =========================================================================
    // RECONCILIAÇÃO
    // =========================================================================
    async function listarEventosSisprof(calendarId, userId) {
        const hoje = global.getTodayString();
        const timeMin = new Date(hoje + 'T00:00:00-03:00').toISOString();
        const existentes = new Map(); // sisprofKey -> { id, hash }
        let pageToken = null;
        do {
            const params = new URLSearchParams({
                privateExtendedProperty: 'sisprofOwner=' + String(userId),
                maxResults: '2500',
                singleEvents: 'true',
                showDeleted: 'false',
                timeMin: timeMin
            });
            if (pageToken) params.set('pageToken', pageToken);
            const resp = await apiFetch('/calendars/' + encodeURIComponent(calendarId) + '/events?' + params.toString());
            (resp.items || []).forEach(ev => {
                const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
                if (priv.sisprofKey) existentes.set(priv.sisprofKey, { id: ev.id, hash: priv.sisprofHash });
            });
            pageToken = resp.nextPageToken;
        } while (pageToken);
        return existentes;
    }

    // Executa promessas com paralelismo limitado (evita estourar cota do Google).
    async function emLote(itens, tamanho, fn, onProgress) {
        let feitos = 0;
        for (let i = 0; i < itens.length; i += tamanho) {
            const fatia = itens.slice(i, i + tamanho);
            await Promise.all(fatia.map(async it => {
                await fn(it);
                feitos++;
                if (onProgress) onProgress(feitos, itens.length);
            }));
        }
    }

    async function sincronizar(interativo) {
        if (sincronizando) return;
        if (!ehModoProfessor()) return;
        if (!getClientId()) {
            if (interativo) return conectar();
            return;
        }
        sincronizando = true;
        atualizarStatus('⏳ Sincronizando com o Google Agenda…');
        try {
            await pedirToken(!!interativo);
            const userId = global.currentUser.uid || global.currentUser.id;
            const calendarId = await garantirCalendario();

            // Persiste o vínculo do calendário se mudou.
            if (!global.data.googleCalendar || global.data.googleCalendar.calendarId !== calendarId) {
                global.data.googleCalendar = Object.assign({}, global.data.googleCalendar, { calendarId });
                await salvarSilencioso();
            }

            const ctxWrap = await carregarContexto();
            const desejados = construirEventosDesejados(ctxWrap);
            const existentes = await listarEventosSisprof(calendarId, userId);

            const paraCriar = [];
            const paraAtualizar = [];
            const vistos = new Set();

            desejados.forEach(e => {
                vistos.add(e.key);
                const atual = existentes.get(e.key);
                const hash = hashEvento(e);
                if (!atual) paraCriar.push(e);
                else if (atual.hash !== hash) paraAtualizar.push({ e, id: atual.id });
            });

            const paraApagar = [];
            existentes.forEach((v, key) => { if (!vistos.has(key)) paraApagar.push(v.id); });

            let total = paraCriar.length + paraAtualizar.length + paraApagar.length;
            let feitos = 0;
            const prog = () => { feitos++; atualizarStatus(`⏳ Sincronizando… ${feitos}/${total}`); };

            await emLote(paraCriar, 6, async e => {
                await apiFetch('/calendars/' + encodeURIComponent(calendarId) + '/events', { method: 'POST', body: paraRecursoGoogle(e, userId) });
            }, prog);

            await emLote(paraAtualizar, 6, async ({ e, id }) => {
                await apiFetch('/calendars/' + encodeURIComponent(calendarId) + '/events/' + id, { method: 'PUT', body: paraRecursoGoogle(e, userId) });
            }, prog);

            await emLote(paraApagar, 6, async id => {
                await apiFetch('/calendars/' + encodeURIComponent(calendarId) + '/events/' + id, { method: 'DELETE' });
            }, prog);

            global.data.googleCalendar.connectedEmail = global.data.googleCalendar.connectedEmail || '';
            global.data.googleCalendar.lastSyncAt = new Date().toISOString();
            await salvarSilencioso();

            atualizarStatus(`✅ Sincronizado: ${paraCriar.length} criados, ${paraAtualizar.length} atualizados, ${paraApagar.length} removidos.`);
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
        if (typeof global.persistirDados === 'function') {
            try { await global.persistirDados(); } catch (e) { console.warn('[GCal] persistir falhou:', e); }
        }
    }

    // =========================================================================
    // CONECTAR / DESCONECTAR
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
            if (!global.data.googleCalendar) global.data.googleCalendar = {};
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
                const userId = global.currentUser.uid || global.currentUser.id;
                const calendarId = global.data.googleCalendar.calendarId;
                const existentes = await listarEventosSisprof(calendarId, userId);
                const ids = Array.from(existentes.values()).map(v => v.id);
                await emLote(ids, 6, async id => {
                    await apiFetch('/calendars/' + encodeURIComponent(calendarId) + '/events/' + id, { method: 'DELETE' });
                });
            }
        } catch (e) {
            console.warn('[GCal] erro ao remover eventos:', e);
        }
        // Revoga o token e limpa o vínculo.
        if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
        }
        accessToken = null; tokenExpiry = 0;
        delete global.data.googleCalendar;
        await salvarSilencioso();
        renderCard();
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
        const gc = (global.data && global.data.googleCalendar) || {};
        const ultima = gc.lastSyncAt ? new Date(gc.lastSyncAt).toLocaleString('pt-BR') : '—';

        alvo.innerHTML = `
            <div class="card" style="background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0; color:#2c5282;">📆 Google Agenda</h3>
                        <p style="margin:4px 0 0; font-size:13px; color:#718096;">
                            ${conectado
                                ? 'Conectado. Sua grade, blocos fixos e tutorias são espelhados no Google Agenda.'
                                : 'Conecte sua conta Google para espelhar automaticamente sua agenda escolar.'}
                        </p>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${conectado
                            ? `<button class="btn btn-primary btn-sm" onclick="gcalSync(true)">🔄 Sincronizar agora</button>
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
    // Chamado ao abrir a tela Agenda: renderiza o card e tenta sincronizar em silêncio.
    function aoAbrirAgenda() {
        renderCard();
        if (gcalConectado() && getClientId()) {
            // Tentativa silenciosa; se precisar de consentimento, o usuário usa o botão.
            sincronizar(false);
        }
    }

    // Chamado por persistirDados() quando os dados do professor mudam (debounced).
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
    global.gcalSync = sincronizar;
    global.gcalAjudaIOS = ajudaIOS;
    global.gcalRenderCard = renderCard;
    global.gcalAoAbrirAgenda = aoAbrirAgenda;
    global.gcalOnDataChanged = aoMudarDados;
})(typeof window !== 'undefined' ? window : this);
