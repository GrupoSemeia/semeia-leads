/**
 * Regras de negócio da carteira (docs/03-arquitetura.md §5). Funções PURAS: sem I/O, sem relógio global (o "agora" entra por parâmetro).
 * Dinheiro em centavos; datas como Date.
 */
export type Curve = 'A' | 'B' | 'C'
export type AccountStatus = 'PROSPECT' | 'ATIVO' | 'EM_RISCO' | 'INATIVO'

export type Params = {
  ativoDias: number            // até N dias desde o último pedido = ATIVO
  emRiscoDias: number          // até N dias = EM_RISCO; acima disso INATIVO
  curvaA: number               // fração dos clientes (por faturamento) que formam a curva A
  curvaB: number
  freq: { A: number; B: number; C: number; EM_RISCO: number; INATIVO: number; PROSPECT: number }   // dias entre contatos
  peso: { A: number; B: number; C: number; semCurva: number }
  recompraFator: number        // recompra prevista quando dias desde o último pedido >= fator × intervalo médio
  recompraMinPedidos: number
  agendaSize: number
}
export const PARAMS_PADRAO: Params = {
  ativoDias: 90, emRiscoDias: 180, curvaA: 0.2, curvaB: 0.3,
  freq: { A: 7, B: 14, C: 30, EM_RISCO: 15, INATIVO: 45, PROSPECT: 30 },
  peso: { A: 40, B: 25, C: 10, semCurva: 0 },
  recompraFator: 0.9, recompraMinPedidos: 3, agendaSize: 25,
}
/** Mescla parâmetros guardados (parciais, vindos de `settings`) com o padrão, ignorando valores inválidos. */
export function mergeParams(parcial: unknown): Params {
  const p: Params = structuredClone(PARAMS_PADRAO)
  if (!parcial || typeof parcial !== 'object') return p
  const o = parcial as Record<string, any>
  const num = (v: unknown, min: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : undefined)
  p.ativoDias = num(o.ativoDias, 1) ?? p.ativoDias
  p.emRiscoDias = Math.max(p.ativoDias + 1, num(o.emRiscoDias, 1) ?? p.emRiscoDias)
  p.agendaSize = Math.floor(num(o.agendaSize, 1) ?? p.agendaSize)
  p.recompraFator = num(o.recompraFator, 0.1) ?? p.recompraFator
  for (const k of Object.keys(p.freq) as (keyof Params['freq'])[]) p.freq[k] = num(o.freq?.[k], 1) ?? p.freq[k]
  return p
}

export const DIA = 86_400_000
export const diasEntre = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DIA)

/** Status por dias desde o último pedido. Sem pedido = PROSPECT. */
export function statusDe(ultimoPedido: Date | null, agora: Date, p: Params): AccountStatus {
  if (!ultimoPedido) return 'PROSPECT'
  const d = diasEntre(ultimoPedido, agora)
  return d <= p.ativoDias ? 'ATIVO' : d <= p.emRiscoDias ? 'EM_RISCO' : 'INATIVO'
}

/**
 * Curva ABC: entre os clientes com faturamento > 0, os 20% que mais faturam são A, os 30% seguintes B, o resto C.
 * Empate no faturamento desempata pelo id (resultado estável). Cliente sem faturamento fica sem curva.
 */
export function curvaABC(clientes: { id: number; faturamento: number }[], p: Params): Map<number, Curve> {
  const ordenados = clientes.filter(c => c.faturamento > 0).sort((a, b) => b.faturamento - a.faturamento || a.id - b.id)
  const n = ordenados.length, corteA = Math.ceil(n * p.curvaA), corteB = Math.ceil(n * (p.curvaA + p.curvaB))
  const out = new Map<number, Curve>()
  ordenados.forEach((c, i) => out.set(c.id, i < corteA ? 'A' : i < corteB ? 'B' : 'C'))
  return out
}

