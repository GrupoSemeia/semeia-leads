/** Regras do funil de leads (Sprint 6). Funções PURAS (sem I/O, "agora" por parâmetro). */
import { DIA } from './carteira'

export const ETAPAS = ['NOVO', 'CONTATADO', 'CATALOGO_ENVIADO', 'NEGOCIANDO', 'CONVERTIDO', 'PERDIDO'] as const
export type Etapa = (typeof ETAPAS)[number]
export const ABERTAS: Etapa[] = ['NOVO', 'CONTATADO', 'CATALOGO_ENVIADO', 'NEGOCIANDO']
export const ROTULO_ETAPA: Record<Etapa, string> = { NOVO: 'Novo', CONTATADO: 'Contatado', CATALOGO_ENVIADO: 'Catálogo enviado', NEGOCIANDO: 'Negociando', CONVERTIDO: 'Convertido', PERDIDO: 'Perdido' }
export const ORIGENS = ['site', 'manual', 'lista', 'indicacao'] as const
export type Origem = (typeof ORIGENS)[number]
export const ehEtapa = (v: unknown): v is Etapa => (ETAPAS as readonly string[]).includes(v as string)
export const estaAberto = (e: Etapa) => ABERTAS.includes(e)

/* ---------- documentos e telefone ---------- */
export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** CNPJ com 14 dígitos e dígitos verificadores corretos (recusa sequências como 00000000000000). */
export function cnpjValido(v: unknown): boolean {
  const d = soDigitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => { const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = [...base].reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const a = dv(d.slice(0, 12)), b = dv(d.slice(0, 12) + a)
  return d.endsWith(`${a}${b}`)
}
export const formatarCnpj = (v: string) => soDigitos(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
/** Telefone brasileiro: 10 a 13 dígitos (com ou sem 55). Devolve só os dígitos, ou null. */
export function normalizarWhatsapp(v: unknown): string | null {
  const d = soDigitos(v)
  return d.length >= 10 && d.length <= 13 ? d : null
}

/* ---------- funil ---------- */
export const MOTIVO_MIN = 3
/** Move o lead entre etapas. CONVERTIDO só acontece sozinho, no primeiro pedido; perdido exige motivo; só perdido pode ser reaberto (para NOVO). */
export function validarTransicao(de: Etapa, para: Etapa, motivo?: string | null): { ok: true } | { ok: false; erro: string } {
  if (de === 'CONVERTIDO') return { ok: false, erro: 'Este lead já virou cliente. Ele segue na carteira.' }
  if (para === 'CONVERTIDO') return { ok: false, erro: 'O lead vira cliente sozinho quando o primeiro pedido aparecer no ERP.' }
  if (de === 'PERDIDO' && para !== 'NOVO' && para !== 'PERDIDO') return { ok: false, erro: 'Para retomar um lead perdido, reabra como “Novo”.' }
  if (para === 'PERDIDO' && String(motivo ?? '').trim().length < MOTIVO_MIN) return { ok: false, erro: 'Diga o motivo da perda (pelo menos 3 letras).' }
  return { ok: true }
}
/** Quando voltar a falar com o lead. Novo vence na hora; depois a cada 2–3 dias. Fechados não têm retorno. */
export function proximoFollowup(etapa: Etapa, agora: Date): Date | null {
  const dias: Partial<Record<Etapa, number>> = { NOVO: 0, CONTATADO: 2, CATALOGO_ENVIADO: 3, NEGOCIANDO: 2 }
  return etapa in dias ? new Date(agora.getTime() + dias[etapa]! * DIA) : null
}

/** Rodízio circular: o vendedor depois do último que recebeu. Sem histórico (ou último que saiu da equipe) começa pelo primeiro. */
export function proximoDoRodizio(vendedores: string[], ultimo: string | null): string | null {
  if (!vendedores.length) return null
  const i = ultimo ? vendedores.indexOf(ultimo) : -1
  return vendedores[(i + 1) % vendedores.length]
}

/* ---------- BrasilAPI (consulta de CNPJ) ---------- */
export type Enriquecimento = { razaoSocial: string | null; fantasia: string | null; cidade: string | null; uf: string | null; cnae: string | null; situacao: string | null; telefone: string | null }
export function parseBrasilApi(json: unknown): Enriquecimento | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, any>
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if (!s(o.razao_social) && !s(o.nome_fantasia)) return null
  return { razaoSocial: s(o.razao_social), fantasia: s(o.nome_fantasia), cidade: s(o.municipio), uf: s(o.uf), cnae: o.cnae_fiscal ? String(o.cnae_fiscal) : null, situacao: s(o.descricao_situacao_cadastral), telefone: s(o.ddd_telefone_1) }
}

/* ---------- cadastro no ERP (PUT /pessoa) ---------- */
/** ⚠️ VALIDAR com a Rein: id do tipo de cliente "Prospect" e quais campos são obrigatórios. Tudo vem da configuração da empresa. */
export type ConfigPessoaErp = {
  tipoClienteId: number | null
  tipoClienteNome: string
  /** Nome do campo da pessoa no ERP que guarda o vendedor da carteira. Vazio = desligado (o app não lê nem escreve vendedor no ERP). ⚠️ VALIDAR com a Rein. */
  campoVendedor: string
}
export const CONFIG_PESSOA_VAZIA: ConfigPessoaErp = { tipoClienteId: null, tipoClienteNome: 'Prospect', campoVendedor: '' }
export const campoValido = (c: unknown): c is string => typeof c === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(c)
export function mesclarConfigPessoa(bruto: unknown): ConfigPessoaErp {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, any>
  const id = o.tipoClienteId === '' || o.tipoClienteId == null ? null : Number(o.tipoClienteId)
  const campo = String(o.campoVendedor ?? '').trim()
  return { tipoClienteId: Number.isInteger(id) && id! > 0 ? id : null, tipoClienteNome: String(o.tipoClienteNome ?? '').trim().slice(0, 60) || 'Prospect', campoVendedor: campoValido(campo) ? campo : '' }
}
export type PessoaErp = { Nome: string; RazaoSocial: string; Cnpj: string; TipoPessoa: 'J'; Observacao: string; TipoCliente: { Id: number; Nome: string }[]; [campo: string]: unknown }
export function montarCorpoPessoa(l: { cnpj: string; razaoSocial: string | null; fantasia?: string | null; contato: string; whatsapp: string | null; vendedorReinId?: number | null }, cfg: ConfigPessoaErp): { ok: true; corpo: PessoaErp } | { ok: false; erro: string } {
  if (!cnpjValido(l.cnpj)) return { ok: false, erro: 'CNPJ inválido.' }
  if (cfg.tipoClienteId === null) return { ok: false, erro: 'Para cadastrar no ERP, falta configurar o código do tipo de cliente “Prospect” (Configurações).' }
  const razao = l.razaoSocial?.trim() || ''
  if (!razao) return { ok: false, erro: 'Preencha a razão social antes de cadastrar no ERP.' }
  const corpo: PessoaErp = { Nome: (l.fantasia?.trim() || razao).slice(0, 120), RazaoSocial: razao.slice(0, 120), Cnpj: soDigitos(l.cnpj), TipoPessoa: 'J',
    Observacao: `Cadastrado pelo Semeia Leads. Contato: ${l.contato}${l.whatsapp ? ` · WhatsApp ${l.whatsapp}` : ''}`, TipoCliente: [{ Id: cfg.tipoClienteId, Nome: cfg.tipoClienteNome }] }
  if (cfg.campoVendedor && l.vendedorReinId) corpo[cfg.campoVendedor] = l.vendedorReinId   // já nasce na carteira certa do ERP
  return { ok: true, corpo }
}
