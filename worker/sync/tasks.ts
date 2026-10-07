/** Plano de cada job do sync: lista fixa de tarefas, calculada só a partir do job e da data de início (cursor retomável). */
export type Resource = 'usuarios' | 'tabelas' | 'categorias' | 'marcas' | 'produtos' | 'pessoas'
export type Task = { kind: 'resource'; name: Resource } | { kind: 'pedidos'; de: string; ate: string; label: string } | { kind: 'detalhes' }
export type JobName = 'cadastros' | 'pedidos' | 'backfill'
export const JOBS: JobName[] = ['cadastros', 'pedidos', 'backfill']

export const ROTULO_RECURSO: Record<Resource, string> = { usuarios: 'Vendedores', tabelas: 'Tabelas de preço', categorias: 'Categorias', marcas: 'Marcas', produtos: 'Produtos', pessoas: 'Clientes' }
const CADASTROS: Resource[] = ['usuarios', 'tabelas', 'categorias', 'marcas', 'produtos', 'pessoas']
export const BACKFILL_MESES = 24
/** janela móvel do sync frequente: pega edições recentes de pedidos */
export const JANELA_DIAS = 3

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** `start` = AAAA-MM-DD do dia local em que o job começou */
export function tasksFor(job: JobName, start: string): Task[] {
  const base = new Date(`${start}T00:00:00Z`)
  const recursos: Task[] = CADASTROS.map(name => ({ kind: 'resource', name }))
  if (job === 'cadastros') return recursos
  if (job === 'pedidos') {
    const de = new Date(base); de.setUTCDate(de.getUTCDate() - JANELA_DIAS)
    return [{ kind: 'pedidos', de: ymd(de), ate: start, label: 'Pedidos recentes' }, { kind: 'detalhes' }]
  }
  // backfill: cadastros + pedidos de venda dos últimos 24 meses em janelas mensais (do mais antigo ao mais novo) + detalhes
  const meses: Task[] = []
  for (let k = BACKFILL_MESES; k >= 0; k--) {
    const ini = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - k, 1))
    const fim = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - k + 1, 0))
    meses.push({ kind: 'pedidos', de: ymd(ini), ate: k === 0 ? start : ymd(fim), label: `Pedidos ${ymd(ini).slice(0, 7)}` })
  }
  return [...recursos, ...meses, { kind: 'detalhes' }]
}
export const rotuloTarefa = (t: Task) => (t.kind === 'resource' ? ROTULO_RECURSO[t.name] : t.kind === 'pedidos' ? t.label : 'Itens dos pedidos')
