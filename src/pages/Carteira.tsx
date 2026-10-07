import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, brlInt, fDias, STATUS_CONTA, waLink, telWa } from '../api'
import { PageHead, Carregando, Icon, Modal, useApi, useToast } from '../ui'
import { useMe } from '../me'

const STATUS = ['ATIVO', 'EM_RISCO', 'INATIVO', 'PROSPECT']

export const PillStatus = ({ s }: { s: string }) => <span className={`pill ${STATUS_CONTA[s]?.[1] ?? ''}`}>{STATUS_CONTA[s]?.[0] ?? s}</span>
export const BadgeCurva = ({ c }: { c: string | null }) => <span className="mono" title="Curva ABC" style={{ fontWeight: 600, color: c === 'A' ? 'var(--ok)' : c === 'B' ? 'var(--accent)' : 'var(--muted)' }}>{c ?? '–'}</span>

export default function Carteira() {
  const { me } = useMe(), gestor = me.usuario.papel !== 'seller', admin = me.usuario.papel === 'admin'
  const [busca, setBusca] = useState(''), [q, setQ] = useState(''), [status, setStatus] = useState(''), [curva, setCurva] = useState(''), [dono, setDono] = useState(''), [pagina, setPagina] = useState(0)
  useEffect(() => { const t = setTimeout(() => { setQ(busca); setPagina(0) }, 300); return () => clearTimeout(t) }, [busca])
  const qs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(curva && { curva }), ...(dono && { dono }), page: String(pagina) }).toString()
  const { dados: d, erro, recarregar } = useApi<any>(`/accounts?${qs}`)
  const nav = useNavigate(), toast = useToast()
  const [sel, setSel] = useState<number[]>([]), [para, setPara] = useState(''), [massa, setMassa] = useState(false)
  const equipe = useApi<any>(gestor ? '/equipe' : null)
  const pend = useApi<any>(gestor ? '/accounts/erp-pendencias' : null)
  const total = d ? STATUS.reduce((s, k) => s + (d.porStatus[k] ?? 0), 0) : 0
  const mover = async () => {
    try { const r = await api<any>('/accounts/reassign', { body: { ids: sel, para: para === 'sem' ? null : para } }); toast(`${r.movidos} cliente(s) movido(s). A troca entrou na fila de atualização do ERP.`); setSel([]); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <>
    <PageHead eyebrow={gestor ? 'Todos os vendedores' : 'Minha carteira'} title="Carteira">{admin && me.plano.nivel >= 3 && <button className="btn" onClick={() => setMassa(true)}>Redistribuir por filtro</button>}</PageHead>
    <div className="stack">
      {gestor && pend.dados && (pend.dados.pendentes > 0 || pend.dados.erros > 0) && <div className="note">{pend.dados.pendentes + pend.dados.erros} troca(s) de vendedor ainda não chegaram ao ERP. <Link to="/configuracoes">Ver em Configurações</Link></div>}
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
      {admin && sel.length > 0 && <div className="card row" style={{ padding: 12 }}><strong>{sel.length} selecionado(s)</strong>
        <select value={para} onChange={e => setPara(e.target.value)} style={{ width: 'auto' }}><option value="">Passar para…</option><option value="sem">Sem dono</option>{equipe.dados?.membros.filter((m: any) => m.active).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <button className="btn pri sm" disabled={!para} onClick={mover}>Mover</button><button className="btn sm" onClick={() => setSel([])}>Limpar</button></div>}
      {!d ? <Carregando erro={erro} /> : d.itens.length === 0 ? <div className="card" style={{ padding: 20 }}>
        <p className="muted" style={{ margin: 0 }}>{total === 0 && !q && !curva && !status ? <>Nenhum cliente por aqui ainda. {gestor ? <>Faça a <Link to="/configuracoes">carga inicial do ERP</Link> para trazer os clientes.</> : 'Peça ao gestor para distribuir sua carteira.'}</> : 'Nenhum cliente com esses filtros.'}</p></div>
        : <div className="card" style={{ padding: 0 }}><div className="listx">
          {d.itens.map((a: any) => <div key={a.id} onClick={() => nav(`/carteira/${a.id}`)} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && nav(`/carteira/${a.id}`)}>
            {admin && <input type="checkbox" checked={sel.includes(a.id)} onClick={e => e.stopPropagation()} onChange={e => setSel(e.target.checked ? [...sel, a.id] : sel.filter(x => x !== a.id))} style={{ width: 'auto' }} aria-label={`Selecionar ${a.name}`} />}
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
    {massa && <Redistribuir equipe={equipe.dados?.membros ?? []} aoFechar={() => setMassa(false)} aoMudar={recarregar} />}
  </>
}

function Redistribuir({ equipe, aoFechar, aoMudar }: { equipe: any[]; aoFechar: () => void; aoMudar: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ de: '', curva: '', status: '', para: '' }), [previa, setPrevia] = useState<any>(null), [msg, setMsg] = useState(''), [ocupado, setOcupado] = useState(false)
  const ativos = equipe.filter(m => m.active)
  const corpo = (confirmar: boolean) => ({ de: f.de, curva: f.curva || undefined, status: f.status || undefined, para: f.para === 'sem' ? null : f.para, confirmar })
  const rodar = async (confirmar: boolean) => {
    setOcupado(true); setMsg('')
    try {
      const r = await api<any>('/accounts/reassign-filtro', { body: corpo(confirmar) })
      if (confirmar) { toast(`${r.movidos} cliente(s) movido(s). As trocas entraram na fila de atualização do ERP.`); aoMudar(); aoFechar() } else setPrevia(r)
    } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) }
  }
  const mudar = (k: string, v: string) => { setF({ ...f, [k]: v }); setPrevia(null) }
  return <Modal titulo="Redistribuir por filtro" sub="Só o administrador" onClose={aoFechar}>
    <div style={{ display: 'grid', gap: 12 }}>
      <label className="fl"><span>Clientes de</span><select value={f.de} onChange={e => mudar('de', e.target.value)}><option value="">Escolher…</option><option value="sem">Sem dono</option>{ativos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <div className="grid2"><label className="fl"><span>Curva</span><select value={f.curva} onChange={e => mudar('curva', e.target.value)}><option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="sem">Sem curva</option></select></label>
        <label className="fl"><span>Status</span><select value={f.status} onChange={e => mudar('status', e.target.value)}><option value="">Todos</option>{Object.entries(STATUS_CONTA).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select></label></div>
      <label className="fl"><span>Passar para</span><select value={f.para} onChange={e => mudar('para', e.target.value)}><option value="">Escolher…</option>{ativos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      {previa && previa.total === 0 && <div className="note">Nenhum cliente com esse filtro.</div>}
      {previa && previa.total > 0 && <div className="note"><strong>{previa.total} cliente(s)</strong> serão movidos{previa.amostra.length ? `: ${previa.amostra.join(', ')}${previa.total > previa.amostra.length ? '…' : ''}` : '.'}<br />Cada troca fica no histórico e entra na fila de atualização do ERP.</div>}
      {msg && <div className="err">{msg}</div>}
      <div className="row"><button className="btn" disabled={ocupado || !f.de || !f.para} onClick={() => rodar(false)}>Ver quantos</button>
        <button className="btn pri" disabled={ocupado || !previa || previa.total === 0} onClick={() => rodar(true)}>Confirmar e mover</button></div>
    </div>
  </Modal>
}
