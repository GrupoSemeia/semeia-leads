import { useState } from 'react'
import { api, brl, brlInt, fData } from '../api'
import { PageHead, Carregando, Modal, useApi, useToast } from '../ui'

const SIT: Record<string, [string, string]> = { teste: ['Em teste', 'p-enviado'], ativa: ['Ativa', 'p-aprovado'], suspensa: ['Suspensa', 'p-recusado'], bloqueada: ['Bloqueada', 'p-recusado'] }
const MOTIVO: Record<string, string> = { teste_acabou: 'teste acabou', sem_pagamento: 'sem pagamento', cancelado: 'cancelou', suspenso: 'suspensa pelo suporte' }
const quando = (s: string | null) => (s ? fData(s) : '—')

/** Administração da plataforma (só e-mails em ADMINS). Mostra uso e cobrança; não abre clientes, pedidos nem leads das empresas. */
export default function Admin() {
  const { dados: d, erro, recarregar } = useApi<any>('/admin/tenants')
  const [busca, setBusca] = useState(''), [sit, setSit] = useState(''), [aberta, setAberta] = useState<any>(null)
  if (!d) return <Carregando erro={erro} />
  const r = d.resumo, lista = d.empresas.filter((e: any) => (!sit || e.situacao === sit) && (!busca || `${e.name} ${e.dono} ${e.slug} ${e.city}`.toLowerCase().includes(busca.toLowerCase())))
  const Tile = ({ l, v, s }: { l: string; v: string | number; s?: string }) => <div className="kpi"><div className="l">{l}</div><div className="v num" style={{ fontSize: 28 }}>{v}</div>{s && <div className="s">{s}</div>}</div>
  return <>
    <PageHead eyebrow="Grupo Semeia Digital" title="Todas as empresas" />
    <div className="stack">
      <div className="kpis">
        <Tile l="Empresas" v={r.empresas} s={`${r.emTeste} em teste · ${r.ativas} ativas`} />
        <Tile l="Receita mensal" v={brlInt(r.receitaMensal)} s="assinaturas ativas (anual ÷ 12)" />
        <Tile l="Teste acabando" v={r.testeAcabando} s="faltam até 3 dias" />
        <Tile l="Atenção" v={r.atrasadas + r.bloqueadas + r.suspensas} s={`${r.atrasadas} atrasadas · ${r.bloqueadas} bloqueadas · ${r.suspensas} suspensas`} />
      </div>
      <div className="row"><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por empresa, e-mail ou cidade" aria-label="Buscar empresa" style={{ flex: 1, minWidth: 200 }} />
        <select value={sit} onChange={e => setSit(e.target.value)} style={{ width: 'auto' }} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(SIT).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select></div>
      <div className="card" style={{ padding: 0 }}><div className="listx">
        {lista.length === 0 && <div style={{ cursor: 'default' }}><span className="muted">Nenhuma empresa com esse filtro.</span></div>}
        {lista.map((e: any) => <div key={e.id} onClick={() => setAberta(e)} role="button" tabIndex={0} onKeyDown={ev => ev.key === 'Enter' && setAberta(e)} style={{ flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 200 }}><div className="t1 ell">{e.name}</div>
            <div className="t2" style={{ whiteSpace: 'normal' }}>{e.dono ?? 'sem dono'} · {e.vendedores} vendedor(es) · {e.clientes} cliente(s) · login {quando(e.ultimoLogin)}</div></div>
          <div style={{ textAlign: 'right' }}><span className={`pill ${SIT[e.situacao][1]}`}>{SIT[e.situacao][0]}</span>
            <div className="muted" style={{ fontSize: 12 }}>{e.situacao === 'bloqueada' ? MOTIVO[e.acessoMotivo] : e.situacao === 'teste' ? `${e.testeAcabaEmDias} dia(s) de teste` : `${d.planos[e.tier].nome}${e.extraSellers ? ` +${e.extraSellers}` : ''}`}{e.assinaturaStatus ? ` · ${e.assinaturaStatus}` : ''}</div></div>
        </div>)}
      </div></div>
    </div>
    {aberta && <Editar e={aberta} planos={d.planos} aoFechar={() => setAberta(null)} aoSalvar={() => { setAberta(null); recarregar() }} />}
  </>
}

