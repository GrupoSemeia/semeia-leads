import { describe, it, expect, vi } from 'vitest'
import { criptografar, cabecalhoVapid, enviarPush, endpointValido, chavesValidas, pushAtivo, b64u, unb64u } from './push'
import { caminhoDoLink } from './notify'

const txt = (s: string) => new TextEncoder().encode(s)
async function aparelho() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { par, auth, p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))), authB64: b64u(auth) }
}
async function chavesVapid() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey)
  return { par, env: { VAPID_PUBLIC_KEY: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))), VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: 'mailto:t@example.com' } as any }
}

/** Decifra como o navegador faz (RFC 8291). Também foi conferido com a biblioteca http_ece, que é independente. */
async function decifrar(corpo: Uint8Array, ap: Awaited<ReturnType<typeof aparelho>>) {
  const salt = corpo.slice(0, 16), idlen = corpo[20], asPub = corpo.slice(21, 21 + idlen), cifrado = corpo.slice(21 + idlen)
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ap.par.publicKey))
  const k = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: k }, ap.par.privateKey, 256))
  const hk = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s as any, info: info as any }, await crypto.subtle.importKey('raw', ikm as any, 'HKDF', false, ['deriveBits']), n * 8))
  const ikm = await hk(ap.auth, ecdh, new Uint8Array([...txt('WebPush: info\0'), ...uaPub, ...asPub]), 32)
  const cek = await hk(salt, ikm, txt('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, txt('Content-Encoding: nonce\0'), 12)
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as any }, await crypto.subtle.importKey('raw', cek as any, 'AES-GCM', false, ['decrypt']), cifrado))
  expect(claro[claro.length - 1]).toBe(2)
  return new TextDecoder().decode(claro.slice(0, -1))
}

describe('push: criptografia e assinatura', () => {
  it('o aparelho consegue decifrar o aviso', async () => {
    const ap = await aparelho(), msg = JSON.stringify({ titulo: 'Lead novo', corpo: 'Paulo pediu contato — çãé', url: '/leads' })
    const corpo = await criptografar(txt(msg), ap.p256dh, ap.authB64)
    expect(corpo.length).toBeLessThan(4096)
    expect(await decifrar(corpo, ap)).toBe(msg)
  })
  it('cada envio usa sal e chave diferentes', async () => {
    const ap = await aparelho()
    const a = await criptografar(txt('x'), ap.p256dh, ap.authB64), b = await criptografar(txt('x'), ap.p256dh, ap.authB64)
    expect(b64u(a)).not.toBe(b64u(b))
  })
  it('o cabeçalho VAPID é um JWT ES256 válido para o serviço do endereço', async () => {
    const v = await chavesVapid(), h = await cabecalhoVapid(v.env, 'https://fcm.googleapis.com/fcm/send/abc')
    const [, t] = /t=([^,]+),/.exec(h)!, [cab, cor, sig] = t.split('.')
    expect(JSON.parse(new TextDecoder().decode(unb64u(cab)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(new TextDecoder().decode(unb64u(cor)))
    expect(claims.aud).toBe('https://fcm.googleapis.com'); expect(claims.exp * 1000).toBeGreaterThan(Date.now())
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, v.par.publicKey, unb64u(sig), txt(`${cab}.${cor}`))).toBe(true)
    expect(h.endsWith(`k=${v.env.VAPID_PUBLIC_KEY}`)).toBe(true)
  })
})

describe('push: envio', () => {
  it('só aceita endereços de serviços de push conhecidos', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/x']) expect(endpointValido(ok)).toBe(true)
    for (const mau of ['http://fcm.googleapis.com/x', 'https://exemplo.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'https://169.254.169.254/', 'javascript:alert(1)', '', 42, null]) expect(endpointValido(mau as any)).toBe(false)
  })
  it('confere o tamanho das chaves do aparelho', async () => {
    const ap = await aparelho()
    expect(chavesValidas(ap.p256dh, ap.authB64)).toBe(true)
    expect(chavesValidas('curta', ap.authB64)).toBe(false); expect(chavesValidas(ap.p256dh, 'x')).toBe(false); expect(chavesValidas(1, 2)).toBe(false)
  })
  it('desligado sem as chaves; com elas, interpreta as respostas do serviço', async () => {
    const ap = await aparelho(), v = await chavesVapid(), a = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: ap.p256dh, auth: ap.authB64 }, aviso = { titulo: 't', corpo: 'c', url: '/' }
    expect(pushAtivo({})).toBe(false); expect(await enviarPush({} as any, a, aviso)).toBe('desligado')
    const resp = (status: number) => vi.fn(async () => new Response(null, { status })) as any
    expect(await enviarPush(v.env, a, aviso, resp(201))).toBe('ok')
    expect(await enviarPush(v.env, a, aviso, resp(410))).toBe('sumiu')
    expect(await enviarPush(v.env, a, aviso, resp(404))).toBe('sumiu')
    expect(await enviarPush(v.env, a, aviso, resp(500))).toBe('erro')
    expect(await enviarPush(v.env, a, aviso, vi.fn(async () => { throw new Error('rede') }) as any)).toBe('erro')
    expect(await enviarPush(v.env, { ...a, endpoint: 'https://exemplo.com/x' }, aviso, resp(201))).toBe('sumiu')   // endereço de fora nunca é chamado
  })
  it('manda os cabeçalhos exigidos pelo serviço', async () => {
    const ap = await aparelho(), v = await chavesVapid(), f = vi.fn(async () => new Response(null, { status: 201 }))
    await enviarPush(v.env, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: ap.p256dh, auth: ap.authB64 }, { titulo: 't', corpo: 'c', url: '/' }, f as any)
    const [url, init] = f.mock.calls[0] as any, h = init.headers
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/abc'); expect(init.method).toBe('POST')
    expect(h['content-encoding']).toBe('aes128gcm'); expect(h.ttl).toBe('86400'); expect(h.authorization).toMatch(/^vapid t=.+, k=.+$/)
  })
})

describe('notificação abre só o próprio app', () => {
  it('usa só o caminho do link', () => {
    expect(caminhoDoLink('https://semeia.example/leads?x=1')).toBe('/leads?x=1')
    expect(caminhoDoLink(undefined)).toBe('/'); expect(caminhoDoLink('lixo')).toBe('/')
  })
})
