/**
 * Regras do pré-pedido (Sprint 5). Funções PURAS. Dinheiro em centavos.
 * O preço NUNCA vem do navegador: o servidor busca o preço da tabela do cliente e só usa estas funções para conferir e somar.
 */
export type Linha = { produtoId: number; nome: string; codigo: string | null; qtd: number; preco: number }   // preco = centavos por unidade
export const MAX_QTD = 99_999
export const MAX_LINHAS = 200

export const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

export const totalDe = (linhas: Pick<Linha, 'qtd' | 'preco'>[]) => linhas.reduce((s, l) => s + l.qtd * l.preco, 0)

/** Confere o que o vendedor pediu antes de gravar. Devolve a mensagem em português do primeiro problema, ou null se está tudo certo. */
export function validarPedido(pedido: unknown): { ok: true; itens: { produtoId: number; qtd: number }[] } | { ok: false; erro: string } {
  if (!Array.isArray(pedido) || pedido.length === 0) return { ok: false, erro: 'Adicione pelo menos um produto.' }
  if (pedido.length > MAX_LINHAS) return { ok: false, erro: `O pedido pode ter até ${MAX_LINHAS} produtos.` }
  const vistos = new Set<number>(), itens: { produtoId: number; qtd: number }[] = []
  for (const l of pedido as any[]) {
    const produtoId = Number(l?.produtoId), qtd = Number(l?.qtd)
    if (!Number.isInteger(produtoId) || produtoId <= 0) return { ok: false, erro: 'Produto inválido no pedido.' }
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > MAX_QTD) return { ok: false, erro: `A quantidade precisa ser um número inteiro de 1 a ${MAX_QTD}.` }
    if (vistos.has(produtoId)) return { ok: false, erro: 'O mesmo produto aparece duas vezes. Some as quantidades numa linha só.' }
    vistos.add(produtoId); itens.push({ produtoId, qtd })
  }
  return { ok: true, itens }
}

/** Texto para copiar e colar no WhatsApp e no ERP. */
export function montarResumo(p: { empresa: string; cliente: string; vendedor: string; linhas: Linha[]; observacao?: string | null }): string {
  const linhas = p.linhas.map(l => `${l.qtd}x ${l.nome}${l.codigo ? ` (${l.codigo})` : ''} — ${brl(l.preco)} = ${brl(l.qtd * l.preco)}`)
  return [`Pedido para ${p.cliente}`, `${p.empresa} · ${p.vendedor}`, '', ...linhas, '', `Total: ${brl(totalDe(p.linhas))}`, ...(p.observacao ? ['', `Obs.: ${p.observacao}`] : [])].join('\n')
}

/* ---------- corpo do PUT /pedido da Rein ---------- */
/** ⚠️ VALIDAR com a Rein (docs/02-api-rein.md §3.6 e §6 pergunta 9): valores válidos de natureza, uso, presença e meio de pagamento. Por isso tudo vem da configuração da empresa. */
export type ConfigPedidoErp = {
  codOrigem: number | null           // empresa emitente (matriz/filial)
  canalVendaId: number | null        // canal "App Carteira" criado no ERP
  codNatureza: string
  usoMercadoria: string
  indicadorPresenca: number | null
  codMeioPagamento: number | null
  prazoDias: number                  // dias até o vencimento da parcela única
}
export const CONFIG_PEDIDO_VAZIA: ConfigPedidoErp = { codOrigem: null, canalVendaId: null, codNatureza: '', usoMercadoria: '', indicadorPresenca: null, codMeioPagamento: null, prazoDias: 28 }

export function mesclarConfig(bruto: unknown): ConfigPedidoErp {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, any>
  const int = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number.isInteger(Number(v)) ? Number(v) : null)
  const prazo = Number(o.prazoDias)
  return { codOrigem: int(o.codOrigem), canalVendaId: int(o.canalVendaId), codNatureza: String(o.codNatureza ?? '').trim().slice(0, 40), usoMercadoria: String(o.usoMercadoria ?? '').trim().slice(0, 40),
    indicadorPresenca: int(o.indicadorPresenca), codMeioPagamento: int(o.codMeioPagamento), prazoDias: Number.isInteger(prazo) && prazo >= 0 && prazo <= 365 ? prazo : CONFIG_PEDIDO_VAZIA.prazoDias }
}
/** Lista o que falta configurar para poder enviar ao ERP. */
export function faltaConfigurar(c: ConfigPedidoErp, vendedorReinId: number | null): string[] {
  const f: string[] = []
  if (c.codOrigem === null) f.push('empresa emitente (CodOrigem)')
  if (c.canalVendaId === null) f.push('canal de venda "App Carteira"')
  if (!c.codNatureza) f.push('natureza da operação')
  if (!c.usoMercadoria) f.push('uso da mercadoria')
  if (c.indicadorPresenca === null) f.push('indicador de presença')
  if (c.codMeioPagamento === null) f.push('meio de pagamento')
  if (vendedorReinId === null) f.push('ligação do vendedor com o ERP (Equipe)')
  return f
}
export type PedidoErp = {
  CodOrigem: number; CodDestino: number; CodVendedor: number; CanalVendaId: number; IndicadorPresenca: number; CodNatureza: string; UsoMercadoria: string
  Produto: { IdProduto: number; CodProduto: string; CodTabelaPreco: number; QtdProduto: number; ValorUnitario: number }[]
  Pagamento: { ParcelaId: number; CodMeioPagamento: number; ValorPagamento: number; DataPagamento: string }[]
}
const reais = (c: number) => Math.round(c) / 100
export function montarCorpoPedido(p: { pessoaId: number; tabelaPrecoId: number; vendedorReinId: number | null; linhas: Linha[]; hoje: string }, cfg: ConfigPedidoErp): { ok: true; corpo: PedidoErp } | { ok: false; erro: string } {
  const falta = faltaConfigurar(cfg, p.vendedorReinId)
  if (falta.length) return { ok: false, erro: `Para enviar ao ERP, falta configurar: ${falta.join(', ')}.` }
  if (!p.linhas.length) return { ok: false, erro: 'O pedido está vazio.' }
  const venc = new Date(`${p.hoje}T12:00:00Z`); venc.setUTCDate(venc.getUTCDate() + cfg.prazoDias)
  return { ok: true, corpo: {
    CodOrigem: cfg.codOrigem!, CodDestino: p.pessoaId, CodVendedor: p.vendedorReinId!, CanalVendaId: cfg.canalVendaId!, IndicadorPresenca: cfg.indicadorPresenca!, CodNatureza: cfg.codNatureza, UsoMercadoria: cfg.usoMercadoria,
    Produto: p.linhas.map(l => ({ IdProduto: l.produtoId, CodProduto: l.codigo ?? '', CodTabelaPreco: p.tabelaPrecoId, QtdProduto: l.qtd, ValorUnitario: reais(l.preco) })),
    Pagamento: [{ ParcelaId: 1, CodMeioPagamento: cfg.codMeioPagamento!, ValorPagamento: reais(totalDe(p.linhas)), DataPagamento: venc.toISOString().slice(0, 10) }],
  } }
}
