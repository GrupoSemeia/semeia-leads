import { useState, type FormEvent } from 'react'
import { api, PAPEL } from '../api'
import { PageHead, Carregando, useApi, useToast, copiar } from '../ui'

export default function Config() {
  return <><PageHead eyebrow="Empresa" title="Configurações" /><div className="stack"><ConexaoErp /><Equipe /></div></>
}

function ConexaoErp() {
  const { dados: r, erro, recarregar } = useApi<any>('/rein')
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false), [msg, setMsg] = useState('')
  if (!r) return <Carregando erro={erro} />
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setOcupado(true); setMsg('')
    const f = new FormData(e.currentTarget)
    try {
      await api('/rein', { method: 'PUT', body: {
        baseUrl: f.get('baseUrl'), clientId: f.get('clientId'), clientSecret: f.get('clientSecret'), database: f.get('database'),
        mock: f.get('mock') === 'on', assinarComQuery: f.get('assinarComQuery') === 'on', escritaPessoa: f.get('escritaPessoa') === 'on', escritaPedido: f.get('escritaPedido') === 'on' } })
      toast('Conexão salva.'); recarregar()
    } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) }
  }
  async function testar() {
    setOcupado(true); setMsg('')
    try { const t = await api<any>('/rein/test', { method: 'POST', body: {} }); setMsg(t.mensagem) } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) }
  }
  return <form className="card" style={{ padding: 18, display: 'grid', gap: 12 }} onSubmit={salvar} key={r.atualizadoEm}>
    <div><div className="eyebrow">ERP Ctrl-e (Rein Sistemas)</div><h3>Conexão com o ERP</h3>
      <p className="muted" style={{ margin: '4px 0 0' }}>Os dados de clientes, produtos e pedidos vêm do ERP. As credenciais ficam guardadas com criptografia e nunca voltam para o navegador.</p></div>
    <div className="grid2">
      <label className="fl"><span>ClientId</span><input name="clientId" defaultValue={r.clientId} autoComplete="off" /></label>
      <label className="fl"><span>ClientSecret {r.segredoConfigurado && '(já configurado — deixe em branco para manter)'}</span><input name="clientSecret" type="password" autoComplete="new-password" /></label>
      <label className="fl"><span>Database</span><input name="database" defaultValue={r.database} autoComplete="off" /></label>
      <label className="fl"><span>Endereço da API</span><input name="baseUrl" defaultValue={r.baseUrl} /></label>
    </div>
    <label className="row"><input type="checkbox" name="mock" defaultChecked={r.mock} style={{ width: 'auto' }} /> Modo de teste (dados de exemplo, sem falar com o ERP)</label>
    <label className="row"><input type="checkbox" name="assinarComQuery" defaultChecked={r.assinarComQuery} style={{ width: 'auto' }} /> Assinar também a parte “?…” do endereço (só se a Rein pedir)</label>
    <label className="row"><input type="checkbox" name="escritaPessoa" defaultChecked={r.escritaPessoa} style={{ width: 'auto' }} /> Permitir cadastrar clientes no ERP</label>
    <label className="row"><input type="checkbox" name="escritaPedido" defaultChecked={r.escritaPedido} style={{ width: 'auto' }} /> Permitir enviar pedidos ao ERP <span className="muted">(tem efeito fiscal — ligue só depois de homologar)</span></label>
    {msg && <div className="note">{msg}</div>}
    <div className="row"><button className="btn pri" disabled={ocupado}>Salvar</button><button type="button" className="btn" disabled={ocupado} onClick={testar}>Testar conexão</button></div>
  </form>
}

function Equipe() {
  const { dados: d, erro, recarregar } = useApi<any>('/equipe')
  const toast = useToast()
  const [link, setLink] = useState('')
  if (!d) return <Carregando erro={erro} />
  async function convidar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try { const r = await api<any>('/equipe/invites', { body: { email: f.get('email'), papel: f.get('papel') } }); setLink(r.link); recarregar(); e.currentTarget.reset() } catch (x: any) { toast(x.message) }
  }
  async function alternar(m: any) {
    try { await api(`/equipe/${m.id}`, { method: 'PATCH', body: { papel: m.role, ativo: !m.active, reinUsuarioId: m.rein_user_id, whatsapp: m.whatsapp } }); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
    <div><div className="eyebrow">Acesso</div><h3>Equipe</h3></div>
    <table className="tbl"><tbody>
      {d.membros.map((m: any) => <tr key={m.id}><td><strong>{m.name}</strong><div className="muted">{m.email}</div></td><td>{PAPEL[m.role]}</td>
        <td style={{ textAlign: 'right' }}>{m.role !== 'admin' && <button className="btn sm" onClick={() => alternar(m)}>{m.active ? 'Desativar' : 'Reativar'}</button>}</td></tr>)}
    </tbody></table>
    {d.convites.length > 0 && <div className="muted">Convites pendentes: {d.convites.map((c: any) => c.email).join(', ')}</div>}
    <form className="row" onSubmit={convidar}>
      <input name="email" type="email" required placeholder="e-mail da pessoa" style={{ flex: 1, minWidth: 180 }} />
      <select name="papel" style={{ width: 'auto' }}><option value="seller">Vendedor</option><option value="manager">Gestor</option></select>
      <button className="btn pri">Convidar</button>
    </form>
    {link && <div className="linkbox"><span className="mono ell">{link}</span> <button className="btn sm" onClick={() => copiar(link, toast)}>Copiar link</button></div>}
  </div>
}
