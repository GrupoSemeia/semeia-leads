import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { Logo } from '../ui'

/** Pesquisa de satisfação pública (sem login). Tema claro, como as telas do cliente final. */
export default function Nps() {
  const { token } = useParams()
  const [info, setInfo] = useState<any>(null), [erro, setErro] = useState(''), [nota, setNota] = useState<number | null>(null), [enviado, setEnviado] = useState(false), [ocupado, setOcupado] = useState(false)
  useEffect(() => { api(`/publico/nps/${token}`).then(setInfo).catch(e => setErro(e.message)) }, [token])
  async function enviar(comentario: string) {
    setOcupado(true); setErro('')
    try { await api(`/publico/nps/${token}`, { body: { nota, comentario } }); setEnviado(true) } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <div className="public" style={{ position: 'fixed', inset: 0, overflow: 'auto', display: 'grid', placeItems: 'start center', padding: 16, alignContent: 'start' }}>
    <div className="pp-card" style={{ width: '100%', maxWidth: 440, marginTop: 24, display: 'grid', gap: 14 }}>
      <div className="row"><Logo s={28} /><strong>{info?.empresa ?? 'Pesquisa de satisfação'}</strong></div>
      {erro && !info ? <p>{erro}</p> : !info ? <p>Carregando…</p> : enviado || info.respondido ? <>
        <h2>Obrigado!</h2><p>{enviado ? 'Sua resposta foi enviada.' : 'Você já respondeu esta pesquisa.'}</p></> : <>
        <h2>Como foi sua compra{info.cliente ? `, ${info.cliente}` : ''}?</h2>
        <p>De 0 a 10, o quanto você recomendaria a {info.empresa}?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>{Array.from({ length: 11 }, (_, n) =>
          <button key={n} type="button" onClick={() => setNota(n)} aria-pressed={nota === n} style={{ padding: '12px 0', borderRadius: 8, border: '1px solid #c9d3e0', background: nota === n ? '#0a6cff' : '#fff', color: nota === n ? '#fff' : '#12263f', font: 'inherit', fontWeight: 600 }}>{n}</button>)}</div>
        {nota !== null && <form onSubmit={e => { e.preventDefault(); enviar(String(new FormData(e.currentTarget).get('comentario') ?? '')) }} style={{ display: 'grid', gap: 10 }}>
          <textarea name="comentario" maxLength={500} placeholder="Quer deixar um comentário? (opcional)" style={{ background: '#fff', color: '#12263f', borderColor: '#c9d3e0' }} />
          {erro && <div className="err">{erro}</div>}
          <button className="btn pri block" disabled={ocupado}>Enviar</button></form>}
      </>}
      <small style={{ color: '#5b6b82' }}>Um produto Grupo Semeia Digital</small>
    </div>
  </div>
}
