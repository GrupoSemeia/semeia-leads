import type { Env } from './lib'

/**
 * Avisos no aparelho (Web Push, RFC 8030) com VAPID (RFC 8292) e conteúdo criptografado (RFC 8291, aes128gcm).
 * Chaves no formato padrão do web-push: VAPID_PUBLIC_KEY = ponto P-256 de 65 bytes e VAPID_PRIVATE_KEY = valor "d" de 32 bytes, ambos em base64url.
 * Sem as duas chaves o recurso fica DESLIGADO e nada é enviado.
 */
export const pushAtivo = (env: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY'>) => !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY

export const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const unb64u = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/'), pad = t + '='.repeat((4 - (t.length % 4)) % 4)
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
}
const juntar = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
const txt = (s: string) => new TextEncoder().encode(s)

/** Só serviços de push dos navegadores conhecidos: o endereço vem do navegador da pessoa e o servidor chama esse endereço. */
const HOSTS_PUSH = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9.-]+\.push\.apple\.com$/, /^[a-z0-9.-]+\.notify\.windows\.com$/]
export function endpointValido(e: unknown): e is string {
  if (typeof e !== 'string' || e.length > 1000) return false
  try { const u = new URL(e); return u.protocol === 'https:' && !u.username && !u.password && HOSTS_PUSH.some(r => r.test(u.hostname)) } catch { return false }
}
export const chavesValidas = (p256dh: unknown, auth: unknown) => {
  try { return typeof p256dh === 'string' && typeof auth === 'string' && unb64u(p256dh).length === 65 && unb64u(p256dh)[0] === 4 && unb64u(auth).length === 16 } catch { return false }
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8))
}

/** Corpo aes128gcm de um único registro (RFC 8291). `fixo` só existe para os testes. */
export async function criptografar(dados: Uint8Array, p256dh: string, auth: string, fixo?: { salt?: Uint8Array<ArrayBuffer>; par?: CryptoKeyPair }): Promise<Uint8Array> {
  const uaPub = unb64u(p256dh), authSecret = unb64u(auth)
  const par = fixo?.par ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, par.privateKey, 256))
  const salt = fixo?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const ikm = await hkdf(authSecret, ecdh as Uint8Array<ArrayBuffer>, juntar(txt('WebPush: info\0'), uaPub, asPub) as Uint8Array<ArrayBuffer>, 32)
  const cek = await hkdf(salt, ikm as Uint8Array<ArrayBuffer>, txt('Content-Encoding: aes128gcm\0') as Uint8Array<ArrayBuffer>, 16)
  const nonce = await hkdf(salt, ikm as Uint8Array<ArrayBuffer>, txt('Content-Encoding: nonce\0') as Uint8Array<ArrayBuffer>, 12)
  const chave = await crypto.subtle.importKey('raw', cek as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt'])
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as Uint8Array<ArrayBuffer> }, chave, juntar(dados, new Uint8Array([2])) as Uint8Array<ArrayBuffer>))
  const rs = new Uint8Array([0, 0, 0x10, 0])   // 4096
  return juntar(salt, rs, new Uint8Array([asPub.length]), asPub, cifrado)
}

/** Assinatura VAPID (JWT ES256) para o serviço de push do endereço informado. */
export async function cabecalhoVapid(env: Env, endpoint: string, agora = Date.now()): Promise<string> {
  const pub = unb64u(env.VAPID_PUBLIC_KEY!), d = env.VAPID_PRIVATE_KEY!
  const jwk = { kty: 'EC', crv: 'P-256', d, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) }
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const cab = b64u(txt(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const corpo = b64u(txt(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:contato@gruposemeiadigital.com.br' })))
  const assin = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, txt(`${cab}.${corpo}`)))
  return `vapid t=${cab}.${corpo}.${b64u(assin)}, k=${env.VAPID_PUBLIC_KEY}`
}

export type Aparelho = { endpoint: string; p256dh: string; auth: string }
export type Aviso = { titulo: string; corpo: string; url: string }
export type ResultadoPush = 'ok' | 'sumiu' | 'erro' | 'desligado'

/** Envia um aviso a um aparelho. 'sumiu' (404/410) = o aparelho desligou as notificações: apague a inscrição. */
export async function enviarPush(env: Env, ap: Aparelho, aviso: Aviso, f: typeof fetch = fetch): Promise<ResultadoPush> {
  if (!pushAtivo(env)) return 'desligado'
  if (!endpointValido(ap.endpoint) || !chavesValidas(ap.p256dh, ap.auth)) return 'sumiu'
  try {
    const corpo = await criptografar(txt(JSON.stringify(aviso)), ap.p256dh, ap.auth)
    const r = await f(ap.endpoint, { method: 'POST', body: corpo as Uint8Array<ArrayBuffer>, signal: AbortSignal.timeout(6000), headers: {
      authorization: await cabecalhoVapid(env, ap.endpoint), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal' } })
    if (r.status === 404 || r.status === 410) return 'sumiu'
    if (!r.ok) { console.warn('push recusado', new URL(ap.endpoint).hostname, r.status); return 'erro' }
    return 'ok'
  } catch (e) { console.warn('push falhou', (e as Error)?.name); return 'erro' }   // nunca registra o endereço do aparelho
}

/** Envia a todos os aparelhos de uma lista e apaga os que não existem mais. */
export async function enviarParaAparelhos(env: Env, aparelhos: (Aparelho & { id: string })[], aviso: Aviso, f: typeof fetch = fetch) {
  const sumiram: string[] = []; let ok = 0
  for (const a of aparelhos) { const r = await enviarPush(env, a, aviso, f); if (r === 'ok') ok++; else if (r === 'sumiu') sumiram.push(a.id) }
  if (sumiram.length) await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id IN (${sumiram.map(() => '?').join(',')})`).bind(...sumiram).run()
  return { enviados: ok, removidos: sumiram.length }
}
