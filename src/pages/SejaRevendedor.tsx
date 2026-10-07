import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api, mascaraCnpj } from '../api'
import { Logo } from '../ui'

/** Formulário público "Seja revendedor" (sem login). Tema claro. Não revela nada sobre a carteira da empresa. */
export default function SejaRevendedor() {
  const { slug } = useParams()
  const [info, setInfo] = useState<any>(null), [erro, setErro] = useState(''), [cnpj, setCnpj] = useState(''), [ok, setOk] = useState(false), [ocupado, setOcupado] = useState(false)
  useEffect(() => { api(`/publico/revendedor/${slug}`).then(setInfo).catch(e => setErro(e.message)) }, [slug])
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try { await api(`/publico/revendedor/${slug}`, { body: { ...Object.fromEntries(new FormData(e.currentTarget)), cnpj } }); setOk(true) } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  const campo = { background: '#fff', color: '#12263f', borderColor: '#c9d3e0' }
  return <div className="public" style={{ position: 'fixed', inset: 0, overflow: 'auto', display: 'grid', placeItems: 'start center', padding: 16, alignContent: 'start' }}>
    <div className="pp-card" style={{ width: '100%', maxWidth: 480, marginTop: 24, display: 'grid', gap: 14 }}>
      <div className="row"><Logo s={28} /><strong>{info?.empresa ?? 'Seja revendedor'}</strong></div>
      {!info ? <p>{erro || 'Carregando…'}</p> : ok ? <><h2>Recebemos seu cadastro!</h2><p>Em breve um de nossos vendedores entra em contato pelo WhatsApp.</p></> :
        <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
          <h2>Seja revendedor {info.empresa}</h2><p>Preencha os dados da sua empresa e receba as condições para revendedores.</p>
          <label className="fl"><span>CNPJ da empresa</span><input value={cnpj} onChange={e => setCnpj(mascaraCnpj(e.target.value))} inputMode="numeric" required placeholder="00.000.000/0000-00" style={campo} /></label>
          <label className="fl"><span>Seu nome</span><input name="contato" required maxLength={80} style={campo} /></label>
          <label className="fl"><span>WhatsApp (com DDD)</span><input name="whatsapp" inputMode="tel" required placeholder="(41) 99999-0000" style={campo} /></label>
          <div className="grid2"><label className="fl"><span>Cidade</span><input name="cidade" style={campo} /></label><label className="fl"><span>UF</span><input name="uf" maxLength={2} style={campo} /></label></div>
          <label className="fl"><span>O que sua empresa faz?</span><input name="segmento" placeholder="Ex.: loja de informática" style={campo} /></label>
          <input name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
          {erro && <div className="err">{erro}</div>}
          <button className="btn pri block" disabled={ocupado}>Quero ser revendedor</button></form>}
      <small style={{ color: '#5b6b82' }}>Um produto Grupo Semeia Digital</small>
    </div>
  </div>
}
