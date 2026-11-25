// Servidor de IA de texto do EdiProf como Cloudflare Worker (grátis, sem máquina).
// Faz o mesmo que o servidor.py: recebe o pedido do app, chama o Gemini com as chaves
// guardadas SÓ na Cloudflare e devolve o texto. Mesmas rotas, então o app não muda:
//   GET  /saude    -> {"ok": true, "chaves": N}            (sem chave; teste de alcance)
//   POST /v1/gerar -> {"prompt", "modelos", "temperatura"}  (Authorization: Bearer CHAVE_APP)
//   POST /v1/imagem -> {"prompt", "passos"} -> {"imagem": "data:image/...;base64,...", "modelo"}
//        Desenha com a IA de imagem da própria Cloudflare (Workers AI, modelo Flux schnell; plano
//        grátis = 10 mil "neurons"/dia, uns 200 desenhos). Precisa ligar em Settings → Bindings →
//        + Add → Workers AI, com o nome AI. Sem isso (ou se falhar), tenta os modelos de imagem
//        do Gemini com as GEMINI_KEYS (a chave grátis normalmente não tem acesso).
//
// Configuração no painel da Cloudflare (Worker → Settings → Variables and Secrets):
//   CHAVE_APP   (Secret)  chave que o app manda; invente uma longa (ver LEIAME.md)
//   GEMINI_KEYS (Secret)  chaves do Gemini, separadas por vírgula, na ordem de preferência
//   ORIGENS     (Text, opcional) sites que podem chamar, separados por vírgula
// Arquivo único, sem dependências: dá para colar direto no editor da Cloudflare.

const ORIGENS_PADRAO = 'https://ediprof.vercel.app,https://rafanunesran.github.io';
const MODELOS_PADRAO = ['gemini-3.6-flash', 'gemini-2.5-flash'];
const LIMITE_CORPO = 2 * 1024 * 1024;
const LIMITE_POR_CHAMADA_MS = 40000;
const LIMITE_TOTAL_MS = 80000; // o app espera 90 s
const MODELO_OK = /^[A-Za-z0-9._-]{1,80}$/;
const MODELO_IMAGEM_CF = '@cf/black-forest-labs/flux-1-schnell';
const MODELOS_IMAGEM_GEMINI = ['gemini-2.5-flash-image'];

const lista = (s) => String(s || '').split(/[,\n]/).map(x => x.split('#')[0].trim()).filter(Boolean);
const fimDaChave = (k) => (k.length > 4 ? '…' + k.slice(-4) : '…');

