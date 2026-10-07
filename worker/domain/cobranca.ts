/**
 * Regras de cobrança dos planos (Asaas). Funções PURAS (sem I/O; datas como 'AAAA-MM-DD' no dia local de Brasília).
 * O plano só passa a valer com o pagamento confirmado; o acesso é calculado pela data até a qual está pago, sem rotina diária.
 */
import { PLANOS, VENDEDOR_EXTRA, MESES_PAGOS_NO_ANO, ehTier, type Tier } from '../plans'

export type Ciclo = 'MONTHLY' | 'YEARLY'
export const CICLOS: Ciclo[] = ['MONTHLY', 'YEARLY']
export const MAX_VENDEDORES_EXTRA = 100
/** Dias de tolerância depois do vencimento antes de bloquear o acesso (cobrança atrasada). */
export const TOLERANCIA_DIAS = 10

/* ---------- documentos ---------- */
const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
export function cpfValido(v: unknown): boolean {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}
export function cnpjValidoCobranca(v: unknown): boolean {
  const d = soDigitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => { const w = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = [...base].reduce((a, c, i) => a + Number(c) * w[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const a = dv(d.slice(0, 12)), b = dv(d.slice(0, 12) + a)
  return d.endsWith(`${a}${b}`)
}
export const documentoValido = (v: unknown) => cpfValido(v) || cnpjValidoCobranca(v)

/* ---------- valores ---------- */
/** Valor de cada cobrança, em centavos: plano + vendedores extras (mensal) ou 10 × mensal (anual, 2 meses grátis). */
export function valorDaAssinatura(tier: Tier, extra: number, ciclo: Ciclo): number {
  const mensal = PLANOS[tier].preco + Math.max(0, Math.floor(extra)) * VENDEDOR_EXTRA
  return ciclo === 'YEARLY' ? mensal * MESES_PAGOS_NO_ANO : mensal
}
export type PedidoAssinatura = { tier: Tier; extraSellers: number; ciclo: Ciclo; cpfCnpj: string }
export function validarPedidoAssinatura(b: unknown, exigirDocumento = true): { ok: true; pedido: PedidoAssinatura } | { ok: false; erro: string } {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, any>
  if (!ehTier(o.tier)) return { ok: false, erro: 'Escolha um plano.' }
  const extra = o.extraSellers === undefined || o.extraSellers === '' ? 0 : Number(o.extraSellers)
  if (!Number.isInteger(extra) || extra < 0 || extra > MAX_VENDEDORES_EXTRA) return { ok: false, erro: `Vendedores adicionais: de 0 a ${MAX_VENDEDORES_EXTRA}.` }
  const ciclo = o.ciclo === undefined ? 'MONTHLY' : o.ciclo
  if (!CICLOS.includes(ciclo)) return { ok: false, erro: 'Escolha cobrança mensal ou anual.' }
  const doc = soDigitos(o.cpfCnpj)
  if (exigirDocumento && !documentoValido(doc)) return { ok: false, erro: 'Informe um CPF ou CNPJ válido (só os números).' }
  return { ok: true, pedido: { tier: o.tier, extraSellers: extra, ciclo, cpfCnpj: doc } }
}

/* ---------- datas ---------- */
const parse = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return { y, m, d } }
const fmt = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
export function somarMeses(iso: string, n: number): string {
  const { y, m, d } = parse(iso), t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = (t % 12) + 1
  return fmt(ny, nm, Math.min(d, ultimoDia(ny, nm)))
}
export function somarDias(iso: string, n: number): string { const { y, m, d } = parse(iso), dt = new Date(Date.UTC(y, m - 1, d + n)); return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()) }
export const diaLocal = (agora: Date) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10)

/** Primeira cobrança: no fim do teste grátis (dia local); se o teste já acabou ou não há teste, hoje. */
export function primeiroVencimento(trialUntilIso: string | null, hoje: string): string {
  if (!trialUntilIso) return hoje
  const fim = diaLocal(new Date(trialUntilIso))
  return fim > hoje ? fim : hoje
}
/** Até quando um pagamento cobre o acesso: o vencimento mais um ciclo. */
export const pagoAte = (vencimento: string, ciclo: Ciclo) => (ciclo === 'YEARLY' ? somarMeses(vencimento, 12) : somarMeses(vencimento, 1))

/* ---------- eventos da Asaas ---------- */
export const STATUS_PAGO = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']
export type EfeitoEvento = 'pago' | 'atrasado' | 'cancelado' | 'ignorar'
export function efeitoDoEvento(evento: string, statusDaCobranca?: string): EfeitoEvento {
  if (evento === 'SUBSCRIPTION_DELETED' || evento === 'SUBSCRIPTION_INACTIVATED') return 'cancelado'
  if (evento === 'PAYMENT_OVERDUE') return 'atrasado'
  if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH', 'PAYMENT_UPDATED'].includes(evento) && statusDaCobranca && STATUS_PAGO.includes(statusDaCobranca)) return 'pago'
  return 'ignorar'
}

/* ---------- acesso ---------- */
export type EstadoConta = { plan: string; trialUntil: string | null; assinatura: { status: string; pagoAte: string | null } | null }
export type Acesso = { liberado: boolean; motivo: 'ok' | 'teste_acabou' | 'suspenso' | 'sem_pagamento' | 'cancelado'; aviso: null | 'teste_acaba' | 'atrasada'; diasDeTeste: number | null; ateQuando: string | null }
/**
 * Quem pode usar o app. Suspenso pelo suporte: bloqueado. Teste: livre até acabar. Ativo sem assinatura (liberado à mão pelo suporte): livre.
 * Ativo com assinatura: livre até a data paga + tolerância; cancelada: só até a data paga. Dados nunca são apagados.
 */
export function acessoLiberado(c: EstadoConta, agora: Date): Acesso {
  const hoje = diaLocal(agora), base: Acesso = { liberado: true, motivo: 'ok', aviso: null, diasDeTeste: null, ateQuando: null }
  if (c.plan === 'suspenso') return { ...base, liberado: false, motivo: 'suspenso' }
  if (c.plan === 'trial') {
    const fim = c.trialUntil ? new Date(c.trialUntil).getTime() : 0
    if (fim <= agora.getTime()) return { ...base, liberado: false, motivo: 'teste_acabou' }
    const dias = Math.ceil((fim - agora.getTime()) / 864e5)
    return { ...base, diasDeTeste: dias, aviso: dias <= 3 ? 'teste_acaba' : null }
  }
  const a = c.assinatura
  if (!a || !a.pagoAte) return base
  const limite = a.status === 'cancelada' ? a.pagoAte : somarDias(a.pagoAte, TOLERANCIA_DIAS)
  if (hoje > limite) return { ...base, liberado: false, motivo: a.status === 'cancelada' ? 'cancelado' : 'sem_pagamento', ateQuando: limite }
  return { ...base, ateQuando: limite, aviso: hoje > a.pagoAte && a.status !== 'cancelada' ? 'atrasada' : null }
}
