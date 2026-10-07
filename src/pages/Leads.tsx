import { useState, type FormEvent } from 'react'
import { api, ETAPAS_LEAD, ROTULO_ETAPA, ORIGEM_LEAD, fCnpj, mascaraCnpj, waLink, telWa, fDias, fData } from '../api'
import { PageHead, Carregando, Icon, Modal, useApi, useToast, copiar } from '../ui'
import { useMe } from '../me'
import { Bloqueado, ehBloqueioDePlano } from './Bloqueado'

export default function Leads() {
  const { me } = useMe(), gestor = me.usuario.papel !== 'seller', admin = me.usuario.papel === 'admin', toast = useToast()
  const [dono, setDono] = useState(''), [mostrarFechados, setMostrarFechados] = useState(false), [novo, setNovo] = useState(false), [aberto, setAberto] = useState<string | null>(null)
  const { dados: d, erro, recarregar } = useApi<any>(`/leads${dono ? `?dono=${dono}` : ''}`)
  const equipe = useApi<any>(gestor ? '/equipe' : null)
  if (ehBloqueioDePlano(erro)) return <><PageHead eyebrow="Funil" title="Leads" /><Bloqueado mensagem={erro!} /></>
  const por = (e: string) => d?.itens.filter((l: any) => l.etapa === e) ?? []
  const Card = ({ l }: { l: any }) => <div className="card" style={{ padding: 12, cursor: 'pointer', display: 'grid', gap: 4 }} onClick={() => setAberto(l.id)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setAberto(l.id)}>
    <strong className="ell">{l.razaoSocial ?? fCnpj(l.cnpj)}</strong>
    <div className="muted" style={{ fontSize: 12.5 }}>{l.contato}{l.cidade ? ` · ${l.cidade}${l.uf ? '/' + l.uf : ''}` : ''}</div>
    {l.jaCliente ? <span className="pill p-enviado" style={{ width: 'fit-content' }}>Já é cliente{l.dono ? ` de ${l.dono}` : ''}</span> : gestor && <div className="muted" style={{ fontSize: 12 }}>{l.dono ?? 'sem dono'} · {ORIGEM_LEAD[l.origem]}</div>}
    <div className="spread"><span className="muted" style={{ fontSize: 12 }}>{fDias(l.criadoEm)}</span>
      {l.whatsapp && <a className="btn wa sm" href={waLink(telWa(l.whatsapp), `Olá, ${l.contato}! `)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} aria-label="WhatsApp"><Icon n="chat" s={14} /></a>}</div>
  </div>
  return <>
    <PageHead eyebrow="Funil de vendas" title="Leads"><button className="btn pri" onClick={() => setNovo(true)}><Icon n="plus" /> Novo lead</button></PageHead>
    <div className="stack">
      {gestor && <div className="row"><select value={dono} onChange={e => setDono(e.target.value)} style={{ width: 'auto' }} aria-label="Vendedor"><option value="">Todos os vendedores</option><option value="sem">Sem dono</option>{equipe.dados?.membros.filter((m: any) => m.active).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
      {d && <div className="card" style={{ padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Link do formulário “Seja revendedor” para divulgar</div>
        <div className="row"><span className="mono ell" style={{ flex: 1, minWidth: 0 }}>{d.linkFormulario}</span><button className="btn sm" onClick={() => copiar(d.linkFormulario, toast)}><Icon n="copy" s={14} /> Copiar</button></div></div>}
      {!d ? <Carregando erro={erro} /> : <>
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(250px, 1fr)', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {ETAPAS_LEAD.map(([k, nome]) => <div key={k} style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <div className="spread"><strong>{nome}</strong><span className="muted">{por(k).length}</span></div>
            {por(k).length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Nenhum lead aqui.</div> : por(k).map((l: any) => <Card key={l.id} l={l} />)}</div>)}
        </div>
        <button className="btn sm" style={{ width: 'fit-content' }} onClick={() => setMostrarFechados(!mostrarFechados)}>{mostrarFechados ? 'Esconder' : 'Mostrar'} convertidos e perdidos ({por('CONVERTIDO').length + por('PERDIDO').length})</button>
        {mostrarFechados && <div className="grid2">{['CONVERTIDO', 'PERDIDO'].map(k => <div key={k} style={{ display: 'grid', gap: 8, alignContent: 'start' }}><strong>{ROTULO_ETAPA[k]}</strong>{por(k).map((l: any) => <Card key={l.id} l={l} />)}</div>)}</div>}
      </>}
    </div>
    {novo && <NovoLead gestor={admin} equipe={equipe.dados?.membros ?? []} aoFechar={() => setNovo(false)} aoSalvar={recarregar} />}
    {aberto && <DetalheLead id={aberto} gestor={admin} equipe={equipe.dados?.membros ?? []} aoFechar={() => setAberto(null)} aoMudar={recarregar} />}
  </>
}

function NovoLead({ gestor, equipe, aoFechar, aoSalvar }: { gestor: boolean; equipe: any[]; aoFechar: () => void; aoSalvar: () => void }) {
  const [cnpj, setCnpj] = useState(''), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), toast = useToast()
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try { await api('/leads', { body: { ...Object.fromEntries(new FormData(e.currentTarget)), cnpj } }); toast('Lead cadastrado.'); aoSalvar(); aoFechar() } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <Modal titulo="Novo lead" sub="Cadastro manual" onClose={aoFechar}>
    <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
      <label className="fl"><span>CNPJ</span><input value={cnpj} onChange={e => setCnpj(mascaraCnpj(e.target.value))} inputMode="numeric" required placeholder="00.000.000/0000-00" className="mono" /></label>
      <div className="grid2"><label className="fl"><span>Nome do contato</span><input name="contato" required /></label><label className="fl"><span>WhatsApp</span><input name="whatsapp" inputMode="tel" required placeholder="(41) 99999-0000" /></label></div>
      <label className="fl"><span>Razão social (se vazio, buscamos pelo CNPJ)</span><input name="razaoSocial" /></label>
      <div className="grid2"><label className="fl"><span>Cidade</span><input name="cidade" /></label><label className="fl"><span>UF</span><input name="uf" maxLength={2} /></label></div>
      <div className="grid2"><label className="fl"><span>Segmento</span><input name="segmento" placeholder="Ex.: assistência técnica" /></label>
        <label className="fl"><span>Origem</span><select name="origem" defaultValue="manual"><option value="manual">Cadastro manual</option><option value="lista">Lista</option><option value="indicacao">Indicação</option></select></label></div>
      {gestor && <label className="fl"><span>Vendedor (se o CNPJ já tem carteira no ERP, vale a do ERP)</span><select name="dono" defaultValue=""><option value="">Rodízio automático</option>{equipe.filter(m => m.active && m.role === 'seller').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
      {erro && <div className="err">{erro}</div>}
      <div className="row"><button className="btn pri" disabled={ocupado}>Cadastrar</button><button type="button" className="btn" onClick={aoFechar}>Cancelar</button></div>
    </form>
  </Modal>
}

function DetalheLead({ id, gestor, equipe, aoFechar, aoMudar }: { id: string; gestor: boolean; equipe: any[]; aoFechar: () => void; aoMudar: () => void }) {
  const { dados: l, erro, recarregar } = useApi<any>(`/leads/${id}`)
  const toast = useToast()
  const [etapa, setEtapa] = useState(''), [motivo, setMotivo] = useState(''), [msg, setMsg] = useState(''), [ocupado, setOcupado] = useState(false)
  const rodar = async (f: () => Promise<any>, ok?: string) => { setOcupado(true); setMsg(''); try { const r = await f(); if (ok) toast(ok); recarregar(); aoMudar(); return r } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) } }
  const patch = (body: any, ok?: string) => rodar(() => api(`/leads/${id}`, { method: 'PATCH', body }), ok)
  if (!l) return <Modal titulo="Lead" onClose={aoFechar}><Carregando erro={erro} /></Modal>
  const fechado = l.etapa === 'CONVERTIDO'
  const salvarEtapa = async () => { if (await patch({ etapa, motivoPerda: motivo }, 'Etapa atualizada.')) { setEtapa(''); setMotivo('') } }
  const noErp = l.pessoaId || l.erpStatus === 'ENVIADO'
  return <Modal titulo={l.razaoSocial ?? fCnpj(l.cnpj)} sub={ROTULO_ETAPA[l.etapa]} onClose={aoFechar} largo>
    <div style={{ display: 'grid', gap: 14 }}>
      {l.jaCliente && <div className="note">Este CNPJ já é cliente{l.dono ? ` de ${l.dono}` : ''}. Combine quem atende antes de abordar.</div>}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        <div><div className="muted" style={{ fontSize: 12 }}>CNPJ</div><span className="mono">{fCnpj(l.cnpj)}</span></div>
        <div><div className="muted" style={{ fontSize: 12 }}>Contato</div>{l.contato}</div>
        <div><div className="muted" style={{ fontSize: 12 }}>WhatsApp</div>{l.whatsapp ?? '—'}</div>
        <div><div className="muted" style={{ fontSize: 12 }}>Cidade</div>{l.cidade ? `${l.cidade}${l.uf ? '/' + l.uf : ''}` : '—'}</div>
        <div><div className="muted" style={{ fontSize: 12 }}>Origem</div>{ORIGEM_LEAD[l.origem]}{l.segmento ? ` · ${l.segmento}` : ''}</div>
        <div><div className="muted" style={{ fontSize: 12 }}>Receita Federal</div>{l.receita?.situacao ?? 'não consultado'}</div>
        <div><div className="muted" style={{ fontSize: 12 }}>Vendedor</div>{l.dono ?? 'sem dono'}</div>
        <div><div className="muted" style={{ fontSize: 12 }}>Próximo contato</div>{l.proximoContato ? fData(l.proximoContato) : '—'}</div>
      </div>
      {l.motivoPerda && <div className="muted">Motivo da perda: {l.motivoPerda}</div>}
      {!fechado && <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}><strong>Mover de etapa</strong>
        <div className="row"><select value={etapa} onChange={e => setEtapa(e.target.value)} style={{ width: 'auto' }} aria-label="Nova etapa"><option value="">Escolher…</option>
          {[...ETAPAS_LEAD, ['PERDIDO', 'Perdido']].filter(([k]) => k !== l.etapa && (l.etapa !== 'PERDIDO' || k === 'NOVO')).map(([k, n]) => <option key={k} value={k}>{k === 'NOVO' && l.etapa === 'PERDIDO' ? 'Reabrir como Novo' : n}</option>)}</select>
          {etapa === 'PERDIDO' && <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da perda" style={{ flex: 1, minWidth: 160 }} />}
          <button className="btn pri sm" disabled={!etapa || ocupado} onClick={salvarEtapa}>Mover</button></div>
        {l.etapa !== 'PERDIDO' && <div className="row"><span className="muted">Adiar o retorno:</span>{[1, 3, 7].map(n => <button key={n} className="btn sm" disabled={ocupado} onClick={() => patch({ adiarDias: n }, `Retorno em ${n} dia(s).`)}>{n} dia(s)</button>)}</div>}
        {gestor && <div className="row"><span className="muted">Carteira do vendedor:</span><select value={l.donoId ?? ''} onChange={e => patch({ dono: e.target.value || null }, 'Vendedor atualizado.')} style={{ width: 'auto' }} aria-label="Vendedor do lead"><option value="">Sem dono</option>{equipe.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}</div>}
      {!fechado && !noErp && l.etapa !== 'PERDIDO' && <div className="row"><button className="btn" disabled={ocupado} onClick={async () => { const r = await rodar(() => api<any>(`/leads/${id}/push-erp`, { body: {} })); if (r) setMsg(r.aviso ?? (r.status === 'ENVIADO' ? 'Cadastrado no ERP.' : '')) }}>Cadastrar no ERP</button>
        {l.erpStatus === 'PENDENTE_FLAG' && <span className="muted">Cadastro direto desligado: cadastre manualmente.</span>}</div>}
      {noErp && <div className="muted">Cadastrado no ERP{l.pessoaId ? ` (nº ${l.pessoaId})` : ''}. O lead vira cliente no primeiro pedido.</div>}
      {l.erpStatus === 'ERRO' && <div className="err">{l.erpErro}<br />Confira no ERP se o CNPJ já entrou antes de tentar de novo.</div>}
      {msg && <div className="note">{msg}</div>}
      <form onSubmit={async e => { e.preventDefault(); const f = e.currentTarget, nota = String(new FormData(f).get('nota') ?? ''); if (nota.trim() && await patch({ nota }, 'Anotação salva.')) f.reset() }} className="row" style={{ flexWrap: 'nowrap' }}>
        <input name="nota" maxLength={500} placeholder="Anotar algo (ligou, pediu preço…)" aria-label="Nova anotação" /><button className="btn sm" disabled={ocupado}>Anotar</button></form>
      <div><div className="eyebrow">Histórico</div><div style={{ display: 'grid', gap: 8, marginTop: 6 }}>{l.eventos.map((e: any, i: number) => <div key={i}><div>{e.text}</div><div className="muted" style={{ fontSize: 12 }}>{e.quem ?? 'automático'} · {fData(e.criadoEm)}</div></div>)}</div></div>
    </div>
  </Modal>
}
