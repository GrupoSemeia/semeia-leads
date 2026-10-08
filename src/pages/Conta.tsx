import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { PageHead, useToast } from '../ui'
import { useMe } from '../me'

const b64u = (b: ArrayBuffer | null) => btoa(String.fromCharCode(...new Uint8Array(b ?? new ArrayBuffer(0)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const chaveParaBytes = (s: string) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), c => c.charCodeAt(0)) }
const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Registro do service worker (só existe em https; em teste local sem https não há push). */
async function registro() {
  return (await navigator.serviceWorker.getRegistration()) ?? await navigator.serviceWorker.register('/sw.js')
}

function TrocarSenha() {
  const toast = useToast()
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro('')
    const f = e.currentTarget, d = Object.fromEntries(new FormData(f)) as Record<string, string>
    if (d.novaSenha !== d.confirmar) return setErro('A confirmação não é igual à nova senha.')
    setOcupado(true)
    try { await api('/auth/senha', { body: { senhaAtual: d.senhaAtual, novaSenha: d.novaSenha } }); f.reset(); toast('Senha alterada. Os outros aparelhos precisarão entrar de novo.') }
    catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <form className="card stack" onSubmit={enviar} style={{ padding: 16 }}>
    <div><div className="eyebrow">Segurança</div><h3>Trocar a senha</h3></div>
    <label className="fl"><span>Senha atual</span><input id="senhaAtual" name="senhaAtual" type="password" required autoComplete="current-password" /></label>
    <div className="grid2">
      <label className="fl"><span>Nova senha (mín. 8 caracteres)</span><input id="novaSenha" name="novaSenha" type="password" minLength={8} required autoComplete="new-password" /></label>
      <label className="fl"><span>Repita a nova senha</span><input id="confirmar" name="confirmar" type="password" minLength={8} required autoComplete="new-password" /></label>
    </div>
    {erro && <div className="err">{erro}</div>}
    <div className="row"><button className="btn pri" disabled={ocupado}>Salvar nova senha</button></div>
  </form>
}

function AvisosEmail() {
  const { me, recarregar } = useMe(), toast = useToast()
  async function mudar(v: boolean) {
    try { await api('/auth/preferencias', { method: 'PATCH', body: { avisosEmail: v } }); recarregar(); toast(v ? 'Avisos por e-mail ligados.' : 'Avisos por e-mail desligados.') } catch (x: any) { toast(x.message) }
  }
  return <label className="row"><input id="avisosEmail" type="checkbox" checked={!!me.usuario.avisosEmail} onChange={e => mudar(e.target.checked)} style={{ width: 'auto' }} /> Receber avisos por e-mail</label>
}

function NotificacoesAparelho() {
  const toast = useToast()
  const [cfg, setCfg] = useState<{ ativo: boolean; chavePublica: string | null; aparelhos: number } | null>(null)
  const [ligado, setLigado] = useState(false), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('')
  const suporta = suportaPush()
  async function carregar() {
    try {
      setCfg(await api('/push/config'))
      if (suportaPush()) { const r = await navigator.serviceWorker.getRegistration(); setLigado(!!(await r?.pushManager.getSubscription())) }
    } catch (x: any) { setErro(x.message) }
  }
  useEffect(() => { carregar() }, [])
  async function ligar() {
    setErro(''); setOcupado(true)
    try {
      if (!cfg?.chavePublica) throw new Error('As notificações ainda não foram ativadas neste servidor.')
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('O navegador bloqueou as notificações. Libere nas configurações do site e tente de novo.')
      const reg = await registro(); await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(cfg.chavePublica) })
      await api('/push/inscrever', { body: { endpoint: sub.endpoint, chaves: { p256dh: b64u(sub.getKey('p256dh')), auth: b64u(sub.getKey('auth')) } } })
      setLigado(true); toast('Notificações ligadas neste aparelho.'); carregar()
    } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  async function desligar() {
    setErro(''); setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration(), sub = await reg?.pushManager.getSubscription()
      if (sub) { await api('/push/desinscrever', { body: { endpoint: sub.endpoint } }); await sub.unsubscribe() }
      setLigado(false); toast('Notificações desligadas neste aparelho.'); carregar()
    } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  async function testar() {
    setErro(''); setOcupado(true)
    try { const r = await api('/push/teste', { method: 'POST', body: {} }); toast(r.enviados ? 'Teste enviado. A notificação deve aparecer em instantes.' : 'Não consegui enviar. Desligue e ligue de novo as notificações.') }
    catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <div className="stack" style={{ gap: 8 }}>
    <div><strong>Neste aparelho</strong><div className="muted" style={{ fontSize: 13 }}>Um aviso na tela do celular ou do computador, mesmo com o app fechado.</div></div>
    {!suporta ? <div className="muted">Este navegador não aceita notificações. No iPhone, instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por ele.</div>
      : cfg && !cfg.ativo ? <div className="muted">As notificações no aparelho ainda não foram ativadas neste servidor. Peça ao suporte do Grupo Semeia.</div>
      : <div className="row">
        {ligado ? <><span className="planpill">Ligadas neste aparelho</span><button className="btn" disabled={ocupado} onClick={testar}>Enviar teste</button><button className="btn" disabled={ocupado} onClick={desligar}>Desligar</button></>
          : <button className="btn pri" disabled={ocupado || !cfg} onClick={ligar}>Ligar notificações neste aparelho</button>}
      </div>}
    {erro && <div className="err">{erro}</div>}
  </div>
}

export default function Conta() {
  const { me } = useMe()
  const semEmpresa = !!me.semEmpresa
  return <>
    <PageHead eyebrow="Meu acesso" title="Minha conta" />
    <div className="stack">
      <section className="card stack" style={{ padding: 16 }}>
        <div><div className="eyebrow">Dados</div><h3>{me.usuario.nome}</h3></div>
        <div className="muted">{me.usuario.email}{semEmpresa ? ' · administrador da plataforma (sem empresa)' : ` · ${me.empresa.name}`}</div>
      </section>
      <TrocarSenha />
      <section className="card stack" style={{ padding: 16 }}>
        <div><div className="eyebrow">Avisos</div><h3>Como quer ser avisado</h3></div>
        {!semEmpresa && me.usuario.papel !== 'seller' && <AvisosEmail />}
        {!semEmpresa && me.usuario.papel === 'seller' && <div className="muted">Vendedores não recebem avisos de gestão por e-mail.</div>}
        <NotificacoesAparelho />
      </section>
    </div>
  </>
}
