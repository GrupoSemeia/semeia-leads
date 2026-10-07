import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import './styles.css'
import { api, iniciais } from './api'
import { Icon, Logo, ToastProvider, Carregando } from './ui'
import { MeCtx, type Me } from './me'
import Entrar from './pages/Entrar'
import Convite from './pages/Convite'
import { Esqueci, Redefinir } from './pages/RecuperarSenha'
import Config from './pages/Config'
import EmBreve from './pages/EmBreve'
import Carteira from './pages/Carteira'
import Cliente from './pages/Cliente'
import Hoje from './pages/Hoje'
import Leads from './pages/Leads'
import Painel from './pages/Painel'
import Assinatura from './pages/Assinatura'
import Admin from './pages/Admin'
import SejaRevendedor from './pages/SejaRevendedor'
import Catalogo from './pages/Catalogo'
import { PrePedidos, PrePedido } from './pages/PrePedidos'
import Nps from './pages/Nps'
import { alternarTema, aplicarTema, temaAtual } from './tema'
import Ajuda, { temaDaRota } from './pages/Ajuda'


aplicarTema(temaAtual())

function Shell({ me, recarregar, children }: { me: Me; recarregar: () => void; children: ReactNode }) {
  const [menu, setMenu] = useState(false), [tmenu, setTmenu] = useState(false), [tema, setTema] = useState(temaAtual())
  const nav = useNavigate(), loc = useLocation()
  useEffect(() => { setMenu(false); setTmenu(false) }, [loc.pathname])
  const gestor = me.usuario.papel !== 'seller'
  const sair = async () => { await api('/auth/logout', { method: 'POST' }); recarregar(); nav('/entrar') }
  const trocar = async (id: string) => { await api('/auth/switch-tenant', { body: { empresaId: id } }); recarregar(); nav('/') }
  const itens: [string, string, string][] = [['/', 'Hoje', 'home'], ['/carteira', 'Carteira', 'users'], ['/leads', 'Leads', 'inbox'], ['/catalogo', 'Catálogo', 'tag'], ['/pre-pedidos', 'Pré-pedidos', 'file']]
  const link = (to: string, l: string, ic: string) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav ${isActive ? 'on' : ''}`}><Icon n={ic} /> {l}</NavLink>
  return <div className={`shell ${menu ? 'menu-open' : ''}`}>
    <aside className="side">
      <div className="brand"><Logo /><b>Semeia <i>Leads</i></b></div>
      {itens.map(([to, l, ic]) => link(to, l, ic))}
      <div className="navlabel">Suporte</div>{link('/ajuda', 'Ajuda', 'help')}
      {me.admin && <><div className="navlabel">Plataforma</div>{link('/admin', 'Todas as empresas', 'shield')}</>}
      {gestor && <><div className="navlabel">Gestão</div>{link('/painel', 'Painel', 'kanban')}{link('/configuracoes', 'Configurações', 'gear')}</>}
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
        {me.trialDias !== null ? <NavLink to="/assinatura" className="planpill trial" style={{ textDecoration: 'none' }}>Teste grátis · {me.trialDias} dia(s)</NavLink> : <span className="planpill">{me.plano.nome}</span>}
        <button className="btn ghost sm tema-btn" onClick={() => setTema(alternarTema())} title={tema === 'claro' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'} aria-label={tema === 'claro' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}><span className="lua"><Icon n="moon" /></span><span className="sol"><Icon n="sun" /></span></button>
        <NavLink to={`/ajuda/${temaDaRota(loc.pathname)}`} className="btn ghost sm" title="Como funciona esta tela" aria-label="Ajuda sobre esta tela"><Icon n="help" /></NavLink>
        <span className="avatar" title={me.usuario.nome}>{iniciais(me.usuario.nome)}</span>
        <button className="btn ghost sm" onClick={sair} title="Sair" aria-label="Sair"><Icon n="logout" /></button>
      </header>
      {me.plano.aviso === 'atrasada' && <div className="tbanner" role="alert">Pagamento atrasado. Regularize para não perder o acesso. {me.usuario.papel === 'admin' && <NavLink to="/assinatura">Ver cobrança</NavLink>}</div>}
      {me.plano.aviso === 'teste_acaba' && me.trialDias !== null && <div className="tbanner" role="status">Seu teste grátis termina em {me.trialDias} dia(s). {me.usuario.papel === 'admin' && <NavLink to="/assinatura">Escolher um plano</NavLink>}</div>}
      <main className="content">{children}</main>
    </div>
  </div>
}

function App() {
  const [me, setMe] = useState<Me | null>(null)
  const carregar = () => api<Me>('/auth/me').then(setMe).catch(() => setMe({ logado: false } as Me))
  useEffect(() => { carregar() }, [])
  const loc = useLocation()
  if (/^\/(convite|nps|seja-revendedor|redefinir)\//.test(loc.pathname) || loc.pathname === '/esqueci') return <Routes><Route path="/esqueci" element={<Esqueci />} /><Route path="/redefinir/:token" element={<Redefinir />} /><Route path="/convite/:token" element={<Convite aoEntrar={carregar} />} /><Route path="/nps/:token" element={<Nps />} /><Route path="/seja-revendedor/:slug" element={<SejaRevendedor />} /></Routes>
  if (!me) return <Carregando />
  if (!me.logado) return <Routes><Route path="/entrar" element={<Entrar aoEntrar={carregar} />} /><Route path="*" element={<Navigate to="/entrar" replace />} /></Routes>
  if (me.plano.bloqueado) return <MeCtx.Provider value={{ me, recarregar: carregar }}>
    <Shell me={me} recarregar={carregar}><Routes><Route path="*" element={<Assinatura />} /></Routes></Shell>
  </MeCtx.Provider>
  return <MeCtx.Provider value={{ me, recarregar: carregar }}>
    <Shell me={me} recarregar={carregar}>
      <Routes>
        <Route path="/" element={<Hoje />} />
        <Route path="/carteira" element={<Carteira />} />
        <Route path="/carteira/:id" element={<Cliente />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/pre-pedidos" element={<PrePedidos />} />
        <Route path="/pre-pedidos/:id" element={<PrePedido />} />
        {me.usuario.papel !== 'seller' && <Route path="/configuracoes" element={<Config />} />}
        {me.usuario.papel !== 'seller' && <Route path="/painel" element={<Painel />} />}
        <Route path="/ajuda" element={<Ajuda />} />
        <Route path="/ajuda/:tema" element={<Ajuda />} />
        <Route path="/assinatura" element={<Assinatura />} />
        {me.admin && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  </MeCtx.Provider>
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><ToastProvider><App /></ToastProvider></BrowserRouter></StrictMode>)

// Deixa o app instalável no celular (o service worker não guarda dados em cache)
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