/** Dias entre contatos: pela curva; EM_RISCO e INATIVO usam o menor entre a curva e a regra do status. */
export function frequenciaDias(curva: Curve | null, status: AccountStatus, p: Params): number {
  const porCurva = curva ? p.freq[curva] : p.freq.PROSPECT
  if (status === 'EM_RISCO') return Math.min(porCurva, p.freq.EM_RISCO)
  if (status === 'INATIVO') return Math.min(porCurva, p.freq.INATIVO)
  return porCurva
}

/** Próximo contato = último contato + frequência; nunca contatado = agora (vence já). "Reagendar" (data manual) tem prioridade. */
export function proximoContato(ultimoContato: Date | null, freqDias: number, agora: Date, reagendadoPara?: Date | null): Date {
  if (reagendadoPara) return reagendadoPara
  return ultimoContato ? new Date(ultimoContato.getTime() + freqDias * DIA) : agora
}

export type MetricasEntrada = { curva: Curve | null; status: AccountStatus; pedidos12m: number; ultimoPedido: Date | null; intervaloMedioDias: number | null; proximoContato: Date }
export const recompraPrevista = (m: Pick<MetricasEntrada, 'pedidos12m' | 'ultimoPedido' | 'intervaloMedioDias'>, agora: Date, p: Params) =>
  m.pedidos12m >= p.recompraMinPedidos && !!m.ultimoPedido && !!m.intervaloMedioDias && diasEntre(m.ultimoPedido, agora) >= p.recompraFator * m.intervaloMedioDias

/** Prioridade 0–100: peso da curva + atraso no contato (até 25) + recompra prevista (20) + risco (15 em risco, 8 inativo). */
export function scorePrioridade(m: MetricasEntrada, agora: Date, p: Params): number {
  const curva = m.curva ? p.peso[m.curva] : p.peso.semCurva
  const atraso = Math.min(25, Math.max(0, diasEntre(m.proximoContato, agora)) * 2)
  const recompra = recompraPrevista(m, agora, p) ? 20 : 0
  const risco = m.status === 'EM_RISCO' ? 15 : m.status === 'INATIVO' ? 8 : 0
  return Math.min(100, curva + atraso + recompra + risco)
}

/** Motivo em português para mostrar ao vendedor. */
export function motivoDe(m: MetricasEntrada & { ultimoContato: Date | null }, agora: Date, p: Params): string {
  const semPedido = m.ultimoPedido ? diasEntre(m.ultimoPedido, agora) : null
  if (m.status === 'PROSPECT') return 'Ainda não comprou'
  if (m.status === 'INATIVO') return `Inativo — ${semPedido} dias sem comprar`
  if (m.status === 'EM_RISCO') return `Em risco — ${semPedido} dias sem comprar`
  if (recompraPrevista(m, agora, p)) return 'Recompra prevista'
  const semContato = m.ultimoContato ? diasEntre(m.ultimoContato, agora) : null
  const curva = m.curva ? `Curva ${m.curva} — ` : ''
  return semContato === null ? `${curva}nunca contatado` : `${curva}${semContato} dias sem contato`
}

export type ContaAgenda = MetricasEntrada & { id: number; ultimoContato: Date | null; score: number }
/** Agenda do dia: contas com contato vencido, maior prioridade primeiro (desempate: contato mais antigo), até `agendaSize`. */
export function montarAgenda<T extends ContaAgenda>(contas: T[], agora: Date, p: Params): (T & { motivo: string })[] {
  return contas
    .filter(c => c.proximoContato.getTime() <= agora.getTime())
    .sort((a, b) => b.score - a.score || a.proximoContato.getTime() - b.proximoContato.getTime() || a.id - b.id)
    .slice(0, p.agendaSize)
    .map(c => ({ ...c, motivo: motivoDe(c, agora, p) }))
}

/** Positivação do mês: clientes da carteira (ativos, em risco, inativos) com ≥1 pedido no mês ÷ clientes da carteira. */
export function positivacao(contas: { id: number; status: AccountStatus }[], compraramNoMes: Set<number>): { total: number; positivados: number; taxa: number } {
  const carteira = contas.filter(c => c.status !== 'PROSPECT')
  const positivados = carteira.filter(c => compraramNoMes.has(c.id)).length
  return { total: carteira.length, positivados, taxa: carteira.length ? positivados / carteira.length : 0 }
}
