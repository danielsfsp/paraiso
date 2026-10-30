// App de produção desativado: este service worker apaga as cópias guardadas,
// se desinstala e recarrega as abas (que então vão para o novo endereço).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach((c) => { try{ c.navigate(c.url); }catch(e){} });
  })());
});
