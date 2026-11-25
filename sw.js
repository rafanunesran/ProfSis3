// sw.js — Service Worker mínimo do EdiProf.
// Objetivo: permitir a instalação como app (PWA) no iPhone/iPad e Android e oferecer um
// "shell" offline básico. Estratégia network-first para evitar servir JS/versões desatualizadas.

const CACHE = 'sisprof-shell-v3';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CACHE_COMPARTILHADO).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

// "Compartilhar" do WhatsApp (ou da galeria) para o EdiProf instalado: o manifest manda para cá
// (share_target, POST com texto e fotos). Guardamos no cache e abrimos o app; avisos_ia.js pega
// dali e abre a tela "📥 Aviso da gestão" já preenchida.
const CACHE_COMPARTILHADO = 'ediprof-compartilhado';
async function receberCompartilhado(req) {
    try {
        const form = await req.formData();
        const texto = ['titulo', 'texto', 'link'].map(k => form.get(k)).filter(v => typeof v === 'string' && v.trim()).join('\n');
        const fotos = form.getAll('fotos').filter(f => f && typeof f === 'object' && f.size).slice(0, 4);
        const cache = await caches.open(CACHE_COMPARTILHADO);
        await Promise.all((await cache.keys()).map(k => cache.delete(k)));
        await cache.put('./compartilhado/texto', new Response(texto));
        await cache.put('./compartilhado/qtd', new Response(String(fotos.length)));
        for (let i = 0; i < fotos.length; i++) {
            await cache.put('./compartilhado/foto-' + i, new Response(fotos[i], { headers: { 'Content-Type': fotos[i].type || 'image/jpeg' } }));
        }
    } catch (e) { /* abre o app mesmo assim, com a tela vazia */ }
    return Response.redirect(new URL('./index.html?aviso-compartilhado=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/compartilhar-aviso')) {
        event.respondWith(receberCompartilhado(req));
        return;
    }
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Não interfere em Firebase, Google, Analytics, CDNs — deixa a rede cuidar.
    if (url.origin !== self.location.origin) return;

    // Network-first: sempre tenta a rede; usa cache só como fallback offline.
    event.respondWith(
        fetch(req)
            .then(resp => {
                if (resp && resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
                }
                return resp;
            })
            .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
});
