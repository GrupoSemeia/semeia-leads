import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, waLink, telWa, ROTULO_ETAPA } from '../api'
import { PageHead, Carregando, Icon, useApi } from '../ui'
import { useMe } from '../me'
import RegistrarContato from './RegistrarContato'

export default function Hoje() {
  const { me } = useMe(), gestor = me.usuario.papel !== 'seller'
  const [todos, setTodos] = useState(false)
  const { dados: d, erro, recarregar } = useApi<any>(`/agenda${todos ? '?escopo=todos' : ''}`)
  const [alvo, setAlvo] = useState<any>(null)
  const abrirWhats = (i: any) => {
    api(`/accounts/${i.id}/whatsapp-click`, { body: {} }).catch(() => {})   // fica no histórico; o resultado é registrado depois
    window.open(waLink(telWa(i.whatsapp), i.mensagem), '_blank', 'noopener')
  }
  return <>
    <PageHead eyebrow={todos ? 'Todos os vendedores' : 'Agenda do dia'} title="Hoje">
      {gestor && <button className="btn sm" onClick={() => setTodos(!todos)}>{todos ? 'Ver só a minha' : 'Ver todos os vendedores'}</button>}
    </PageHead>
    {!d ? <Carregando erro={erro} /> : <div className="stack">
      <div className="muted">{d.total === 0 ? 'Nada para contatar hoje.' : `${d.total} cliente(s) para contatar${d.total > d.mostrando ? ` · mostrando os ${d.mostrando} mais importantes` : ''}.`}</div>
      {d.itens.length === 0 ? <div className="card" style={{ padding: 20 }}><p className="muted" style={{ margin: 0 }}>Tudo em dia por aqui. {gestor && <>Se a agenda está vazia, confira se a carteira foi distribuída em <Link to="/carteira">Carteira</Link>.</>}</p></div>
        : <div className="card" style={{ padding: 0 }}><div className="listx">
          {d.itens.map((i: any) => <div key={i.id} style={{ alignItems: 'flex-start', cursor: 'default', flexWrap: 'wrap' }}>
            <div className="grow" style={{ minWidth: 200 }}>
              <Link to={`/carteira/${i.id}`} className="t1" style={{ color: 'inherit', textDecoration: 'none' }}>{i.nome}</Link>
              <div className="t2" style={{ whiteSpace: 'normal', color: i.kind === 'tarefa' && i.tarefa.tipo === 'TRATAR_NPS' ? 'var(--bad)' : undefined }}>{i.motivo}</div>
            </div>
            <div className="row">
              {i.whatsapp && <button className="btn wa sm" onClick={() => abrirWhats(i)}><Icon n="chat" s={16} /> WhatsApp</button>}
              <button className="btn sm" onClick={() => setAlvo(i)}><Icon n="check" s={16} /> Registrar</button>
            </div>
          </div>)}
        </div></div>}
      {d.leads?.length > 0 && <div className="card" style={{ padding: 0 }}><div style={{ padding: '12px 16px' }}><div className="eyebrow">Leads para acompanhar</div></div><div className="listx">
        {d.leads.map((l: any) => <div key={l.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 180 }}><Link to="/leads" className="t1" style={{ color: 'inherit', textDecoration: 'none' }}>{l.razaoSocial ?? l.contato}</Link>
            <div className="t2">{ROTULO_ETAPA[l.etapa]} · {l.contato}{l.jaCliente ? ' · já é cliente' : ''}</div></div>
          {l.whatsapp && <a className="btn wa sm" href={waLink(telWa(l.whatsapp), l.mensagem)} target="_blank" rel="noreferrer"><Icon n="chat" s={16} /> WhatsApp</a>}
          <Link className="btn sm" to="/leads">Abrir</Link></div>)}</div></div>}
    </div>}
    {alvo && <RegistrarContato pessoaId={alvo.id} nome={alvo.nome} tarefaId={alvo.tarefa?.id} aoFechar={() => setAlvo(null)} aoSalvar={recarregar} />}
  </>
}
