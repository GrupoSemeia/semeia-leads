/* Service worker mínimo: deixa o app instalável na tela inicial do celular.
   NÃO guarda nada em cache de propósito: o app mostra dados de clientes e de vendas, que só podem vir do servidor, com login. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { /* tudo vai direto para a rede */ })
