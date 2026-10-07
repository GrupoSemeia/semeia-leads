import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, brlInt, fDias, STATUS_CONTA, waLink, telWa } from '../api'
import { PageHead, Carregando, Icon, useApi, useToast } from '../ui'
import { useMe } from '../me'

const STATUS = ['ATIVO', 'EM_RISCO', 'INATIVO', 'PROSPECT']

export const PillStatus = ({ s }: { s: string }) => <span className={`pill ${STATUS_CONTA[s]?.[1] ?? ''}`}>{STATUS_CONTA[s]?.[0] ?? s}</span>
export const BadgeCurva = ({ c }: { c: string | null }) => <span className="mono" title="Curva ABC" style={{ fontWeight: 600, color: c === 'A' ? 'var(--ok)' : c === 'B' ? 'var(--accent)' : 'var(--muted)' }}>{c ?? '–'}</span>

export default function Carteira() {
  const { me } = useMe(), gestor = me.usuario.papel !== 'seller'
  const [busca, setBusca] = useState(''), [q, setQ] = useState(''), [status, setStatus] = useState(''), [curva, setCurva] = useState(''), [dono, setDono] = useState(''), [pagina, setPagina] = useState(0)
  useEffect(() => { const t = setTimeout(() => { setQ(busca); setPagina(0) }, 300); return () => clearTimeout(t) }, [busca])
  const qs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(curva && { curva }), ...(dono && { dono }), page: String(pagina) }).toString()
  const { dados: d, erro, recarregar } = useApi<any>(`/accounts?${qs}`)
  const nav = useNavigate(), toast = useToast()
  const [sel, setSel] = useState<number[]>([]), [para, setPara] = useState('')
  const equipe = useApi<any>(gestor ? '/equipe' : null)
  const total = d ? STATUS.reduce((s, k) => s + (d.porStatus[k] ?? 0), 0) : 0
  const mover = async () => {
    try { const r = await api<any>('/accounts/reassign', { body: { ids: sel, para: para === 'sem' ? null : para } }); toast(`${r.movidos} cliente(s) movido(s).`); setSel([]); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <>
    <PageHead eyebrow={gestor ? 'Todos os vendedores' : 'Minha carteira'} title="Carteira" />
    <div className="stack">
      <div className="row"><div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CNPJ, telefone ou cidade" aria-label="Buscar cliente" />
      </div>
        <select value={curva} onChange={e => { setCurva(e.target.value); setPagina(0) }} style={{ width: 'auto' }} aria-label="Curva"><option value="">Todas as curvas</option><option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option><option value="sem">Sem curva</option></select>
        {gestor && <select value={dono} onChange={e => { setDono(e.target.value); setPagina(0) }} style={{ width: 'auto' }} aria-label="Vendedor"><option value="">Todos os vendedores</option><option value="sem">Sem dono</option>
          {equipe.dados?.membros.filter((m: any) => m.active).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
      </div>
      <div className="chips">
        <button className={`chip ${!status ? 'on' : ''}`} onClick={() => { setStatus(''); setPagina(0) }}>Todos <b>{total}</b></button>
        {STATUS.map(s => <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => { setStatus(s); setPagina(0) }}>{STATUS_CONTA[s][0]} <b>{d?.porStatus[s] ?? 0}</b></button>)}
      </div>
      {gestor && sel.length > 0 && <div className="card row" style={{ padding: 12 }}><strong>{sel.length} selecionado(s)</strong>
        <select value={para} onChange={e => setPara(e.target.value)} style={{ width: 'auto' }}><option value="">Passar para…</option><option value="sem">Sem dono</option>{equipe.dados?.membros.filter((m: any) => m.active).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <button className="btn pri sm" disabled={!para} onClick={mover}>Mover</button><button className="btn sm" onClick={() => setSel([])}>Limpar</button></div>}
      {!d ? <Carregando erro={erro} /> : d.itens.length === 0 ? <div className="card" style={{ padding: 20 }}>
        <p className="muted" style={{ margin: 0 }}>{total === 0 && !q && !curva && !status ? <>Nenhum cliente por aqui ainda. {gestor ? <>Faça a <Link to="/configuracoes">carga inicial do ERP</Link> para trazer os clientes.</> : 'Peça ao gestor para distribuir sua carteira.'}</> : 'Nenhum cliente com esses filtros.'}</p></div>
        : <div className="card" style={{ padding: 0 }}><div className="listx">
          {d.itens.map((a: any) => <div key={a.id} onClick={() => nav(`/carteira/${a.id}`)} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && nav(`/carteira/${a.id}`)}>
            {gestor && <input type="checkbox" checked={sel.includes(a.id)} onClick={e => e.stopPropagation()} onChange={e => setSel(e.target.checked ? [...sel, a.id] : sel.filter(x => x !== a.id))} style={{ width: 'auto' }} aria-label={`Selecionar ${a.name}`} />}
            <BadgeCurva c={a.curve} />
            <div className="grow" style={{ minWidth: 0 }}><div className="t1 ell">{a.name}</div>
              <div className="t2">{[a.city && `${a.city}${a.uf ? '/' + a.uf : ''}`, a.lastOrderAt ? `comprou ${fDias(a.lastOrderAt)}` : 'nunca comprou', gestor && (a.ownerName ?? 'sem dono')].filter(Boolean).join(' · ')}</div></div>
            <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 13 }}>{brlInt(a.revenue12m)}</div><PillStatus s={a.status} /></div>
            {a.whatsapp && <a className="btn wa sm" href={waLink(telWa(a.whatsapp), `Olá! Aqui é da ${me.empresa.name}.`)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} aria-label="Abrir WhatsApp"><Icon n="chat" s={16} /></a>}
          </div>)}
        </div></div>}
      {d && d.total > d.tamanho && <div className="spread"><span className="muted">{d.pagina * d.tamanho + 1}–{Math.min(d.total, (d.pagina + 1) * d.tamanho)} de {d.total}</span>
        <div className="row"><button className="btn sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button><button className="btn sm" disabled={(pagina + 1) * d.tamanho >= d.total} onClick={() => setPagina(pagina + 1)}>Próxima</button></div></div>}
    </div>
  </>
}
