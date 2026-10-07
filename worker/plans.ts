/** Planos do Semeia Leads. Preços em centavos por mês. Texto dos planos precisa bater com a landing quando ela existir. */
export type Tier = 'essencial' | 'profissional' | 'distribuidor'
export const PLANOS: Record<Tier, { nome: string; preco: number; vendedores: number; clientes: number | null; nivel: number; resumo: string }> = {
  essencial: { nome: 'Essencial', preco: 24990, vendedores: 2, clientes: 500, nivel: 1, resumo: 'Carteira, agenda do dia, ficha do cliente e WhatsApp em 1 toque' },
  profissional: { nome: 'Profissional', preco: 44990, vendedores: 5, clientes: 2000, nivel: 2, resumo: 'Tudo do Essencial, mais catálogo com preço da tabela, pré-pedido, funil de leads, pós-venda e NPS' },
  distribuidor: { nome: 'Distribuidor', preco: 79990, vendedores: 15, clientes: null, nivel: 3, resumo: 'Tudo do Profissional, mais painel do gestor, redistribuição de carteira, várias filiais e suporte prioritário' },
}
export const VENDEDOR_EXTRA = 5990          // por vendedor adicional, por mês
export const MESES_PAGOS_NO_ANO = 10        // anual = 10 × mensal (2 meses grátis)
export const NIVEL_TESTE = 3                // teste grátis libera tudo
export const TIERS = Object.keys(PLANOS) as Tier[]
export const ehTier = (v: unknown): v is Tier => typeof v === 'string' && (TIERS as string[]).includes(v)

type TenantPlano = { plan: string; tier: string; trial_until: string | null; extra_sellers: number }
export const emTeste = (t: Pick<TenantPlano, 'plan' | 'trial_until'>) => t.plan === 'trial' && !!t.trial_until && new Date(t.trial_until) > new Date()
/** Plano que vale agora: no teste grátis, o mais completo; depois, o contratado (dados de planos acima ficam guardados, só sem acesso). */
export const tierEfetivo = (t: TenantPlano): Tier => (emTeste(t) ? 'distribuidor' : ehTier(t.tier) ? t.tier : 'essencial')
export const nivelDe = (t: TenantPlano) => PLANOS[tierEfetivo(t)].nivel
export const limiteVendedores = (t: TenantPlano) => PLANOS[tierEfetivo(t)].vendedores + Math.max(0, t.extra_sellers | 0)
export const limiteClientes = (t: TenantPlano) => PLANOS[tierEfetivo(t)].clientes
