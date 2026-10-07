import { useEffect, useState, type FormEvent } from 'react'
import { api, brl, fData, digitos } from '../api'
import { PageHead, Carregando, Icon, useApi, useToast } from '../ui'
import { useMe } from '../me'

const ST: Record<string, [string, string]> = { PENDING: ['Em aberto', 'p-enviado'], OVERDUE: ['Vencida', 'p-recusado'], CONFIRMED: ['Paga', 'p-aprovado'], RECEIVED: ['Paga', 'p-aprovado'], RECEIVED_IN_CASH: ['Paga', 'p-aprovado'], REFUNDED: ['Estornada', ''] }
const STATUS_ASSINATURA: Record<string, string> = { pendente: 'Aguardando o primeiro pagamento', ativa: 'Ativa', atrasada: 'Pagamento atrasado', cancelada: 'Cancelada' }

/** Plano e pagamento. Quando a conta está bloqueada (teste acabou, sem pagamento, cancelada), esta é a única tela liberada. */
export default function Assinatura() {
  const { me, recarregar } = useMe(), admin = me.usuario.papel === 'admin', toast = useToast()
  const { dados: d, erro, recarregar: recarregarDados } = useApi<any>(admin ? '/assinatura' : null)
  const [tier, setTier] = useState(''), [extra, setExtra] = useState(0), [ciclo, setCiclo] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY'), [doc, setDoc] = useState('')
  const [msg, setMsg] = useState(''), [url, setUrl] = useState(''), [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (d?.assinatura && !tier) { setTier(d.assinatura.tier); setExtra(d.assinatura.extraSellers); setCiclo(d.assinatura.ciclo) } }, [d, tier])
  // ao voltar da página de pagamento, confere sozinho
  useEffect(() => { if (!admin || !me.plano.bloqueado) return; const f = () => { api('/assinatura/atualizar', { body: {} }).then(() => recarregar()).catch(() => {}) }; addEventListener('focus', f); return () => removeEventListener('focus', f) }, [admin, me.plano.bloqueado, recarregar])

  if (!admin) return <><PageHead eyebrow="Conta" title="Plano e pagamento" /><div className="card" style={{ padding: 20 }}><p style={{ margin: 0 }}>{me.plano.mensagem ?? 'Somente o administrador da empresa gerencia o plano e o pagamento.'}</p>{me.plano.bloqueado && <p className="muted" style={{ marginBottom: 0 }}>Avise o administrador da sua empresa.</p>}</div></>
  if (!d) return <Carregando erro={erro} />

  const planos = Object.entries(d.precos.planos) as [string, any][], sub = d.assinatura, mudando = !!sub && sub.status !== 'cancelada'
  const total = tier ? (d.precos.planos[tier].preco + extra * d.precos.vendedorExtra) * ((mudando ? sub.ciclo : ciclo) === 'YEARLY' ? d.precos.mesesPagosNoAno : 1) : 0
  async function enviar(e: FormEvent) {
    e.preventDefault(); setMsg(''); setUrl(''); setOcupado(true)
    try { const r = await api<any>('/assinatura', { body: { tier, extraSellers: extra, ciclo, cpfCnpj: doc } }); setUrl(r.url ?? ''); toast(r.mudou ? 'Plano atualizado.' : 'Assinatura criada. Abra o pagamento para concluir.'); recarregarDados(); recarregar() } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) }
  }
  const acao = async (caminho: string, ok: string, confirma?: string) => { if (confirma && !confirm(confirma)) return; setOcupado(true); setMsg(''); try { await api(caminho, { body: {} }); toast(ok); recarregarDados(); recarregar() } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) } }
  const ate = d.acesso?.ateQuando ? fData(d.acesso.ateQuando + ' 12:00:00') : null

  return <>
    <PageHead eyebrow="Conta" title="Plano e pagamento" />
    <div className="stack">
      {d.mensagem && <div className="err">{d.mensagem}</div>}
      {!d.online && <div className="note">O pagamento online ainda não foi ativado neste ambiente. Fale com o Grupo Semeia Digital para contratar ou mudar de plano.</div>}
      {sub && <div className="card" style={{ padding: 16, display: 'grid', gap: 6 }}>
        <div className="spread"><div><div className="eyebrow">Sua assinatura</div><strong>{d.precos.planos[sub.tier].nome}{sub.extraSellers ? ` + ${sub.extraSellers} vendedor(es)` : ''} · {sub.ciclo === 'YEARLY' ? 'anual' : 'mensal'}</strong></div>
          <span className={`pill ${sub.status === 'ativa' ? 'p-aprovado' : sub.status === 'atrasada' ? 'p-recusado' : 'p-enviado'}`}>{STATUS_ASSINATURA[sub.status]}</span></div>
        <div className="muted">{brl(sub.valor)} por {sub.ciclo === 'YEARLY' ? 'ano' : 'mês'}{sub.pagoAte ? ` · pago até ${fData(sub.pagoAte + ' 12:00:00')}` : ''}{ate && sub.status !== 'cancelada' && d.acesso?.aviso === 'atrasada' ? ` · acesso garantido até ${ate}` : ''}</div>
        {d.aberto && <div className="row" style={{ marginTop: 6 }}><a className="btn pri" href={d.aberto.url} target="_blank" rel="noreferrer">Pagar {brl(d.aberto.valor)} (vence {fData(d.aberto.vencimento + ' 12:00:00')})</a>
          <button className="btn" disabled={ocupado} onClick={() => acao('/assinatura/atualizar', 'Conferido.')}>Já paguei, atualizar</button></div>}
      </div>}
      <form className="card" style={{ padding: 16, display: 'grid', gap: 12 }} onSubmit={enviar}>
        <div><div className="eyebrow">{mudando ? 'Mudar de plano' : 'Escolha seu plano'}</div>
          {me.trialDias !== null && <p className="muted" style={{ margin: '4px 0 0' }}>Seu teste grátis termina em {me.trialDias} dia(s). A primeira cobrança só acontece no fim do teste.</p>}</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {planos.map(([k, p]) => <label key={k} className="card" style={{ padding: 14, cursor: 'pointer', display: 'grid', gap: 4, borderColor: tier === k ? 'var(--accent)' : undefined }}>
            <span className="row"><input type="radio" name="tier" value={k} checked={tier === k} onChange={() => setTier(k)} style={{ width: 'auto' }} /><strong>{p.nome}</strong></span>
            <span className="num" style={{ fontSize: 20 }}>{brl(p.preco)}<span className="muted" style={{ fontSize: 12 }}>/mês</span></span>
            <span className="muted" style={{ fontSize: 12.5 }}>{p.vendedores} vendedores · {p.clientes ? `${p.clientes} clientes` : 'clientes sem limite'}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{p.resumo}</span></label>)}
        </div>
        <div className="grid2">
          <label className="fl"><span>Vendedores adicionais ({brl(d.precos.vendedorExtra)}/mês cada)</span><input type="number" min={0} max={100} value={extra} onChange={e => setExtra(Math.max(0, Math.floor(Number(e.target.value))))} /></label>
          {!mudando && <label className="fl"><span>Cobrança</span><select value={ciclo} onChange={e => setCiclo(e.target.value as any)}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual (2 meses grátis)</option></select></label>}
        </div>
        {!mudando && <label className="fl"><span>CPF ou CNPJ de quem paga (vai só para a Asaas, não fica guardado aqui)</span><input value={doc} onChange={e => setDoc(digitos(e.target.value).slice(0, 14))} inputMode="numeric" placeholder="Só números" required className="mono" /></label>}
        {tier && <div className="note"><strong>{brl(total)}</strong> por {(mudando ? sub.ciclo : ciclo) === 'YEARLY' ? 'ano' : 'mês'}. {mudando ? (sub.status === 'ativa' ? 'O plano novo vale já; o valor novo entra na próxima cobrança.' : 'O plano novo vale quando o pagamento for confirmado.') : 'O plano passa a valer quando o pagamento for confirmado. Pix, boleto ou cartão, na página da Asaas.'}</div>}
        {msg && <div className="err">{msg}</div>}
        {url && <a className="btn pri" href={url} target="_blank" rel="noreferrer"><Icon n="arrow" s={16} /> Abrir página de pagamento</a>}
        <div><button className="btn pri" disabled={ocupado || !tier || !d.online}>{ocupado ? 'Enviando…' : mudando ? 'Atualizar plano' : 'Contratar'}</button></div>
      </form>
      {d.pagamentos.length > 0 && <div className="card" style={{ padding: 16 }}><div className="eyebrow">Cobranças</div><div className="scrollx"><table className="tbl"><tbody>
        {d.pagamentos.map((p: any) => <tr key={p.id}><td>{fData(p.vencimento + ' 12:00:00')}</td><td className="num">{brl(p.valor)}</td><td><span className={`pill ${ST[p.status]?.[1] ?? ''}`}>{ST[p.status]?.[0] ?? p.status}</span></td><td className="r">{p.url && p.status !== 'RECEIVED' && p.status !== 'CONFIRMED' && <a href={p.url} target="_blank" rel="noreferrer">abrir</a>}</td></tr>)}</tbody></table></div></div>}
      {mudando && <div><button className="btn danger" disabled={ocupado} onClick={() => acao('/assinatura/cancelar', 'Assinatura cancelada.', 'Cancelar a renovação? Você continua usando até o fim do período já pago. Seus dados ficam guardados.')}>Cancelar assinatura</button></div>}
    </div>
  </>
}
