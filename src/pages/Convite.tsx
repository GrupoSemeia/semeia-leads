import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Icon, Logo, Carregando } from '../ui'

export default function Convite({ aoEntrar }: { aoEntrar: () => void }) {
  const { token } = useParams(), nav = useNavigate()
  const [c, setC] = useState<any>(null), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  useEffect(() => { api(`/auth/invite/${token}`).then(setC).catch(e => setErro(e.message)) }, [token])
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try { await api(`/auth/invite/${token}`, { body: Object.fromEntries(new FormData(e.currentTarget)) }); aoEntrar(); nav('/') } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <div className="login" style={{ gridTemplateColumns: '1fr' }}><section className="r">
    <form className="lcard" onSubmit={enviar}>
      <div className="brand" style={{ padding: 0 }}><Logo s={30} /><b>Semeia <i>Leads</i></b></div>
      {!c ? (erro ? <div className="err">{erro}</div> : <Carregando />) : <>
        <div><div className="eyebrow">Convite para a equipe</div><h2>{c.empresa}</h2><div className="muted" style={{ fontSize: 14 }}>{c.email}</div></div>
        {c.temConta ? <label className="fl"><span>Sua senha do Semeia Leads</span><input name="senha" type="password" required autoComplete="current-password" /></label> : <>
          <label className="fl"><span>Seu nome</span><input name="nome" required /></label>
          <label className="fl"><span>Crie uma senha (mín. 8 caracteres)</span><input name="senha" type="password" minLength={8} required autoComplete="new-password" /></label></>}
        {erro && <div className="err">{erro}</div>}
        <button className="btn pri block" disabled={ocupado}>Entrar na equipe <Icon n="arrow" s={16} /></button>
      </>}
    </form>
  </section></div>
}
