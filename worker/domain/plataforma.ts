/** Regras da administração da plataforma (Grupo Semeia). Funções PURAS. Mostra números de uso e cobrança, nunca dados de negócio das empresas. */
import { DIA } from './carteira'

/** Receita mensal recorrente (centavos): assinaturas ativas ou atrasadas; anual conta 1/12. Pendente e cancelada não contam. */
export function receitaMensal(subs: { status: string; cycle: string; value: number }[]): number {
  return Math.round(subs.filter(s => s.status === 'ativa' || s.status === 'atrasada').reduce((t, s) => t + (s.cycle === 'YEARLY' ? s.value / 12 : s.value), 0))
}
/** Novo fim de teste: soma `dias` ao que sobrou (ou a partir de agora, se já acabou). 1 a 90 dias. */
export function estenderTeste(trialUntil: string | null, dias: unknown, agora: Date): { ok: true; novo: string } | { ok: false; erro: string } {
  const n = Number(dias)
  if (!Number.isInteger(n) || n < 1 || n > 90) return { ok: false, erro: 'Estenda o teste de 1 a 90 dias.' }
  const atual = trialUntil ? new Date(trialUntil).getTime() : 0
  return { ok: true, novo: new Date(Math.max(atual, agora.getTime()) + n * DIA).toISOString() }
}
/** Último login aproximado: a sessão mais nova vale 30 dias, então login = expiração − 30 dias. */
export const ultimoLoginDe = (maiorExpiracao: string | null): string | null => (maiorExpiracao ? new Date(new Date(maiorExpiracao).getTime() - 30 * DIA).toISOString() : null)

export type LinhaEmpresa = { situacao: 'teste' | 'ativa' | 'suspensa' | 'bloqueada'; acessoMotivo: string; testeAcabaEmDias: number | null; assinaturaStatus: string | null }
export function resumoPlataforma(linhas: LinhaEmpresa[], mrr: number) {
  return {
    empresas: linhas.length, emTeste: linhas.filter(l => l.situacao === 'teste').length, ativas: linhas.filter(l => l.situacao === 'ativa').length,
    suspensas: linhas.filter(l => l.situacao === 'suspensa').length, bloqueadas: linhas.filter(l => l.situacao === 'bloqueada').length,
    testeAcabando: linhas.filter(l => l.situacao === 'teste' && l.testeAcabaEmDias !== null && l.testeAcabaEmDias <= 3).length,
    atrasadas: linhas.filter(l => l.assinaturaStatus === 'atrasada').length, receitaMensal: mrr,
  }
}
