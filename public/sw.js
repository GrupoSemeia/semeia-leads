/* Service worker mínimo: deixa o app instalável na tela inicial do celular.
   NÃO guarda nada em cache de propósito: o app mostra dados de clientes e de vendas, que só podem vir do servidor, com login. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { /* tudo vai direto para a rede */ })

/* Notificações (Web Push): o servidor manda {titulo, corpo, url}; tocar abre o app no caminho indicado (só caminhos do próprio app). */
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { /* aviso sem corpo legível */ }
  e.waitUntil(self.registration.showNotification(String(d.titulo || 'Semeia Leads'), {
    body: String(d.corpo || ''), icon: '/icon-192.png', data: { url: typeof d.url === 'string' ? d.url : '/' } }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const alvo = e.notification.data && e.notification.data.url
  const caminho = typeof alvo === 'string' && alvo.startsWith('/') && !alvo.startsWith('//') ? alvo : '/'
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abertas) { if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(caminho) } catch { /* outra origem */ } } return } }
    await self.clients.openWindow(caminho)
  })())
})
