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

export const STATUS_CONTA: Record<string, [string, string]> = { PROSPECT: ['Nunca comprou', ''], ATIVO: ['Ativo', 'p-aprovado'], EM_RISCO: ['Em risco', 'p-enviado'], INATIVO: ['Inativo', 'p-recusado'] }
const dUTC = (s: string) => new Date(s.replace(' ', 'T') + 'Z')
export const fData = (s: string | null) => (s ? dUTC(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
export const diasDesde = (s: string | null) => (s ? Math.floor((Date.now() - dUTC(s).getTime()) / 864e5) : null)
export const fDias = (s: string | null) => { const d = diasDesde(s); return d === null ? 'nunca' : d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }
export const telWa = (t: string | null) => digitos(t ?? '')
export const brlInt = (centavos: number) => (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export const RESULTADOS: [string, string][] = [['VENDEU', 'Vendeu'], ['ORCAMENTO', 'Mandei orçamento (volta em 3 dias)'], ['SEM_INTERESSE', 'Sem interesse agora (volta em 30 dias)'], ['NAO_RESPONDEU', 'Não respondeu (tenta em 2 dias)'], ['REAGENDAR', 'Reagendar para uma data']]
export const CANAIS: [string, string][] = [['whatsapp', 'WhatsApp'], ['ligacao', 'Ligação'], ['visita', 'Visita'], ['email', 'E-mail']]
export const rotuloResultado = (r: string | null) => RESULTADOS.find(x => x[0] === r)?.[1].replace(/ \(.*\)/, '') ?? 'Anotação'
export const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
