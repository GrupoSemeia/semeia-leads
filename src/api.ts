/* Comunicação com a API e utilidades de formatação */
export class ApiErro extends Error { constructor(public status: number, msg: string) { super(msg) } }

export async function api<T = any>(caminho: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', headers: {} }
  if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); (init.headers as any)['content-type'] = 'application/json' }
  const r = await fetch('/api' + caminho, init)
  const dados: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiErro(r.status, dados.erro ?? 'Não foi possível completar a ação.')
  return dados as T
}

/* dinheiro: o banco guarda centavos */
export const brl = (centavos: number) => (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const digitos = (s: string) => (s || '').replace(/\D/g, '')
export const primeiroNome = (n: string) => (n || '').split(' ')[0]
export const iniciais = (n: string) => (n || '?').split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase()
export const waLink = (tel: string, msg: string) => `https://wa.me/55${digitos(tel)}?text=${encodeURIComponent(msg)}`
export const PAPEL: Record<string, string> = { admin: 'Administrador', manager: 'Gestor', seller: 'Vendedor' }
