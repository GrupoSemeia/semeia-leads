import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, brl, fData, fDias, waLink, telWa, rotuloResultado, CANAIS } from '../api'
import { PageHead, Carregando, Icon, useApi, useToast } from '../ui'
import RegistrarContato from './RegistrarContato'
import { PillStatus, BadgeCurva } from './Carteira'
import { useMe } from '../me'

const CNPJ = (c: string | null) => (c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c ?? '—')

export default function Cliente() {
  const { id } = useParams(), { me } = useMe()
  const { dados: a, erro, recarregar } = useApi<any>(`/accounts/${id}`)
  const modelos = useApi<any>('/templates')
  const [registrar, setRegistrar] = useState(false), [modelo, setModelo] = useState('oferta'), toast = useToast()
  if (!a) return <Carregando erro={erro} />
  const abrirWhats = async () => {
    try {
      const m = await api<any>(`/accounts/${id}/mensagem?modelo=${modelo}`)
      api(`/accounts/${id}/whatsapp-click`, { body: {} }).catch(() => {})
      window.open(waLink(telWa(m.whatsapp), m.texto), '_blank', 'noopener')
    } catch (x: any) { toast(x.message) }
  }
  const dado = (l: string, v: React.ReactNode) => <div><div className="muted" style={{ fontSize: 12 }}>{l}</div><div>{v || '—'}</div></div>
  return <>
    <PageHead eyebrow="Cliente" back={<Link to="/carteira" className="back"><Icon n="back" s={16} /> Carteira</Link>} title={a.name}>
      {a.whatsapp && <><select value={modelo} onChange={e => setModelo(e.target.value)} style={{ width: 'auto' }} aria-label="Modelo de mensagem">{modelos.dados?.itens.filter((m: any) => m.key !== 'nps').map((m: any) => <option key={m.key} value={m.key}>{m.title}</option>)}</select>
        <button className="btn wa" onClick={abrirWhats}><Icon n="chat" /> WhatsApp</button></>}
      <button className="btn pri" onClick={() => setRegistrar(true)}><Icon n="check" /> Registrar contato</button>
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
      <div className="card" style={{ padding: 16 }}><div className="eyebrow">Histórico de contatos</div>
        {a.interacoes.length ? <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>{a.interacoes.map((i: any) => <div key={i.id}>
          <div><strong>{rotuloResultado(i.result)}</strong> <span className="muted">· {CANAIS.find(c => c[0] === i.channel)?.[1]} · {i.userName} · {fData(i.createdAt)}</span></div>
          {i.note && <div className="muted">{i.note}</div>}</div>)}</div> : <p className="muted">Nenhum contato registrado ainda.</p>}</div>
      <div className="card" style={{ padding: 16 }}><div className="eyebrow">Últimos pedidos</div>
        {a.pedidos.length ? <div className="scrollx"><table className="tbl"><thead><tr><th>Pedido</th><th>Data</th><th className="r">Valor</th></tr></thead><tbody>
          {a.pedidos.map((p: any) => <tr key={p.id}><td><span className="mono">#{p.id}</span><div className="muted" style={{ fontSize: 12 }}>{p.cancelled ? 'cancelado' : `${p.itens} iten(s)`}</div></td><td>{fData(p.orderedAt)}</td><td className="r num">{brl(p.total)}</td></tr>)}</tbody></table></div> : <p className="muted">Nenhum pedido.</p>}</div>
    </div>
    {registrar && <RegistrarContato pessoaId={a.id} nome={a.name} aoFechar={() => setRegistrar(false)} aoSalvar={recarregar} />}
  </>
}
