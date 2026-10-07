/**
 * Regras da agenda e do pós-venda (Sprint 4). Funções PURAS (sem I/O, "agora" por parâmetro).
 * Decisões de produto assumidas (ajustáveis): orçamento = retorno em 3 dias; não respondeu = tentar de novo em 2 dias;
 * sem interesse = só voltar em 30 dias; vendeu = volta à frequência normal da curva.
 */
import { type Params, type ContaAgenda, motivoDe, recompraPrevista, DIA } from './carteira'

export type Resultado = 'VENDEU' | 'ORCAMENTO' | 'SEM_INTERESSE' | 'NAO_RESPONDEU' | 'REAGENDAR'
export const RESULTADOS: Resultado[] = ['VENDEU', 'ORCAMENTO', 'SEM_INTERESSE', 'NAO_RESPONDEU', 'REAGENDAR']
export const ROTULO_RESULTADO: Record<Resultado, string> = { VENDEU: 'Vendeu', ORCAMENTO: 'Mandei orçamento', SEM_INTERESSE: 'Sem interesse agora', NAO_RESPONDEU: 'Não respondeu', REAGENDAR: 'Reagendar' }
export const CANAIS = ['whatsapp', 'ligacao', 'visita', 'email'] as const
export type Canal = (typeof CANAIS)[number]
export const DIAS_RETORNO: Record<'ORCAMENTO' | 'NAO_RESPONDEU' | 'SEM_INTERESSE', number> = { ORCAMENTO: 3, NAO_RESPONDEU: 2, SEM_INTERESSE: 30 }

const inicioDoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/** Para quando agendar o próximo contato conforme o resultado. `null` = volta à frequência normal. */
export function efeitoDoContato(resultado: Resultado | null, agora: Date, reagendarPara?: Date | null): { ok: true; reagendarPara: Date | null } | { ok: false; erro: string } {
  if (resultado === 'REAGENDAR') {
    if (!reagendarPara || Number.isNaN(reagendarPara.getTime())) return { ok: false, erro: 'Informe a data para reagendar.' }
    if (reagendarPara.getTime() < inicioDoDia(agora).getTime()) return { ok: false, erro: 'A data para reagendar não pode ser no passado.' }
    return { ok: true, reagendarPara }
  }
  if (resultado === 'ORCAMENTO' || resultado === 'NAO_RESPONDEU' || resultado === 'SEM_INTERESSE') return { ok: true, reagendarPara: new Date(agora.getTime() + DIAS_RETORNO[resultado] * DIA) }
  return { ok: true, reagendarPara: null }
}
/** "Não respondeu" não conclui a tarefa; qualquer outro resultado conclui. */
export const concluiTarefa = (r: Resultado | null) => r !== 'NAO_RESPONDEU'

/* ---------- tarefas de pós-venda ---------- */
export type TarefaTipo = 'POS_VENDA_D1' | 'NPS_D7' | 'TRATAR_NPS'
export const JANELA_TAREFAS_DIAS = 10   // só pedidos recentes geram tarefa (a carga inicial de 24 meses não pode inundar a agenda)
export function tarefasDoPedido(pedidoEm: Date, agora: Date): { tipo: 'POS_VENDA_D1' | 'NPS_D7'; venceEm: Date }[] {
  if (agora.getTime() - pedidoEm.getTime() > JANELA_TAREFAS_DIAS * DIA) return []
  return [{ tipo: 'POS_VENDA_D1', venceEm: new Date(pedidoEm.getTime() + 1 * DIA) }, { tipo: 'NPS_D7', venceEm: new Date(pedidoEm.getTime() + 7 * DIA) }]
}
export const NOTA_INSATISFEITO = 6   // nota ≤ 6 gera "Tratar insatisfação"
export const insatisfeito = (nota: number) => nota <= NOTA_INSATISFEITO
export const notaValida = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 10

/* ---------- agenda com tarefas ---------- */
export type TarefaAberta = { id: string; tipo: TarefaTipo; venceEm: Date; nota?: number | null; conta: ContaAgenda }
export type ItemAgenda = { id: number; score: number; motivo: string; kind: 'conta' | 'tarefa'; tarefa?: { id: string; tipo: TarefaTipo }; modelo: string }
const BONUS_TAREFA: Record<TarefaTipo, number> = { TRATAR_NPS: 100, POS_VENDA_D1: 60, NPS_D7: 50 }
const MOTIVO_TAREFA = (t: TarefaAberta) =>
  t.tipo === 'TRATAR_NPS' ? `Tratar insatisfação${t.nota !== null && t.nota !== undefined ? ` (nota ${t.nota})` : ''}` : t.tipo === 'POS_VENDA_D1' ? 'Pós-venda: confirmar recebimento' : 'Enviar pesquisa de satisfação'