async function chamarGemini(base, chave, modelo, prompt, temperatura, limiteMs) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), limiteMs);
    let r;
    try {
        r = await fetch(`${base}/v1beta/models/${modelo}:generateContent`, {
            method: 'POST', signal: ctl.signal,
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: temperatura, response_mime_type: 'application/json' },
                // Mesmos limiares do app: documentos sobre deficiência/apoio a estudantes são legítimos.
                safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
                    'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
                    .map(category => ({ category, threshold: 'BLOCK_NONE' }))
            })
        });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error(`o Gemini não respondeu em ${Math.round(limiteMs / 1000)} s`);
        throw new Error(`não conectou no Gemini (${e.message})`);
    } finally { clearTimeout(t); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(j.error && j.error.message) || r.statusText}`);
    const c = (j.candidates || [])[0];
    if (!c || !c.content) {
        const motivo = (j.promptFeedback && j.promptFeedback.blockReason) || (c && c.finishReason);
        throw new Error(motivo ? `o Gemini bloqueou a resposta pelo filtro de segurança (motivo: ${motivo})` : 'a IA não devolveu conteúdo');
    }
    const texto = (c.content.parts || []).map(p => p.text || '').join('');
    if (!texto) throw new Error('a IA não devolveu conteúdo');
    return texto;
}

async function gerar(env, prompt, modelos, temperatura) {
    const chaves = lista(env.GEMINI_KEYS);
    if (!chaves.length) return [503, { erro: 'O servidor não tem nenhuma chave do Gemini (GEMINI_KEYS na Cloudflare).' }];
    const base = env.GEMINI_URL || 'https://generativelanguage.googleapis.com';
    const inicio = Date.now();
    const detalhes = [];
    const fila = [...modelos];
    const tentados = new Set();
    while (fila.length) {
        const modelo = fila.shift();
        if (tentados.has(modelo)) continue;
        tentados.add(modelo);
        for (const chave of chaves) {
            const resta = LIMITE_TOTAL_MS - (Date.now() - inicio);
            if (resta < 3000) {
                detalhes.push({ chave: '', modelo, erro: `tempo total esgotado (${LIMITE_TOTAL_MS / 1000} s)` });
                return [502, { erro: 'Nenhuma chave respondeu a tempo.', detalhes }];
            }
            try {
                const texto = await chamarGemini(base, chave, modelo, prompt, temperatura, Math.min(LIMITE_POR_CHAMADA_MS, resta));
                return [200, { texto, modelo }];
            } catch (e) {
                detalhes.push({ chave: fimDaChave(chave), modelo, erro: e.message });
                // Modelo aposentado: o próprio Google diz qual usar.
                const m = /use\s+models\/([A-Za-z0-9._-]+)/i.exec(e.message);
                if (m && !tentados.has(m[1]) && MODELO_OK.test(m[1])) { fila.unshift(m[1]); break; }
            }
        }
    }
    return [502, { erro: 'Todas as chaves do servidor falharam.', detalhes }];
}

async function gerarImagem(env, prompt, passos) {
    const erros = [];
    if (env.AI && typeof env.AI.run === 'function') {
        try {
            const r = await env.AI.run(MODELO_IMAGEM_CF, { prompt: prompt.slice(0, 2048), steps: passos });
            const b64 = r && (r.image || (r.result && r.result.image));
            if (!b64) throw new Error('a IA de imagem não devolveu imagem');
            return [200, { imagem: 'data:image/jpeg;base64,' + b64, modelo: 'flux-1-schnell' }];
        } catch (e) {
            erros.push({ chave: '', modelo: 'flux-1-schnell', erro: String(e.message || e).slice(0, 300) });
        }
    } else {
        erros.push({ chave: '', modelo: 'flux-1-schnell', erro: 'Workers AI não está ligada (Settings → Bindings → Workers AI, nome AI)' });
    }
    const base = env.GEMINI_URL || 'https://generativelanguage.googleapis.com';
    for (const modelo of MODELOS_IMAGEM_GEMINI) {
        for (const chave of lista(env.GEMINI_KEYS)) {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 60000);
            try {
                const r = await fetch(`${base}/v1beta/models/${modelo}:generateContent`, {
                    method: 'POST', signal: ctl.signal,
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(`Gemini ${r.status}: ${(j.error && j.error.message) || r.statusText}`);
                const partes = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
                const p = partes.find(x => x.inlineData || x.inline_data);
                if (!p) throw new Error('o modelo não devolveu imagem');
                const d = p.inlineData || p.inline_data;
                return [200, { imagem: 'data:' + (d.mimeType || d.mime_type || 'image/png') + ';base64,' + d.data, modelo }];
            } catch (e) {
                erros.push({ chave: fimDaChave(chave), modelo, erro: e.name === 'AbortError' ? 'tempo esgotado (60 s)' : String(e.message || e).slice(0, 300) });
            } finally { clearTimeout(t); }
        }
    }
    return [502, { erro: 'Não consegui gerar a imagem.', detalhes: erros }];
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        const origens = lista(env.ORIGENS || ORIGENS_PADRAO).map(o => o.replace(/\/+$/, ''));
        const origemPedido = (req.headers.get('Origin') || '').replace(/\/+$/, '');
        const origem = origens.includes(origemPedido) ? origemPedido : '';
        const cors = origem ? { 'Access-Control-Allow-Origin': origem, 'Vary': 'Origin' } : {};
        const responder = (codigo, obj) => new Response(JSON.stringify(obj), {
            status: codigo,
            headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors)
        });

        if (req.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: origem ? Object.assign({
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400' }, cors) : {} });
        }
        if (req.method === 'GET' && url.pathname === '/saude') {
            return responder(200, { ok: true, servico: 'EdiProf IA', chaves: lista(env.GEMINI_KEYS).length, imagem: !!(env.AI && env.AI.run) });
        }
        const rota = url.pathname;
        if (req.method !== 'POST' || (rota !== '/v1/gerar' && rota !== '/v1/imagem')) return responder(404, { erro: 'não encontrado' });
        if (origemPedido && !origem) return responder(403, { erro: 'site não autorizado' });
        const chaveApp = String(env.CHAVE_APP || '').trim();
        if (!chaveApp || req.headers.get('Authorization') !== 'Bearer ' + chaveApp) return responder(401, { erro: 'chave errada' });

        const bruto = await req.text();
        if (!bruto || bruto.length > LIMITE_CORPO) return responder(413, { erro: 'pedido vazio ou grande demais' });
        let pedido;
        try { pedido = JSON.parse(bruto); } catch (_) { return responder(400, { erro: 'pedido inválido' }); }
        const prompt = pedido && pedido.prompt;
        if (typeof prompt !== 'string' || !prompt.trim()) return responder(400, { erro: 'faltou o prompt' });
        if (rota === '/v1/imagem') {
            const passos = Math.max(1, Math.min(8, Math.round(Number(pedido.passos) || 4)));
            const [c, r] = await gerarImagem(env, prompt, passos);
            return responder(c, r);
        }
        const modelos = (Array.isArray(pedido.modelos) ? pedido.modelos : [])
            .filter(m => typeof m === 'string' && MODELO_OK.test(m)).slice(0, 4);
        let temperatura = Number(pedido.temperatura);
        if (!Number.isFinite(temperatura)) temperatura = 0.7;
        temperatura = Math.max(0, Math.min(2, temperatura));
        const [codigo, resp] = await gerar(env, prompt, modelos.length ? modelos : MODELOS_PADRAO, temperatura);
        return responder(codigo, resp);
    }
};