function Editar({ e, planos, aoFechar, aoSalvar }: { e: any; planos: any; aoFechar: () => void; aoSalvar: () => void }) {
  const toast = useToast()
  const [plan, setPlan] = useState(e.plan), [tier, setTier] = useState(e.tier), [extra, setExtra] = useState(e.extraSellers), [msg, setMsg] = useState(''), [ocupado, setOcupado] = useState(false)
  const enviar = async (corpo: any, ok: string) => { setOcupado(true); setMsg(''); try { await api(`/admin/tenants/${e.id}`, { method: 'PATCH', body: corpo }); toast(ok); aoSalvar() } catch (x: any) { setMsg(x.message) } finally { setOcupado(false) } }
  const dado = (l: string, v: React.ReactNode) => <div><div className="muted" style={{ fontSize: 12 }}>{l}</div><div>{v || '—'}</div></div>
  return <Modal titulo={e.name} sub={`${SIT[e.situacao][0]} · criada em ${quando(e.createdAt)}`} onClose={aoFechar} largo>
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        {dado('Dono', e.dono)}{dado('Cidade', e.city)}{dado('WhatsApp', e.whatsapp)}{dado('Último login', quando(e.ultimoLogin))}
        {dado('Equipe', `${e.membros} pessoa(s), ${e.vendedores} vendedor(es)`)}{dado('Clientes na carteira', e.clientes)}
        {dado('Teste grátis até', e.plan === 'trial' ? quando(e.trialUntil) : '—')}
        {dado('Cobrança', e.assinaturaStatus ? `${e.assinaturaStatus} · ${brl(e.valorAssinatura)}/${e.ciclo === 'YEARLY' ? 'ano' : 'mês'}${e.pagoAte ? ` · pago até ${quando(e.pagoAte + ' 12:00:00')}` : ''}` : 'sem assinatura')}
        {dado('ERP', !e.erpConfigurado && !e.erpTeste ? 'não configurado' : `${e.erpTeste ? 'modo de teste' : 'conectado'}${e.erpEscrita ? ' · escrita ligada' : ''}`)}
        {dado('Última sincronização', e.ultimoSync ? quando(e.ultimoSync) : 'nunca')}{e.syncComErro > 0 && <div className="err">Sincronização com erro ({e.syncComErro} job). Peça para a empresa abrir Configurações.</div>}
      </div>
      <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}><strong>Ações rápidas</strong>
        <div className="row">
          {e.plan === 'trial' && [7, 14].map(n => <button key={n} className="btn sm" disabled={ocupado} onClick={() => enviar({ estenderTesteDias: n }, `Teste estendido em ${n} dias.`)}>Estender teste +{n} dias</button>)}
          {e.plan !== 'ativo' && <button className="btn sm" disabled={ocupado} onClick={() => confirm('Liberar esta empresa SEM cobrança (plano ativo manual)? Use para o piloto ou cortesia.') && enviar({ plan: 'ativo' }, 'Empresa liberada.')}>Liberar sem cobrança</button>}
          {e.plan !== 'suspenso' ? <button className="btn sm danger" disabled={ocupado} onClick={() => confirm('Suspender? Ninguém da empresa consegue entrar (os dados ficam guardados).') && enviar({ plan: 'suspenso' }, 'Empresa suspensa.')}>Suspender</button>
            : <button className="btn sm" disabled={ocupado} onClick={() => enviar({ plan: e.assinaturaStatus ? 'ativo' : 'trial' }, 'Empresa reativada.')}>Reativar</button>}
        </div></div>
      <form onSubmit={ev => { ev.preventDefault(); enviar({ plan, tier, extraSellers: extra }, 'Empresa atualizada.') }} className="card" style={{ padding: 12, display: 'grid', gap: 10 }}><strong>Ajuste manual</strong>
        <div className="grid3">
          <label className="fl"><span>Situação</span><select value={plan} onChange={ev => setPlan(ev.target.value)}><option value="trial">Em teste</option><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option></select></label>
          <label className="fl"><span>Plano</span><select value={tier} onChange={ev => setTier(ev.target.value)}>{Object.entries(planos).map(([k, p]: [string, any]) => <option key={k} value={k}>{p.nome}</option>)}</select></label>
          <label className="fl"><span>Vendedores extras</span><input type="number" min={0} max={1000} value={extra} onChange={ev => setExtra(Math.max(0, Math.floor(Number(ev.target.value))))} /></label>
        </div>
        {e.assinaturaStatus && <div className="muted" style={{ fontSize: 12.5 }}>Esta empresa tem assinatura na Asaas: o plano e os vendedores extras mudam sozinhos conforme os pagamentos. Use o ajuste manual só em exceção.</div>}
        {msg && <div className="err">{msg}</div>}
        <div><button className="btn pri" disabled={ocupado}>Salvar ajuste</button></div></form>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Por privacidade, esta tela não mostra clientes, pedidos, leads nem preços da empresa.</p>
    </div>
  </Modal>
}
