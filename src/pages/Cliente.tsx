import { useParams, Link } from 'react-router-dom'
import { brl, fData, fDias, waLink, telWa } from '../api'
import { PageHead, Carregando, Icon, useApi } from '../ui'
import { PillStatus, BadgeCurva } from './Carteira'
import { useMe } from '../me'

const CNPJ = (c: string | null) => (c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c ?? '—')

export default function Cliente() {
  const { id } = useParams(), { me } = useMe()
  const { dados: a, erro } = useApi<any>(`/accounts/${id}`)
  if (!a) return <Carregando erro={erro} />
  const dado = (l: string, v: React.ReactNode) => <div><div className="muted" style={{ fontSize: 12 }}>{l}</div><div>{v || '—'}</div></div>
  return <>
    <PageHead eyebrow="Cliente" back={<Link to="/carteira" className="back"><Icon n="back" s={16} /> Carteira</Link>} title={a.name}>
      {a.whatsapp && <a className="btn wa" href={waLink(telWa(a.whatsapp), `Olá! Aqui é da ${me.empresa.name}.`)} target="_blank" rel="noreferrer"><Icon n="chat" /> WhatsApp</a>}
    </PageHead>
    <div className="stack">
      <div className="kpis">
        <div className="kpi"><div className="l">Curva</div><div className="v"><BadgeCurva c={a.curve} /></div><div className="s"><PillStatus s={a.status} /></div></div>
        <div className="kpi"><div className="l">Faturamento 12 meses</div><div className="v num" style={{ fontSize: 28 }}>{brl(a.revenue12m)}</div><div className="s">{a.orders12m} pedido(s)</div></div>
        <div className="kpi"><div className="l">Ticket médio</div><div className="v num" style={{ fontSize: 28 }}>{a.avgTicket ? brl(a.avgTicket) : '—'}</div><div className="s">{a.avgIntervalDays ? `compra a cada ~${a.avgIntervalDays} dias` : 'poucos pedidos'}</div></div>
        <div className="kpi"><div className="l">Último pedido</div><div className="v" style={{ fontSize: 28 }}>{fDias(a.lastOrderAt)}</div><div className="s">{a.lastOrderAt ? fData(a.lastOrderAt) : 'sem pedidos'}</div></div>
      </div>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        {dado('Razão social', a.legalName)}{dado('CNPJ', <span className="mono">{CNPJ(a.cnpj)}</span>)}{dado('Cidade', a.city && `${a.city}${a.uf ? '/' + a.uf : ''}`)}
        {dado('WhatsApp', a.whatsapp)}{dado('Telefone', a.phone)}{dado('E-mail', a.email)}{dado('Tabela de preço', a.priceTable)}
        {dado('Limite de crédito', a.creditLimit !== null ? brl(a.creditLimit) : null)}{dado('Vendedor', a.ownerName ?? 'Sem dono')}{dado('Próximo contato', fData(a.nextContactDue))}
      </div>
      <div className="grid2">
        <div className="card" style={{ padding: 16 }}><div className="eyebrow">Mais comprados</div>
          {a.topProdutos.length ? <div className="scrollx"><table className="tbl"><tbody>{a.topProdutos.map((p: any) => <tr key={p.id}><td>{p.name}</td><td className="r num">{p.qty} un</td><td className="r num">{brl(p.total)}</td></tr>)}</tbody></table></div> : <p className="muted">Sem itens de pedido ainda.</p>}</div>
        <div className="card" style={{ padding: 16 }}><div className="eyebrow">Categorias que nunca comprou</div>
          {a.categoriasNuncaCompradas.length ? <div className="chips" style={{ marginTop: 8 }}>{a.categoriasNuncaCompradas.map((k: any) => <span key={k.id} className="chip">{k.name}</span>)}</div> : <p className="muted">Já comprou de todas as categorias.</p>}</div>
      </div>
      <div className="card" style={{ padding: 16 }}><div className="eyebrow">Últimos pedidos</div>
        {a.pedidos.length ? <div className="scrollx"><table className="tbl"><thead><tr><th>Pedido</th><th>Data</th><th className="r">Valor</th></tr></thead><tbody>
          {a.pedidos.map((p: any) => <tr key={p.id}><td><span className="mono">#{p.id}</span><div className="muted" style={{ fontSize: 12 }}>{p.cancelled ? 'cancelado' : `${p.itens} iten(s)`}</div></td><td>{fData(p.orderedAt)}</td><td className="r num">{brl(p.total)}</td></tr>)}</tbody></table></div> : <p className="muted">Nenhum pedido.</p>}</div>
    </div>
  </>
}
