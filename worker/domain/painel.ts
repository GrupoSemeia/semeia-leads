/** Regras do painel do gestor (Sprint 7). Funções PURAS. Meses e janelas no fuso de Brasília (UTC-3); o banco guarda UTC. */
import { DIA } from './carteira'

const pad = (n: number) => String(n).padStart(2, '0')
export const mesValido = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
const BRASILIA_H = 3   // UTC-3: o dia/mês local começa às 03:00 UTC
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/** Mês de Brasília de `agora` (AAAA-MM). */
export const mesDe = (agora: Date) => new Date(agora.getTime() - BRASILIA_H * 3600e3).toISOString().slice(0, 7)

/** Intervalo [de, ate) do mês local em UTC 'AAAA-MM-DD HH:MM:SS'. */
export function janelaDoMes(ym: string): { de: string; ate: string } {
  const [y, m] = ym.split('-').map(Number)
  return { de: fmtUtc(Date.UTC(y, m - 1, 1, BRASILIA_H)), ate: fmtUtc(Date.UTC(y, m, 1, BRASILIA_H)) }
}
/** Os `n` meses que terminam em `ym`, do mais antigo ao mais novo. */
export function mesesAte(ym: string, n: number): string[] {
  const [y, m] = ym.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` })
}
export const rotuloMes = (ym: string) => { const [y, m] = ym.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${y.slice(2)}` }

/** Razão em 0–1 (0 quando não há base). */
export const taxa = (parte: number, total: number) => (total > 0 ? parte / total : 0)
/** Variação percentual contra o período anterior; null quando não há base de comparação. */
export const variacaoPct = (atual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null)

/** NPS: % de promotores (9–10) menos % de detratores (0–6), de −100 a 100. Sem respostas, não há nota. */
export function calcularNps(notas: number[]): { respostas: number; promotores: number; neutros: number; detratores: number; nps: number | null; media: number | null } {
  const v = notas.filter(n => Number.isInteger(n) && n >= 0 && n <= 10)
  const promotores = v.filter(n => n >= 9).length, detratores = v.filter(n => n <= 6).length, neutros = v.length - promotores - detratores
  if (!v.length) return { respostas: 0, promotores: 0, neutros: 0, detratores: 0, nps: null, media: null }
  return { respostas: v.length, promotores, neutros, detratores, nps: Math.round(((promotores - detratores) / v.length) * 100), media: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 }
}

/** Janela dos últimos `dias` dias e a imediatamente anterior, de mesmo tamanho (para o comparativo). */
export function janelasComparativo(agora: Date, dias = 60): { atual: { de: string; ate: string }; anterior: { de: string; ate: string } } {
  const fim = agora.getTime(), meio = fim - dias * DIA, ini = meio - dias * DIA
  return { atual: { de: fmtUtc(meio), ate: fmtUtc(fim) }, anterior: { de: fmtUtc(ini), ate: fmtUtc(meio) } }
}

/** "Reativado": voltou a comprar depois de mais de `limiteDias` sem comprar (e já tinha comprado antes). */
export function foiReativado(pedidoAnterior: Date | null, primeiroNaJanela: Date, limiteDias = 180): boolean {
  return !!pedidoAnterior && (primeiroNaJanela.getTime() - pedidoAnterior.getTime()) / DIA > limiteDias
}
/** Cumprimento da agenda: contatos feitos ÷ (feitos + ainda vencidos). Sem nada devido nem feito, não há o que cumprir. */
export const cumprimentoAgenda = (feitos: number, vencidos: number) => taxa(feitos, feitos + vencidos)
