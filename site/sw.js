// Paraíso — service worker: deixa o app abrir mesmo sem internet.
// Estratégia "rede primeiro, com limite": com internet boa, pega a versão
// mais nova do site (e guarda uma cópia). Se a rede demorar mais de 3 s
// (sinal fraco na igreja) ou cair, abre na hora com a última cópia
// guardada — e a versão nova continua baixando por trás para a próxima vez.
// As músicas em si ficam no aparelho (navegador), não aqui.
const CACHE = 'paraiso-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const SLOW_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(req){
  return caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Só os arquivos do próprio site: Spotify, YouTube, fontes etc. passam
  // direto (nunca guardar respostas de outros serviços).
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__')) return; // rotas internas do servidor
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(net.catch(() => {})); // termina de baixar mesmo se já respondemos com a cópia
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const useCache = () => fromCache(req).then((hit) => { if (done) return; if (hit) { done = true; resolve(hit); } });
    const timer = setTimeout(useCache, SLOW_MS);
    net.then((res) => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
       .catch(() => { clearTimeout(timer); fromCache(req).then((hit) => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
  }));
});
