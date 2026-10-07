/**
 * Cliente da API Rein (ERP Ctrl-e). ÚNICO lugar do código que fala com a Rein.
 * Assinatura: HMAC-SHA256(ClientSecret, `${endpoint}.${database}.${timestamp}`) em hex.
 * ⚠️ VALIDAR com a Rein se o endpoint assinado inclui id e querystring (docs/02-api-rein.md §1).
 */
export type ReinCredentials = { baseUrl: string; clientId: string; clientSecret: string; database: string; signIncludeQuery?: boolean }
export type SignOptions = { ttlSeconds?: number; now?: () => number }

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

export async function signRequest(pathWithQuery: string, creds: ReinCredentials, opts: SignOptions = {}): Promise<Record<string, string>> {
  const ttl = Math.min(opts.ttlSeconds ?? 300, 900)
  const timestamp = String(Math.floor((opts.now ?? Date.now)() / 1000) + ttl)
  const endpoint = creds.signIncludeQuery ? pathWithQuery : pathWithQuery.split('?')[0]
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(creds.clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const token = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${endpoint}.${creds.database}.${timestamp}`)))
  return { 'Content-Type': 'application/json', Token: token, Database: creds.database, Timestamp: timestamp, ClientId: creds.clientId }
}

export class ReinError extends Error { constructor(public status: number, msg: string) { super(msg) } }

/**
 * GET/PUT/POST assinado, com timeout de 30 s. Leituras (GET) tentam até 3 vezes (429/5xx/timeout) com espera exponencial.
 * Escritas (PUT/POST) NUNCA repetem sozinhas: uma falha depois que o ERP já gravou criaria pedido/cadastro em duplicidade.
 */
export async function reinFetch<T>(method: 'GET' | 'PUT' | 'POST', pathWithQuery: string, creds: ReinCredentials, body?: unknown, opts: { esperaMs?: number } = {}): Promise<T> {
  let last: unknown
  const tentativas = method === 'GET' ? 3 : 1
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    if (tentativa) await new Promise(r => setTimeout(r, (opts.esperaMs ?? 500) * 2 ** tentativa))
    try {
      const res = await fetch(creds.baseUrl.replace(/\/$/, '') + pathWithQuery, {
        method, headers: await signRequest(pathWithQuery, creds), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 429 || res.status >= 500) { last = new ReinError(res.status, `Rein respondeu HTTP ${res.status}`); continue }
      if (!res.ok) throw new ReinError(res.status, `Rein ${method} ${pathWithQuery.split('?')[0]} → HTTP ${res.status}`)
      return (await res.json()) as T
    } catch (e) {
      if (e instanceof ReinError && e.status < 500 && e.status !== 429) throw e
      last = e
    }
  }
  throw last instanceof Error ? last : new ReinError(0, 'Falha ao falar com a Rein.')
}

/** Teste de conexão: lista usuários (endpoint barato). */
export const reinPing = (creds: ReinCredentials) => reinFetch<unknown>('GET', '/api/v1/usuario', creds)
