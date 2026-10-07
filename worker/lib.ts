import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { nivelDe, limiteVendedores, PLANOS, tierEfetivo } from './plans'

export type Env = { DB: D1Database; IMAGENS?: R2Bucket; ASSETS: Fetcher; APP_NAME: string; ADMINS?: string; SECRETS_KEY?: string
  ASAAS_URL?: string; ASAAS_API_KEY?: string; ASAAS_WEBHOOK_TOKEN?: string
  RESEND_API_KEY?: string; EMAIL_FROM?: string; EMAIL_PROVIDER?: string; APP_URL?: string }
export type Role = 'admin' | 'manager' | 'seller'
export type Session = { userId: string; tenantId: string; role: Role; name: string; email: string; platformAdmin: boolean }
export type App = { Bindings: Env; Variables: { session: Session } }
export type C = Context<App>

/* ---------- utilidades ---------- */
export const newId = () => crypto.randomUUID()
export function randomToken(bytes = 24): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function sha256(txt: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
/** Comparação de textos em tempo constante (tokens de webhook): compara os SHA-256, então tamanho e conteúdo não vazam por tempo. */
export async function igualConstante(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)])
  let dif = 0; for (let i = 0; i < x.length; i++) dif |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return dif === 0
}
export const digits = (s: string) => (s || '').replace(/\D/g, '')
export const clean = (s: unknown, max = 500) => String(s ?? '').trim().slice(0, max)
export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa'
}

export class AppError extends Error { constructor(public status: number, msg: string) { super(msg) } }
/** `throw fail(404, 'mensagem em português')` → JSON `{ erro }` */
export const fail = (status: number, msg: string) => new AppError(status, msg)

/* ---------- senha (PBKDF2-SHA256, 100k iterações) ---------- */
const ITER = 100_000
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
async function pbkdf2(pw: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256))
}
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(pw, salt, ITER))}`
}
export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, it, s, h] = stored.split('$')
  if (alg !== 'pbkdf2') return false
  const a = b64(await pbkdf2(pw, unb64(s), Number(it)))
  if (a.length !== h.length) return false
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ h.charCodeAt(i)
  return diff === 0
}

/* ---------- segredos por empresa (AES-GCM com SECRETS_KEY do Worker) ---------- */
async function aesKey(env: Env) {
  if (!env.SECRETS_KEY) throw fail(500, 'Chave de criptografia não configurada no servidor (SECRETS_KEY).')
  const raw = unb64(env.SECRETS_KEY)
  if (raw.length !== 32) throw fail(500, 'SECRETS_KEY precisa ter 32 bytes em base64.')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encryptSecret(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain)))
  return `${b64(iv)}.${b64(ct)}`
}
export async function decryptSecret(env: Env, enc: string): Promise<string> {
  const [iv, ct] = enc.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct))
  return new TextDecoder().decode(pt)
}

/* ---------- sessão ---------- */
const COOKIE = 'semeialeads_sessao'
const SESSION_DAYS = 30
export async function createSession(c: C, userId: string, tenantId: string) {
  const token = randomToken(32)
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5)
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, tenant_id, expires_at) VALUES (?,?,?,?)')
    .bind(await sha256(token), userId, tenantId, expires.toISOString()).run()
  setCookie(c, COOKIE, token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', expires })
}
export async function endSession(c: C) {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run()
  deleteCookie(c, COOKIE, { path: '/' })
}
export async function readSession(c: C): Promise<Session | null> {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  const r = await c.env.DB.prepare(
    `SELECT s.user_id, s.tenant_id, s.expires_at, u.name, u.email, m.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       JOIN members m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id AND m.active = 1
      WHERE s.id = ?`).bind(await sha256(token)).first<any>()
  if (!r || new Date(r.expires_at) < new Date()) return null
  return { userId: r.user_id, tenantId: r.tenant_id, role: r.role, name: r.name, email: r.email, platformAdmin: isPlatformAdmin(c.env, r.email) }
}
/** Administradores da plataforma (Grupo Semeia): e-mails na variável ADMINS. */
export const isPlatformAdmin = (env: Env, email: string) =>
  (env.ADMINS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean).includes(String(email).toLowerCase())

/** Toda rota privada passa por aqui e recebe a empresa da sessão. */
export const requireLogin: MiddlewareHandler<App> = async (c, next) => {
  const s = await readSession(c)
  if (!s) return c.json({ erro: 'Faça login para continuar.' }, 401)
  c.set('session', s)
  await next()
}
/** Libera só para os papéis indicados (admin sempre passa). */
export const requireRole = (...roles: Role[]): MiddlewareHandler<App> => async (c, next) => {
  const r = c.get('session').role
  if (r !== 'admin' && !roles.includes(r)) return c.json({ erro: 'Você não tem permissão para isso.' }, 403)
  await next()
}
/** A empresa (tenant) vem SEMPRE da sessão, nunca do corpo da requisição. */
export const tenantOf = (c: C) => c.get('session').tenantId

export async function audit(db: D1Database, tenantId: string, userId: string | null, action: string, detail?: unknown) {
  await db.prepare('INSERT INTO audit_log (id, tenant_id, user_id, action, detail) VALUES (?,?,?,?,?)')
    .bind(newId(), tenantId, userId, action, detail === undefined ? null : JSON.stringify(detail)).run()
}

/* ---------- planos: acesso por nível e limite de vendedores ---------- */
export async function loadTenantPlano(db: D1Database, tenantId: string) {
  const t = await db.prepare('SELECT plan, tier, trial_until, extra_sellers FROM tenants WHERE id = ?').bind(tenantId).first<any>()
  if (!t) throw fail(404, 'Empresa não encontrada.')
  return t as { plan: string; tier: string; trial_until: string | null; extra_sellers: number }
}
/** Libera a rota só para empresas no nível indicado ou acima. Os dados continuam guardados quando o plano cai. */
export const requireNivel = (n: number): MiddlewareHandler<App> => async (c, next) => {
  const t = await loadTenantPlano(c.env.DB, tenantOf(c))
  if (t.plan === 'suspenso') return c.json({ erro: 'Conta suspensa. Fale com o suporte.' }, 403)
  if (nivelDe(t) < n) {
    const nome = Object.values(PLANOS).find(p => p.nivel === n)?.nome
    return c.json({ erro: `Disponível a partir do plano ${nome}.`, nivel: n }, 403)
  }
  await next()
}
/** Garante que há vaga de vendedor (ativos + convites pendentes de vendedor). `ignorar` = usuário que já ocupa a vaga. */
export async function assertVagaVendedor(db: D1Database, tenantId: string, ignorar?: string) {
  const t = await loadTenantPlano(db, tenantId), limite = limiteVendedores(t)
  const r = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM members WHERE tenant_id=?1 AND role='seller' AND active=1 AND user_id <> COALESCE(?2,'')) +
            (SELECT COUNT(*) FROM invites WHERE tenant_id=?1 AND role='seller' AND used_at IS NULL AND expires_at > ?3) AS n`).bind(tenantId, ignorar ?? null, new Date().toISOString()).first<{ n: number }>()
  if ((r?.n ?? 0) >= limite) throw fail(403, `Seu plano ${PLANOS[tierEfetivo(t)].nome} inclui ${limite} vendedor(es). Contrate um vendedor adicional ou mude de plano.`)
}
/** Só administradores da plataforma (Grupo Semeia). Quem não é recebe 404. */
export const requirePlatformAdmin: MiddlewareHandler<App> = async (c, next) => {
  if (!c.get('session').platformAdmin) return c.json({ erro: 'Rota não encontrada.' }, 404)
  await next()
}
