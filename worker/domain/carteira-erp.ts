/**
 * Regras de quem é o dono (vendedor) da carteira de um cliente e de como isso conversa com o ERP. Funções PURAS.
 * Decisão do Neto/Augusto: o ERP manda na carteira; só o administrador troca cliente/lead de carteira; troca no app é refletida no ERP.
 */
import { campoValido } from './leads'

/**
 * Dono do cliente depois de recalcular.
 * - Troca local ainda não enviada ao ERP: vale o que o admin acabou de escolher (senão o ERP "desfaria" a troca).
 * - Campo de vendedor do ERP configurado (`erpManda`): o vendedor do ERP vale, e se mudou lá o app acompanha.
 * - Sem esse campo: o dono já definido nunca muda sozinho; só quem está sem dono recebe o vendedor do último pedido (semente).
 */
export function donoDaConta(i: { donoAtual: string | null; donoErp: string | null; trocaLocalPendente: boolean; erpManda: boolean }): { dono: string | null; mudou: boolean; porErp: boolean } {
  const resultado = (dono: string | null, porErp = false) => ({ dono, mudou: dono !== i.donoAtual, porErp: porErp && dono !== i.donoAtual })
  if (i.trocaLocalPendente) return resultado(i.donoAtual)
  if (i.erpManda && i.donoErp) return resultado(i.donoErp, true)
  return resultado(i.donoAtual ?? i.donoErp ?? null)
}

/** Quem atende o lead: o vendedor da carteira do CNPJ (ERP/app); senão o escolhido pelo admin; senão o rodízio. */
export function escolherDonoLead(i: { donoCarteira: string | null; escolhidoPeloAdmin: string | null; vendedorQueCadastrou: string | null }): { dono: string | null; precisaRodizio: boolean } {
  const dono = i.donoCarteira ?? i.escolhidoPeloAdmin ?? i.vendedorQueCadastrou ?? null
  return { dono, precisaRodizio: dono === null }
}

/** Na conversão do lead o ERP vence: o vendedor do lead só entra se a conta ainda estiver sem dono. */
export const donoNaConversao = (donoDaContaNoErp: string | null, donoDoLead: string | null) => donoDaContaNoErp ?? donoDoLead

/**
 * Corpo do POST /pessoa/{id} para trocar o vendedor. O ERP pode tratar o POST como substituição total, então o corpo é o cadastro ATUAL
 * (lido do ERP) com só o campo do vendedor trocado. ⚠️ VALIDAR com a Rein se o POST é parcial ou total e o nome do campo.
 */
export function montarAtualizacaoVendedor(atual: unknown, campo: string, vendedorReinId: number | null): { ok: true; corpo: Record<string, unknown> } | { ok: false; erro: string } {
  if (!campoValido(campo)) return { ok: false, erro: 'O campo do vendedor no ERP não está configurado.' }
  if (!Number.isInteger(vendedorReinId) || (vendedorReinId as number) <= 0) return { ok: false, erro: 'O vendedor não está ligado a um usuário do ERP (Configurações → Equipe).' }
  if (!atual || typeof atual !== 'object' || Array.isArray(atual) || !Object.keys(atual).length) return { ok: false, erro: 'O ERP não devolveu o cadastro do cliente.' }
  return { ok: true, corpo: { ...(atual as Record<string, unknown>), [campo]: vendedorReinId } }
}
