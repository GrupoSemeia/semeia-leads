import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, brl, waLink, telWa } from '../api'
import { PageHead, Carregando, Icon, useApi, useToast } from '../ui'
import { useCarrinho, totalCarrinho } from '../cart'
import { Bloqueado, ehBloqueioDePlano } from './Bloqueado'

export default function Catalogo() {
  const [cart, setCart] = useCarrinho(), nav = useNavigate(), toast = useToast()
  const [busca, setBusca] = useState(''), [q, setQ] = useState(''), [categoria, setCategoria] = useState(''), [marca, setMarca] = useState(''), [pagina, setPagina] = useState(0)
  const [qtd, setQtd] = useState<Record<number, number>>({}), [salvando, setSalvando] = useState(false)
  useEffect(() => { const t = setTimeout(() => { setQ(busca); setPagina(0) }, 300); return () => clearTimeout(t) }, [busca])
  const filtros = useApi<any>('/catalogo/filtros')
  const qs = new URLSearchParams({ ...(q && { q }), ...(categoria && { categoria }), ...(marca && { marca }), ...(cart.cliente && { cliente: String(cart.cliente.id) }), page: String(pagina) }).toString()
  const { dados: d, erro } = useApi<any>(`/catalogo?${qs}`)
  if (ehBloqueioDePlano(erro)) return <><PageHead eyebrow="Produtos" title="Catálogo" /><Bloqueado mensagem={erro!} /></>

  const adicionar = (p: any) => {
    const n = Math.max(1, Math.floor(qtd[p.id] ?? 1)), ex = cart.itens.find(i => i.produtoId === p.id)
    setCart({ ...cart, itens: ex ? cart.itens.map(i => (i.produtoId === p.id ? { ...i, qtd: i.qtd + n, preco: p.preco } : i)) : [...cart.itens, { produtoId: p.id, nome: p.name, codigo: p.code, preco: p.preco, qtd: n }] })
    setQtd({ ...qtd, [p.id]: 1 }); toast(`${n}x adicionado ao pré-pedido.`)
  }
  async function revisar() {
    if (!cart.cliente) return
    setSalvando(true)
    try { const r = await api<any>('/pre-pedidos', { body: { clienteId: cart.cliente.id, itens: cart.itens.map(i => ({ produtoId: i.produtoId, qtd: i.qtd })) } }); setCart({ cliente: cart.cliente, itens: [] }); nav(`/pre-pedidos/${r.id}`) }
    catch (x: any) { toast(x.message) } finally { setSalvando(false) }
  }
  const comPreco = !!cart.cliente
  return <>
    <PageHead eyebrow="Produtos" title="Catálogo" />
    <div className="stack" style={{ paddingBottom: cart.itens.length ? 76 : 0 }}>
      <EscolherCliente cart={cart} aoEscolher={c => { if (cart.itens.length && !confirm('Trocar de cliente esvazia o pré-pedido atual. Continuar?')) return; setCart({ cliente: c, itens: [] }); setPagina(0) }} />
      <div className="row"><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, código ou SKU" aria-label="Buscar produto" style={{ flex: 1, minWidth: 200 }} />
        <select value={categoria} onChange={e => { setCategoria(e.target.value); setPagina(0) }} style={{ width: 'auto' }} aria-label="Categoria"><option value="">Todas as categorias</option>{filtros.dados?.categorias.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={marca} onChange={e => { setMarca(e.target.value); setPagina(0) }} style={{ width: 'auto' }} aria-label="Marca"><option value="">Todas as marcas</option>{filtros.dados?.marcas.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {d?.cliente?.semTabela && <div className="note">Este cliente não tem tabela de preço no ERP, então os preços não aparecem.</div>}
      {!d ? <Carregando erro={erro} /> : d.itens.length === 0 ? <div className="card" style={{ padding: 20 }}><p className="muted" style={{ margin: 0 }}>Nenhum produto encontrado. Se o catálogo está vazio, faça a carga inicial do ERP em Configurações.</p></div>
        : <div className="card" style={{ padding: 0 }}><div className="listx">
          {d.itens.map((p: any) => <div key={p.id} style={{ cursor: 'default', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 180 }}><div className="t1">{p.name}</div><div className="t2" style={{ whiteSpace: 'normal' }}>{[p.code, p.marca].filter(Boolean).join(' · ')}</div></div>
            <div style={{ textAlign: 'right', minWidth: 96 }}><strong className="num">{!comPreco ? '—' : p.preco === null ? 'sem preço' : brl(p.preco)}</strong>{comPreco && <div className="muted" style={{ fontSize: 11 }}>{d.cliente?.tabela}</div>}</div>
            {comPreco && p.preco !== null && <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="number" min={1} max={99999} value={qtd[p.id] ?? 1} onChange={e => setQtd({ ...qtd, [p.id]: Number(e.target.value) })} aria-label={`Quantidade de ${p.name}`} style={{ width: 64 }} />
              <button className="btn pri sm" onClick={() => adicionar(p)}><Icon n="plus" s={16} /></button>
              {cart.cliente?.whatsapp && <a className="btn wa sm" target="_blank" rel="noreferrer" aria-label={`Enviar ${p.name} no WhatsApp`} href={waLink(telWa(cart.cliente.whatsapp), `${p.name}${p.code ? ` (${p.code})` : ''} — ${brl(p.preco)}`)}><Icon n="chat" s={16} /></a>}</div>}
          </div>)}
        </div></div>}
      {!comPreco && <div className="muted">Escolha um cliente para ver os preços da tabela dele e montar o pré-pedido.</div>}
      {d && d.total > d.tamanho && <div className="spread"><span className="muted">{d.pagina * d.tamanho + 1}–{Math.min(d.total, (d.pagina + 1) * d.tamanho)} de {d.total}</span>
        <div className="row"><button className="btn sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button><button className="btn sm" disabled={(pagina + 1) * d.tamanho >= d.total} onClick={() => setPagina(pagina + 1)}>Próxima</button></div></div>}
    </div>
    {cart.itens.length > 0 && <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--line-2)', padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
      <div><strong>{cart.itens.length} produto(s)</strong> · <span className="num">{brl(totalCarrinho(cart))}</span><div className="muted" style={{ fontSize: 12 }}>{cart.cliente?.nome}</div></div>
      <div className="row"><button className="btn sm" onClick={() => setCart({ ...cart, itens: [] })}>Limpar</button><button className="btn pri" disabled={salvando} onClick={revisar}>Revisar pedido <Icon n="arrow" s={16} /></button></div></div>}
  </>
}

function EscolherCliente({ cart, aoEscolher }: { cart: ReturnType<typeof useCarrinho>[0]; aoEscolher: (c: { id: number; nome: string; whatsapp: string | null }) => void }) {
  const [busca, setBusca] = useState(''), [q, setQ] = useState(''), [aberto, setAberto] = useState(false)
  useEffect(() => { const t = setTimeout(() => setQ(busca), 300); return () => clearTimeout(t) }, [busca])
  const { dados } = useApi<any>(aberto && q.length >= 2 ? `/accounts?q=${encodeURIComponent(q)}` : null)
  return <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
    <div className="spread"><div><div className="muted" style={{ fontSize: 12 }}>Cliente do pedido</div><strong>{cart.cliente?.nome ?? 'Nenhum cliente escolhido'}</strong></div>
      <button className="btn sm" onClick={() => setAberto(!aberto)}>{cart.cliente ? 'Trocar' : 'Escolher cliente'}</button></div>
    {aberto && <><input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CNPJ, telefone ou cidade (mín. 2 letras)" aria-label="Buscar cliente" />
      {dados?.itens.length === 0 && <div className="muted">Nenhum cliente seu com essa busca.</div>}
      <div className="listx">{dados?.itens.slice(0, 8).map((a: any) => <button key={a.id} onClick={() => { aoEscolher({ id: a.id, nome: a.name, whatsapp: a.whatsapp }); setAberto(false); setBusca('') }}>
        <div className="grow"><div className="t1">{a.name}</div><div className="t2">{a.city}{a.uf ? `/${a.uf}` : ''}</div></div></button>)}</div></>}
  </div>
}
