// sw.js — Service Worker mínimo do SisProf.
// Objetivo: permitir a instalação como app (PWA) no iPhone/iPad e Android e oferecer um
// "shell" offline básico. Estratégia network-first para evitar servir JS/versões desatualizadas.

const CACHE = 'sisprof-shell-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
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
