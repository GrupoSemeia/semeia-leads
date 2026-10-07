import { useState, type FormEvent } from 'react'
import { api, PAPEL } from '../api'
import { PageHead, Carregando, useApi, useToast, copiar } from '../ui'
import { useMe } from '../me'
import { brl } from '../api'

export default function Config() {
  return <><PageHead eyebrow="Empresa" title="Configurações" /><div className="stack"><PlanoCard /><ConexaoErp /><PedidoErp /><PessoaErp /><TrocasNoErp /><Sincronizacao /><Modelos /><Equipe /></div></>
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
  const erp = useApi<any>('/equipe/vendedores-erp')
  if (!d) return <Carregando erro={erro} />
  async function convidar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try { const r = await api<any>('/equipe/invites', { body: { email: f.get('email'), papel: f.get('papel') } }); setLink(r.link); recarregar(); e.currentTarget.reset() } catch (x: any) { toast(x.message) }
  }
  async function vincular(m: any, valor: string) {
    try { await api(`/equipe/${m.id}`, { method: 'PATCH', body: { papel: m.role, ativo: !!m.active, reinUsuarioId: valor ? Number(valor) : null, whatsapp: m.whatsapp } }); toast('Vínculo salvo. Carteira atualizada.'); recarregar() } catch (x: any) { toast(x.message) }
  }
  async function alternar(m: any) {
    try { await api(`/equipe/${m.id}`, { method: 'PATCH', body: { papel: m.role, ativo: !m.active, reinUsuarioId: m.rein_user_id, whatsapp: m.whatsapp } }); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
    <div><div className="eyebrow">Acesso</div><h3>Equipe</h3></div>
    <table className="tbl"><tbody>
      {d.membros.map((m: any) => <tr key={m.id}><td><strong>{m.name}</strong><div className="muted">{m.email}</div></td><td>{PAPEL[m.role]}</td>
        <td><select value={m.rein_user_id ?? ''} onChange={e => vincular(m, e.target.value)} aria-label={`Vendedor do ERP de ${m.name}`} style={{ width: 'auto', maxWidth: 200 }}><option value="">Vendedor do ERP…</option>{erp.dados?.itens.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></td>
        <td style={{ textAlign: 'right' }}>{m.role !== 'admin' && <button className="btn sm" onClick={() => alternar(m)}>{m.active ? 'Desativar' : 'Reativar'}</button>}</td></tr>)}
    </tbody></table>
    <div className="muted">Ligue cada vendedor ao nome dele no ERP: assim os clientes caem na carteira de quem vendeu por último.</div>
    {d.convites.length > 0 && <div className="muted">Convites pendentes: {d.convites.map((c: any) => c.email).join(', ')}</div>}
    <form className="row" onSubmit={convidar}>
      <input name="email" type="email" required placeholder="e-mail da pessoa" style={{ flex: 1, minWidth: 180 }} />
      <select name="papel" style={{ width: 'auto' }}><option value="seller">Vendedor</option><option value="manager">Gestor</option></select>
      <button className="btn pri">Convidar</button>
    </form>
    {link && <div className="linkbox"><span className="mono ell">{link}</span> <button className="btn sm" onClick={() => copiar(link, toast)}>Copiar link</button></div>}
  </div>
}

const NOME_JOB: Record<string, string> = { backfill: 'Carga inicial (24 meses)', cadastros: 'Atualizar cadastros', pedidos: 'Atualizar pedidos' }
const QUANDO = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : 'nunca')

function Sincronizacao() {
  const { dados: d, erro, recarregar } = useApi<any>('/sync')
  const [rodando, setRodando] = useState<string | null>(null), [prog, setProg] = useState<any>(null), [msg, setMsg] = useState('')
  if (!d) return <Carregando erro={erro} />
  async function rodar(job: string, reiniciar: boolean) {
    setRodando(job); setMsg(''); setProg(null)
    try {
      let p: any, vezes = 0, primeira = true
      do {   // cada chamada faz uma fatia; repete até terminar
        p = await api(`/sync/${job}/run`, { body: { reiniciar: reiniciar && primeira } }); primeira = false
        setProg(p); if (p.erro) throw new Error(p.erro)
        if (!p.done && ++vezes > 400) throw new Error('Demorou demais; tente de novo.')
      } while (!p.done)
      setMsg('Sincronização concluída.')
    } catch (x: any) { setMsg(x.message) } finally { setRodando(null); recarregar() }
  }
  const c = d.contagens
  return <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
    <div><div className="eyebrow">Dados do ERP</div><h3>Sincronização</h3>
      <p className="muted" style={{ margin: '4px 0 0' }}>Copia clientes, produtos e pedidos do ERP para o app. Faça a carga inicial uma vez; depois o app se atualiza sozinho (pedidos a cada 15 min, cadastros de madrugada).</p></div>
    <div className="kpis">{[['Clientes', c.clientes], ['Produtos', c.produtos], ['Vendedores', c.vendedores], ['Pedidos', c.pedidos]].map(([l, v]) => <div className="kpi" key={l as string}><div className="l">{l}</div><div className="v num">{v as number}</div></div>)}</div>
    {c.pedidosSemItens > 0 && <div className="muted">{c.pedidosSemItens} pedido(s) ainda sem os itens — rode “Atualizar pedidos”.</div>}
    {d.jobs.map((j: any) => <div className="spread" key={j.job}>
      <div><strong>{NOME_JOB[j.job]}</strong><div className="muted">Última vez: {QUANDO(j.ultimoOk)}{j.status === 'running' && ' · em andamento'}{j.erro && ` · erro: ${j.erro}`}</div></div>
      <div className="row">{j.status === 'running' && <button className="btn sm" disabled={!!rodando} onClick={() => rodar(j.job, false)}>Continuar</button>}
        <button className="btn sm pri" disabled={!!rodando} onClick={() => rodar(j.job, true)}>{rodando === j.job ? 'Sincronizando…' : 'Rodar agora'}</button></div></div>)}
    {prog && rodando && <div className="note">{prog.etapa} · passo {prog.passo} de {prog.passos}</div>}
    {msg && <div className="note">{msg}</div>}
  </div>
}

function PlanoCard() {
  const { me } = useMe(), p = me.plano
  const uso = (n: number, lim: number | null) => (lim === null ? `${n} (sem limite)` : `${n} de ${lim}`)
  const estourou = p.limiteClientes !== null && p.clientes > p.limiteClientes
  return <div className="card" style={{ padding: 18, display: 'grid', gap: 10 }}>
    <div className="spread"><div><div className="eyebrow">Seu plano</div><h3>{p.emTeste ? `Teste grátis · tudo liberado (${me.trialDias} dia(s))` : p.nome}</h3></div>
      <span className="muted">{p.emTeste ? `Depois: plano ${p.contratado}` : `${brl(p.preco)}/mês`}</span></div>
    <div className="grid2"><div><div className="muted" style={{ fontSize: 12 }}>Vendedores</div><strong>{uso(p.vendedores, p.limiteVendedores)}</strong></div>
      <div><div className="muted" style={{ fontSize: 12 }}>Clientes na carteira</div><strong>{uso(p.clientes, p.limiteClientes)}</strong></div></div>
    {estourou && <div className="note">Sua carteira passou do limite do plano. Nada foi apagado, mas considere subir de plano.</div>}
    <p className="muted" style={{ margin: 0 }}>Vendedor adicional: {brl(p.vendedorExtra)}/mês. Pagando por 1 ano, você ganha 2 meses. Para trocar de plano, fale com o Grupo Semeia Digital.</p>
  </div>
}

function Modelos() {
  const { dados: d, erro, recarregar } = useApi<any>('/templates')
  const toast = useToast()
  if (!d) return <Carregando erro={erro} />
  async function salvar(e: FormEvent<HTMLFormElement>, key: string) {
    e.preventDefault(); const f = new FormData(e.currentTarget)
    try { await api(`/templates/${key}`, { method: 'PUT', body: { title: f.get('title'), body: f.get('body') } }); toast('Modelo salvo.'); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <div className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
    <div><div className="eyebrow">WhatsApp</div><h3>Modelos de mensagem</h3>
      <p className="muted" style={{ margin: '4px 0 0' }}>Use {'{{contato}}'}, {'{{vendedor}}'}, {'{{empresa}}'}, {'{{produto}}'} e {'{{link}}'} (a pesquisa de satisfação). O vendedor sempre revisa a mensagem antes de enviar.</p></div>
    {d.itens.map((m: any) => <form key={m.key + m.body} onSubmit={e => salvar(e, m.key)} style={{ display: 'grid', gap: 6 }}>
      <input name="title" defaultValue={m.title} aria-label="Título" /><textarea name="body" defaultValue={m.body} rows={3} aria-label={`Texto de ${m.title}`} />
      <div><button className="btn sm">Salvar</button></div></form>)}
  </div>
}

const CAMPOS_PEDIDO: [string, string, string][] = [['codOrigem', 'Empresa emitente (CodOrigem)', 'number'], ['canalVendaId', 'Canal de venda “App Carteira” (id no ERP)', 'number'], ['codNatureza', 'Natureza da operação', 'text'],
  ['usoMercadoria', 'Uso da mercadoria', 'text'], ['indicadorPresenca', 'Indicador de presença', 'number'], ['codMeioPagamento', 'Meio de pagamento (código)', 'number'], ['prazoDias', 'Prazo da parcela (dias)', 'number']]
function PedidoErp() {
  const { dados: c, erro, recarregar } = useApi<any>('/rein/pedido')
  const toast = useToast()
  if (!c) return <Carregando erro={erro} />
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget))
    try { await api('/rein/pedido', { method: 'PUT', body: f }); toast('Configuração do pedido salva.'); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <form className="card" style={{ padding: 18, display: 'grid', gap: 12 }} onSubmit={salvar}>
    <div><div className="eyebrow">Pré-pedido</div><h3>Envio de pedido ao ERP</h3>
      <p className="muted" style={{ margin: '4px 0 0' }}>Valores que o ERP exige para criar um pedido de venda. Peça os códigos certos à Rein e à AC3 antes de ligar “Permitir enviar pedidos ao ERP”: pedido tem efeito fiscal.</p></div>
    <div className="grid2">{CAMPOS_PEDIDO.map(([k, l, t]) => <label className="fl" key={k}><span>{l}</span><input name={k} type={t} defaultValue={c[k] ?? ''} /></label>)}</div>
    <div><button className="btn pri">Salvar</button></div>
  </form>
}

function PessoaErp() {
  const { dados: c, erro, recarregar } = useApi<any>('/rein/pessoa')
  const toast = useToast()
  if (!c) return <Carregando erro={erro} />
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try { await api('/rein/pessoa', { method: 'PUT', body: Object.fromEntries(new FormData(e.currentTarget)) }); toast('Configuração salva.'); recarregar() } catch (x: any) { toast(x.message) }
  }
  return <form className="card" style={{ padding: 18, display: 'grid', gap: 12 }} onSubmit={salvar}>
    <div><div className="eyebrow">Leads e carteira</div><h3>Cadastro no ERP e vendedor da carteira</h3>
      <p className="muted" style={{ margin: '4px 0 0' }}>Código do tipo de cliente “Prospect” no ERP, usado ao cadastrar um lead como pessoa. Peça o código certo à Rein antes de ligar “Permitir cadastrar clientes no ERP”.</p></div>
    <div className="grid2"><label className="fl"><span>Código do tipo de cliente</span><input name="tipoClienteId" type="number" defaultValue={c.tipoClienteId ?? ''} /></label>
      <label className="fl"><span>Nome do tipo</span><input name="tipoClienteNome" defaultValue={c.tipoClienteNome} /></label></div>
    <label className="fl"><span>Campo do vendedor no cadastro do ERP</span><input name="campoVendedor" defaultValue={c.campoVendedor} placeholder="Ex.: o nome do campo que a Rein indicar" autoComplete="off" /></label>
    <p className="muted" style={{ margin: 0 }}>Quando preenchido, o ERP manda na carteira: o vendedor do cliente é lido desse campo, e cada troca de carteira feita aqui (só o administrador troca) é gravada nele. Deixe vazio até a Rein confirmar o nome do campo.</p>
    <div><button className="btn pri">Salvar</button></div>
  </form>
}

const ST_TROCA: Record<string, string> = { PENDENTE: 'Aguardando envio', ENVIANDO: 'Enviando…', ERRO: 'Erro', ENVIADO: 'No ERP' }
function TrocasNoErp() {
  const { me } = useMe(), admin = me.usuario.papel === 'admin'
  const { dados: d, erro, recarregar } = useApi<any>('/accounts/erp-pendencias')
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  if (!d) return <Carregando erro={erro} />
  async function enviar() {
    setOcupado(true)
    try {
      let r: any, voltas = 0
      do { r = await api<any>('/accounts/erp-pendencias/processar', { body: {} }); voltas++ } while (!r.bloqueio && r.processados > 0 && r.restantes > 0 && voltas < 50)
      toast(r.bloqueio === 'campo' ? 'Falta configurar o campo do vendedor no ERP.' : r.bloqueio === 'trava' ? 'O cadastro/atualização de pessoas no ERP está desligado.' : r.bloqueio ? 'Confira a conexão com o ERP.' : 'Envio concluído.')
    } catch (x: any) { toast(x.message) } finally { setOcupado(false); recarregar() }
  }
  const resolver = async (id: string, resultado: string) => { try { await api(`/accounts/erp-pendencias/${id}/resolver`, { body: { resultado } }); recarregar() } catch (x: any) { toast(x.message) } }
  return <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
    <div><div className="eyebrow">Carteira</div><h3>Trocas de vendedor no ERP</h3>
      <p className="muted" style={{ margin: '4px 0 0' }}>Quando o administrador troca um cliente de carteira, a troca entra aqui e é enviada ao ERP. {!d.campoConfigurado && 'Enquanto o campo do vendedor não for configurado (acima), as trocas ficam só no app.'} {d.campoConfigurado && !d.escritaLigada && 'A escrita de pessoas no ERP está desligada: as trocas aguardam.'}</p></div>
    {d.itens.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhuma troca recente.</p> : <div className="scrollx"><table className="tbl"><tbody>
      {d.itens.map((i: any) => <tr key={i.id}><td>{i.cliente ?? `Cliente ${i.pessoaId}`}<div className="muted" style={{ fontSize: 12 }}>para {i.para}</div></td>
        <td><span className={`pill ${i.status === 'ENVIADO' ? 'p-aprovado' : i.status === 'ERRO' ? 'p-recusado' : 'p-enviado'}`}>{ST_TROCA[i.status]}</span>{i.erro && <div className="muted" style={{ fontSize: 12, maxWidth: 260 }}>{i.erro}</div>}</td>
        <td className="r">{admin && i.status === 'ERRO' && <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sm" onClick={() => resolver(i.id, 'ENVIADO')}>Já mudou no ERP</button><button className="btn sm" onClick={() => resolver(i.id, 'PENDENTE')}>Tentar de novo</button></div>}</td></tr>)}</tbody></table></div>}
    {admin && d.pendentes > 0 && <div><button className="btn pri" disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : `Enviar ${d.pendentes} troca(s) ao ERP agora`}</button></div>}
  </div>
}