/** Qual modelo de mensagem combina com o motivo do contato. */
export function modeloSugerido(c: ContaAgenda, agora: Date, p: Params): string {
  if (c.status === 'PROSPECT') return 'saudacao'
  if (c.status === 'EM_RISCO' || c.status === 'INATIVO') return 'reativacao'   // mesma ordem do motivo na agenda (status antes de recompra)
  if (recompraPrevista(c, agora, p)) return 'recompra'
  return 'oferta'
}
const MODELO_TAREFA: Record<TarefaTipo, string> = { POS_VENDA_D1: 'posvenda', NPS_D7: 'nps', TRATAR_NPS: 'tratar_nps' }

/**
 * Agenda do dia: contas com contato vencido + tarefas vencidas, um item por cliente. Se o cliente tem tarefa, a tarefa de maior
 * prioridade manda no motivo e eleva o score; maior score primeiro; limite `agendaSize`.
 */
export function agendaCompleta(contasDevidas: ContaAgenda[], tarefas: TarefaAberta[], agora: Date, p: Params): ItemAgenda[] {
  const itens = new Map<number, ItemAgenda>()
  for (const c of contasDevidas) {
    if (c.proximoContato.getTime() > agora.getTime()) continue
    itens.set(c.id, { id: c.id, score: c.score, motivo: motivoDe(c, agora, p), kind: 'conta', modelo: modeloSugerido(c, agora, p) })
  }
  for (const t of tarefas.filter(t => t.venceEm.getTime() <= agora.getTime()).sort((a, b) => BONUS_TAREFA[b.tipo] - BONUS_TAREFA[a.tipo] || a.venceEm.getTime() - b.venceEm.getTime())) {
    const atual = itens.get(t.conta.id)
    if (atual?.kind === 'tarefa') continue   // já entrou uma tarefa mais prioritária deste cliente
    itens.set(t.conta.id, { id: t.conta.id, score: Math.max(t.conta.score, BONUS_TAREFA[t.tipo]), motivo: MOTIVO_TAREFA(t), kind: 'tarefa', tarefa: { id: t.id, tipo: t.tipo }, modelo: MODELO_TAREFA[t.tipo] })
  }
  return [...itens.values()].sort((a, b) => b.score - a.score || a.id - b.id).slice(0, p.agendaSize)
}

/* ---------- modelos de mensagem (WhatsApp) ---------- */
export const MODELOS_PADRAO: { key: string; title: string; body: string }[] = [
  { key: 'saudacao', title: 'Saudação (primeiro contato)', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Posso te enviar nosso catálogo e as condições para revendedores?' },
  { key: 'oferta', title: 'Oferta', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Chegaram condições especiais esta semana. Quer que eu monte uma proposta para você?' },
  { key: 'recompra', title: 'Recompra', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Já deve estar na hora de repor {{produto}}. Posso separar para você?' },
  { key: 'reativacao', title: 'Reativação', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Faz um tempo que não nos falamos e temos novidades. Posso te mostrar o que mudou?' },
  { key: 'posvenda', title: 'Pós-venda (D+1)', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Seu pedido chegou direitinho? Qualquer coisa é só me chamar por aqui.' },
  { key: 'nps', title: 'Pesquisa de satisfação (D+7)', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Poderia nos dar uma nota de 0 a 10 sobre sua compra? Leva 10 segundos: {{link}}' },
  { key: 'tratar_nps', title: 'Tratar insatisfação', body: 'Olá, {{contato}}! Aqui é {{vendedor}} da {{empresa}}. Vi sua avaliação e quero entender o que podemos melhorar. Pode me contar o que aconteceu?' },
]
export const CHAVES_MODELO = MODELOS_PADRAO.map(m => m.key)
/** Troca {{variavel}} pelo valor; variável desconhecida ou vazia some (e espaços duplos são arrumados). */
export function renderModelo(corpo: string, vars: Record<string, string | null | undefined>): string {
  return corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? '')).replace(/[ \t]{2,}/g, ' ').replace(/ ([.,!?:])/g, '$1').trim()
}
