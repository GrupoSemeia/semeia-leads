import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Icon, Logo, Carregando } from '../ui'

const Casca = ({ children, onSubmit }: { children: any; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) =>
  <div className="login" style={{ gridTemplateColumns: '1fr' }}><section className="r">
    <form className="lcard" onSubmit={onSubmit}>
      <div className="brand" style={{ padding: 0 }}><Logo s={30} /><b>Semeia <i>Leads</i></b></div>
      {children}
    </form>
  </section></div>

/* pede o link: a resposta é a mesma exista ou não a conta */
export function Esqueci() {
  const [msg, setMsg] = useState(''), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try { const r = await api('/auth/esqueci', { body: Object.fromEntries(new FormData(e.currentTarget)) }); setMsg(r.mensagem) }
    catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <Casca onSubmit={enviar}>
    <div><div className="eyebrow">Recuperar acesso</div><h2>Esqueci a senha</h2></div>
    {msg ? <><div className="ok">{msg}</div><Link className="btn block" to="/entrar">Voltar para entrar</Link></> : <>
      <label className="fl"><span>E-mail da sua conta</span><input name="email" type="email" required autoComplete="username" /></label>
      {erro && <div className="err">{erro}</div>}
      <button className="btn pri block" disabled={ocupado}>Enviar link <Icon n="arrow" s={16} /></button>
      <Link className="muted" to="/entrar">Voltar</Link></>}
  </Casca>
}

/* cria a nova senha a partir do link do e-mail */
export function Redefinir() {
  const { token } = useParams(), nav = useNavigate()
  const [c, setC] = useState<any>(null), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), [feito, setFeito] = useState(false)
  useEffect(() => { api(`/auth/redefinir/${token}`).then(setC).catch(e => setErro(e.message)) }, [token])
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try { await api(`/auth/redefinir/${token}`, { body: Object.fromEntries(new FormData(e.currentTarget)) }); setFeito(true); setTimeout(() => nav('/entrar'), 2500) }
    catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <Casca onSubmit={enviar}>
    {feito ? <><div className="ok">Senha alterada. Entre com a nova senha.</div><Link className="btn pri block" to="/entrar">Entrar</Link></>
      : !c ? (erro ? <><div className="err">{erro}</div><Link className="btn block" to="/esqueci">Pedir novo link</Link></> : <Carregando />) : <>
        <div><div className="eyebrow">Recuperar acesso</div><h2>Nova senha</h2><div className="muted" style={{ fontSize: 14 }}>{c.email}</div></div>
        <label className="fl"><span>Nova senha (mín. 8 caracteres)</span><input name="senha" type="password" minLength={8} required autoComplete="new-password" /></label>
        {erro && <div className="err">{erro}</div>}
        <button className="btn pri block" disabled={ocupado}>Salvar nova senha <Icon n="arrow" s={16} /></button></>}
  </Casca>
}
