import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Icon, Logo } from '../ui'

export default function Entrar({ aoEntrar }: { aoEntrar: () => void }) {
  const [params] = useSearchParams()
  const [modo, setModo] = useState<'entrar' | 'criar'>(params.has('criar') ? 'criar' : 'entrar')
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  const nav = useNavigate()
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      await api(modo === 'entrar' ? '/auth/login' : '/auth/signup', { body: Object.fromEntries(new FormData(e.currentTarget)) })
      aoEntrar(); nav('/')
    } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <div className="login">
    <section className="l">
      <div className="brand" style={{ padding: 0 }}><Logo s={34} /><b>Semeia <i>Leads</i></b></div>
      <div><div className="tagline">GRUPO SEMEIA DIGITAL · TECNOLOGIA • CONEXÃO • PROPÓSITO</div>
        <h1 style={{ marginTop: 14 }}>Saiba quem chamar hoje e <em>o que oferecer</em>.</h1>
        <p style={{ marginTop: 16 }}>Carteira de clientes, funil de leads e pós-venda para distribuidoras, ligados ao seu ERP.</p></div>
      <ul><li><Icon n="users" /> Carteira por vendedor, com prioridade do dia</li><li><Icon n="chat" /> WhatsApp em 1 toque com mensagem pronta</li><li><Icon n="inbox" /> Leads novos com dono e acompanhamento</li></ul>
    </section>
    <section className="r">
      <form className="lcard" onSubmit={enviar}>
        {modo === 'entrar' ? <>
          <div><div className="eyebrow">Acesso da empresa</div><h2>Entrar</h2></div>
          <label className="fl"><span>E-mail</span><input name="email" type="email" required autoComplete="username" /></label>
          <label className="fl"><span>Senha</span><input name="senha" type="password" required autoComplete="current-password" /></label>
        </> : <>
          <div><div className="eyebrow">14 dias grátis, sem cartão</div><h2>Cadastre sua empresa</h2></div>
          <label className="fl"><span>Nome da empresa</span><input name="empresa" required /></label>
          <div className="grid2"><label className="fl"><span>Seu nome</span><input name="nome" required /></label>
            <label className="fl"><span>WhatsApp</span><input name="whatsapp" inputMode="tel" required placeholder="(41) 99999-0000" /></label></div>
          <label className="fl"><span>Cidade</span><input name="cidade" placeholder="Cidade — UF" /></label>
          <div className="grid2"><label className="fl"><span>E-mail</span><input name="email" type="email" required autoComplete="username" /></label>
            <label className="fl"><span>Senha (mín. 8 caracteres)</span><input name="senha" type="password" minLength={8} required autoComplete="new-password" /></label></div>
        </>}
        {erro && <div className="err">{erro}</div>}
        <button className="btn pri block" disabled={ocupado}>{modo === 'entrar' ? 'Entrar' : 'Criar minha conta'} <Icon n="arrow" s={16} /></button>
        <div className="spread"><span className="muted">{modo === 'entrar' ? 'Ainda não usa o Semeia Leads?' : 'Já tem conta?'}</span>
          <button type="button" className="btn sm" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro('') }}>{modo === 'entrar' ? 'Criar conta grátis' : 'Entrar'}</button></div>
      </form>
    </section>
  </div>
}
