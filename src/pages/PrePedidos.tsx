import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, brl, fData, waLink, telWa } from '../api'
import { PageHead, Carregando, Icon, useApi, useToast, copiar } from '../ui'
import { useMe } from '../me'
import { Bloqueado, ehBloqueioDePlano } from './Bloqueado'

const STATUS: Record<string, [string, string]> = { RASCUNHO: ['Rascunho', ''], PENDENTE_FLAG: ['Aguardando envio manual', 'p-enviado'], ENVIANDO: ['Enviando…', 'p-enviado'], ENVIADO: ['Enviado ao ERP', 'p-aprovado'], ERRO: ['Erro no envio', 'p-recusado'] }
const Pill = ({ s }: { s: string }) => <span className={`pill ${STATUS[s]?.[1] ?? ''}`}>{STATUS[s]?.[0] ?? s}</span>

export function PrePedidos() {
  const { dados: d, erro } = useApi<any>('/pre-pedidos')
  if (ehBloqueioDePlano(erro)) return <><PageHead eyebrow="Vendas" title="Pré-pedidos" /><Bloqueado mensagem={erro!} /></>
  return <>
    <PageHead eyebrow="Vendas" title="Pré-pedidos"><Link className="btn pri" to="/catalogo"><Icon n="plus" /> Novo pedido</Link></PageHead>
    {!d ? <Carregando erro={erro} /> : d.itens.length === 0 ? <div className="card" style={{ padding: 20 }}><p className="muted" style={{ margin: 0 }}>Nenhum pré-pedido ainda. Monte o primeiro no <Link to="/catalogo">Catálogo</Link>.</p></div>
      : <div className="card" style={{ padding: 0 }}><div className="listx">{d.itens.map((o: any) => <Link key={o.id} to={`/pre-pedidos/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
        <div className="grow"><div className="t1">{o.cliente}</div><div className="t2">{fData(o.createdAt)} · {o.vendedor}{o.pedidoReinId ? ` · pedido ${o.pedidoReinId}` : ''}</div></div>
        <div style={{ textAlign: 'right' }}><div className="num">{brl(o.total)}</div><Pill s={o.status} /></div></Link>)}</div></div>}
  </>
}

export function PrePedido() {
  const { id } = useParams(), nav = useNavigate(), toast = useToast(), { me } = useMe(), gestor = me.usuario.papel !== 'seller'
  const { dados: o, erro, recarregar } = useApi<any>(`/pre-pedidos/${id}`)
  const [qtds, setQtds] = useState<Record<number, number>>({}), [obs, setObs] = useState<string | null>(null), [ocupado, setOcupado] = useState(false), [msg, setMsg] = useState('')
  if (!o) return <Carregando erro={erro} />
  const editavel = ['RASCUNHO', 'PENDENTE_FLAG', 'ERRO'].includes(o.status)
  const linhas = o.linhas.map((l: any) => ({ ...l, qtd: qtds[l.produtoId] ?? l.qtd })).filter((l: any) => l.qtd > 0)
  const total = linhas.reduce((s: number, l: any) => s + l.qtd * l.preco, 0), mudou = Object.keys(qtds).length > 0 || obs !== null
  const rodar = async (f: () => Promise<any>) => { setOcupado(true); setMsg(''); try { return await f() } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) } }
  const salvar = () => rodar(async () => { await api(`/pre-pedidos/${id}`, { method: 'PUT', body: { itens: linhas.map((l: any) => ({ produtoId: l.produtoId, qtd: l.qtd })), observacao: obs ?? o.observacao } }); setQtds({}); setObs(null); toast('Pedido salvo.'); recarregar() })
  const enviar = () => rodar(async () => {
    if (mudou) await salvar()
    if (o.envioErp.ligado && !confirm(`Enviar este pedido de ${brl(total)} ao ERP? Isso cria o pedido de verdade${o.envioErp.modoTeste ? ' (modo de teste: nada vai para o ERP real)' : ''}.`)) return
    const r = await api<any>(`/pre-pedidos/${id}/enviar`, { body: {} }); setMsg(r.aviso ?? (r.status === 'ENVIADO' ? 'Pedido criado no ERP.' : '')); recarregar()
  })
  const excluir = () => rodar(async () => { if (!confirm('Excluir este pré-pedido?')) return; await api(`/pre-pedidos/${id}`, { method: 'DELETE' }); nav('/pre-pedidos') })
  const resolver = (resultado: string) => rodar(async () => { const n = resultado === 'ENVIADO' ? prompt('Número do pedido no ERP (se souber):') : null; await api(`/pre-pedidos/${id}/resolver`, { body: { resultado, pedidoReinId: n } }); recarregar() })
  return <>
    <PageHead eyebrow="Pré-pedido" back={<Link to="/pre-pedidos" className="back"><Icon n="back" s={16} /> Pré-pedidos</Link>} title={o.cliente.nome}><Pill s={o.status} /></PageHead>
    <div className="stack">
      <div className="card" style={{ padding: 0 }}><div className="scrollx"><table className="tbl"><thead><tr><th>Produto</th><th className="r">Qtd</th><th className="r">Subtotal</th></tr></thead><tbody>
        {o.linhas.map((l: any) => { const q = qtds[l.produtoId] ?? l.qtd; return <tr key={l.produtoId}><td>{l.nome}<div className="muted" style={{ fontSize: 12 }}>{[l.codigo, `${brl(l.preco)} cada`].filter(Boolean).join(' · ')}</div></td>
          <td className="r">{editavel ? <input type="number" min={0} max={99999} value={q} onChange={e => setQtds({ ...qtds, [l.produtoId]: Math.max(0, Math.floor(Number(e.target.value))) })} aria-label={`Quantidade de ${l.nome}`} style={{ width: 70 }} /> : q}</td>
          <td className="r num">{q > 0 ? brl(q * l.preco) : <span className="muted">remover</span>}</td></tr> })}
        <tr><td colSpan={2} className="r"><strong>Total</strong></td><td className="r num"><strong>{brl(total)}</strong></td></tr></tbody></table></div></div>
      {editavel ? <label className="fl"><span>Observação</span><textarea value={obs ?? o.observacao ?? ''} onChange={e => setObs(e.target.value)} maxLength={500} /></label> : o.observacao && <div className="muted">Obs.: {o.observacao}</div>}
      {o.status === 'ENVIADO' && <div className="note">Pedido criado no ERP{o.pedidoReinId ? ` (nº ${o.pedidoReinId})` : ''}. Ele aparece na carteira do cliente na próxima sincronização.</div>}
      {o.status === 'ERRO' && <div className="err">{o.erro}<br />Se foi falha de conexão, confira no ERP se o pedido já entrou antes de enviar de novo.</div>}
      {o.status === 'PENDENTE_FLAG' && <div className="note">O envio direto ao ERP está desligado. Copie o resumo e lance no ERP, ou mande para o cliente.</div>}
      {o.envioErp.ligado && o.envioErp.falta.length > 0 && editavel && <div className="note">Para enviar ao ERP falta configurar: {o.envioErp.falta.join(', ')}. {gestor ? <Link to="/configuracoes">Abrir configurações</Link> : 'Peça ao gestor.'}</div>}
      {msg && <div className="note">{msg}</div>}
      <div className="row">
        {editavel && mudou && <button className="btn pri" disabled={ocupado || linhas.length === 0} onClick={salvar}>Salvar alterações</button>}
        {editavel && <button className="btn pri" disabled={ocupado || linhas.length === 0} onClick={enviar}>{o.envioErp.ligado ? 'Enviar ao ERP' : 'Finalizar pedido'}</button>}
        <button className="btn" onClick={() => copiar(o.resumo, toast)}><Icon n="copy" s={16} /> Copiar resumo</button>
        {o.cliente.whatsapp && <a className="btn wa" target="_blank" rel="noreferrer" href={waLink(telWa(o.cliente.whatsapp), o.resumo)}><Icon n="chat" s={16} /> Enviar ao cliente</a>}
        {editavel && <button className="btn danger" disabled={ocupado} onClick={excluir}><Icon n="trash" s={16} /> Excluir</button>}
      </div>
      {gestor && ['ENVIANDO', 'ERRO'].includes(o.status) && <div className="card" style={{ padding: 14, display: 'grid', gap: 8 }}><strong>Resolver depois de conferir no ERP</strong>
        <div className="row"><button className="btn sm" onClick={() => resolver('ENVIADO')}>O pedido entrou no ERP</button><button className="btn sm" onClick={() => resolver('RASCUNHO')}>Não entrou: voltar para rascunho</button></div></div>}
    </div>
  </>
}
