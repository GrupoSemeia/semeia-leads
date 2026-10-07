import { StrictMode, createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import './styles.css'
import { api, iniciais } from './api'
import { Icon, Logo, ToastProvider, Carregando } from './ui'
import Entrar from './pages/Entrar'
import Convite from './pages/Convite'
import Config from './pages/Config'
import EmBreve from './pages/EmBreve'

export type Me = {
  logado: boolean
  usuario: { id: string; nome: string; email: string; papel: 'admin' | 'manager' | 'seller' }
  empresa: { id: string; name: string; city: string; plan: string }
  empresas: { id: string; name: string; city: string }[]
  trialDias: number | null
  admin?: boolean
}
const MeCtx = createContext<{ me: Me; recarregar: () => void } | null>(null)
export const useMe = () => useContext(MeCtx)!

function Shell({ me, recarregar, children }: { me: Me; recarregar: () => void; children: ReactNode }) {
  const [menu, setMenu] = useState(false), [tmenu, setTmenu] = useState(false)
  const nav = useNavigate(), loc = useLocation()
  useEffect(() => { setMenu(false); setTmenu(false) }, [loc.pathname])
  const gestor = me.usuario.papel !== 'seller'
  const sair = async () => { await api('/auth/logout', { method: 'POST' }); recarregar(); nav('/entrar') }
  const trocar = async (id: string) => { await api('/auth/switch-tenant', { body: { empresaId: id } }); recarregar(); nav('/') }
  const itens: [string, string, string][] = [['/', 'Hoje', 'home'], ['/carteira', 'Carteira', 'users'], ['/leads', 'Leads', 'inbox'], ['/catalogo', 'Catálogo', 'tag']]
  const link = (to: string, l: string, ic: string) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav ${isActive ? 'on' : ''}`}><Icon n={ic} /> {l}</NavLink>
  return <div className={`shell ${menu ? 'menu-open' : ''}`}>
    <aside className="side">
      <div className="brand"><Logo /><b>Semeia <i>Leads</i></b></div>
      {itens.map(([to, l, ic]) => link(to, l, ic))}
      {gestor && <><div className="navlabel">Gestão</div>{link('/configuracoes', 'Configurações', 'gear')}</>}
      <div className="foot">Um produto <b style={{ color: '#B0C4DE' }}>Grupo Semeia Digital</b></div>
    </aside>
    <div className="scrim" onClick={() => setMenu(false)} />
    <div className="main">
      <header className="top">
        <button className="btn ghost sm hamb" onClick={() => setMenu(!menu)} aria-label="Abrir menu"><Icon n="menu" /></button>
        <div className="tenant">
          <button className="tenant-btn" onClick={() => setTmenu(!tmenu)} aria-expanded={tmenu}>
            <span className="tenant-logo" style={{ background: '#00F2FF', color: '#000B1A' }}>{iniciais(me.empresa.name)}</span>
            <span><small>Empresa</small><strong>{me.empresa.name}</strong></span>{me.empresas.length > 1 && <Icon n="down" s={16} />}
          </button>
          {tmenu && me.empresas.length > 1 && <div className="menu">{me.empresas.map(o => <button key={o.id} onClick={() => trocar(o.id)}><span style={{ flex: 1 }}><strong style={{ display: 'block' }}>{o.name}</strong><small className="muted">{o.city}</small></span>{o.id === me.empresa.id && <Icon n="check" s={16} />}</button>)}</div>}
        </div>
        <div style={{ flex: 1 }} />
        {me.trialDias !== null && <span className="planpill trial">Teste grátis · {me.trialDias} dia(s)</span>}
        <span className="avatar" title={me.usuario.nome}>{iniciais(me.usuario.nome)}</span>
        <button className="btn ghost sm" onClick={sair} title="Sair" aria-label="Sair"><Icon n="logout" /></button>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>
}

function App() {
  const [me, setMe] = useState<Me | null>(null)
  const carregar = () => api<Me>('/auth/me').then(setMe).catch(() => setMe({ logado: false } as Me))
  useEffect(() => { carregar() }, [])
  const loc = useLocation()
  if (/^\/convite\//.test(loc.pathname)) return <Routes><Route path="/convite/:token" element={<Convite aoEntrar={carregar} />} /></Routes>
  if (!me) return <Carregando />
  if (!me.logado) return <Routes><Route path="/entrar" element={<Entrar aoEntrar={carregar} />} /><Route path="*" element={<Navigate to="/entrar" replace />} /></Routes>
  return <MeCtx.Provider value={{ me, recarregar: carregar }}>
    <Shell me={me} recarregar={carregar}>
      <Routes>
        <Route path="/" element={<EmBreve eyebrow="Agenda do dia" titulo="Hoje" texto="Aqui vai aparecer quem você deve contatar hoje, em ordem de prioridade. Chega na Sprint 4." />} />
        <Route path="/carteira" element={<EmBreve eyebrow="Clientes" titulo="Carteira" texto="Sua carteira com curva ABC e status, vinda do ERP. Chega na Sprint 3." />} />
        <Route path="/leads" element={<EmBreve eyebrow="Funil" titulo="Leads" texto="Funil de leads com dono e acompanhamento. Chega na Sprint 6." />} />
        <Route path="/catalogo" element={<EmBreve eyebrow="Produtos" titulo="Catálogo" texto="Produtos com o preço da tabela de cada cliente. Chega na Sprint 5." />} />
        {me.usuario.papel !== 'seller' && <Route path="/configuracoes" element={<Config />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  </MeCtx.Provider>
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><ToastProvider><App /></ToastProvider></BrowserRouter></StrictMode>)
