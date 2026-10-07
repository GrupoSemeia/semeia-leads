import { useState } from 'react'
import { brl, brlInt, brlCompacto, pct, sinal, ORIGEM_LEAD, ROTULO_ETAPA } from '../api'
import { PageHead, Carregando, useApi } from '../ui'
import { Bloqueado, ehBloqueioDePlano } from './Bloqueado'

type Ponto = { mes: string; rotulo: string; faturamento: number; pedidos: number; positivados: number; positivacao: number }

/** Coluna mensal de UMA série (faturamento): colunas finas com topo arredondado, base única, dica ao passar o mouse/foco e visão em tabela. */
function ColunasMensais({ serie, destaque }: { serie: Ponto[]; destaque: string }) {
  const [foco, setFoco] = useState<number | null>(null), [tabela, setTabela] = useState(false)
  const W = 600, H = 190, base = H - 6, topo = 24, slot = W / serie.length, largura = Math.min(24, slot - 12)
  const max = Math.max(...serie.map(p => p.faturamento), 1), alt = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * (base - topo))
  const coluna = (x: number, h: number) => { const r = Math.min(4, h, largura / 2); return `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + largura - r} Q${x + largura},${base - h} ${x + largura},${base - h + r} V${base} Z` }
  return <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
    <div className="spread"><div><div className="eyebrow">Faturamento</div><strong>Últimos 12 meses</strong></div><button className="btn sm" onClick={() => setTabela(!tabela)} aria-pressed={tabela}>{tabela ? 'Ver gráfico' : 'Ver tabela'}</button></div>
    {tabela ? <div className="scrollx"><table className="tbl"><thead><tr><th>Mês</th><th className="r">Faturamento</th><th className="r">Pedidos</th><th className="r">Clientes que compraram</th></tr></thead><tbody>
      {serie.map(p => <tr key={p.mes}><td>{p.rotulo}</td><td className="r num">{brl(p.faturamento)}</td><td className="r num">{p.pedidos}</td><td className="r num">{p.positivados}</td></tr>)}</tbody></table></div> :
      <div>
        <div style={{ position: 'relative', aspectRatio: `${W} / ${base + 6}` }}>
          <svg viewBox={`0 0 ${W} ${base + 6}`} width="100%" height="100%" role="img" aria-label="Faturamento por mês nos últimos 12 meses" style={{ position: 'absolute', inset: 0 }}>
            {[0.5, 1].map(f => <line key={f} x1={0} x2={W} y1={base - f * (base - topo)} y2={base - f * (base - topo)} stroke="var(--line)" strokeWidth={1} />)}
            <line x1={0} x2={W} y1={base} y2={base} stroke="var(--line-2)" strokeWidth={1} />
            {serie.map((p, i) => { const x = i * slot + (slot - largura) / 2, h = alt(p.faturamento), ativo = foco === i, atual = p.mes === destaque
              return <g key={p.mes}>
                <rect x={i * slot} y={0} width={slot} height={base + 6} fill="transparent" tabIndex={0} role="img" aria-label={`${p.rotulo}: ${brl(p.faturamento)}`} style={{ outline: 'none' }}
                  onPointerEnter={() => setFoco(i)} onPointerLeave={() => setFoco(null)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} />
                {h > 0 && <path d={coluna(x, h)} fill="var(--accent)" fillOpacity={ativo ? 1 : atual ? 0.95 : 0.55} pointerEvents="none" />}
              </g> })}
          </svg>
          {/* valor da coluna do mês atual: texto HTML (tamanho fixo e legível no celular), alinhado à direita na última coluna para não cortar */}
          {(() => { const i = serie.findIndex(p => p.mes === destaque); if (i < 0 || serie[i].faturamento <= 0) return null
            const topPct = ((base - alt(serie[i].faturamento) - 22) / (base + 6)) * 100, ultimo = i === serie.length - 1
            return <div className="num" style={{ position: 'absolute', top: `${Math.max(0, topPct)}%`, left: ultimo ? 'auto' : `${((i + 0.5) / serie.length) * 100}%`, right: ultimo ? 0 : 'auto', transform: ultimo ? 'none' : 'translateX(-50%)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{brlInt(serie[i].faturamento)}</div> })()}
          {foco !== null && <div role="status" style={{ position: 'absolute', top: 0, left: `${((foco + 0.5) / serie.length) * 100}%`, transform: `translateX(${foco > serie.length / 2 ? '-100%' : '0'})`, background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '6px 10px', pointerEvents: 'none', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap', zIndex: 2 }}>
            <div className="num" style={{ fontWeight: 600 }}>{brl(serie[foco].faturamento)}</div><div className="muted" style={{ fontSize: 12 }}>{serie[foco].rotulo} · {serie[foco].pedidos} pedido(s) · {serie[foco].positivados} cliente(s)</div></div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${serie.length}, 1fr)`, marginTop: 4 }}>
          {serie.map(p => <span key={p.mes} style={{ textAlign: 'center', fontSize: 11, color: p.mes === destaque ? 'var(--ink)' : 'var(--muted)', fontWeight: p.mes === destaque ? 600 : 400 }}>{p.rotulo.slice(0, 3)}<span className="so-desktop">{p.rotulo.slice(3)}</span></span>)}
        </div>
      </div>}
  </div>
}

const Meter = ({ v, label }: { v: number; label: string }) => <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label} style={{ background: 'var(--surface-2)', borderRadius: 4, height: 8, minWidth: 64 }}><div style={{ width: `${Math.min(100, v * 100)}%`, height: 8, borderRadius: 4, background: 'var(--accent)' }} /></div>

export default function Painel() {
  const [mes, setMes] = useState('')
  const { dados: d, erro } = useApi<any>(`/painel${mes ? `?mes=${mes}` : ''}`)
  const comp = useApi<any>(!erro ? '/painel/comparativo' : null)
  if (ehBloqueioDePlano(erro)) return <><PageHead eyebrow="Gestão" title="Painel" /><Bloqueado mensagem={erro!} /></>
  if (!d) return <Carregando erro={erro} />
  const r = d.resumo, ls = d.leads, maxEtapa = Math.max(...ls.porEtapa.map((e: any) => e.n), 1)
  const Tile = ({ l, v, s }: { l: string; v: string; s?: string }) => <div className="kpi"><div className="l">{l}</div><div className="v num" style={{ fontSize: 30 }}>{v}</div>{s && <div className="s">{s}</div>}</div>
  const linhaComp = (nome: string, a: number, b: number, fmt: (n: number) => React.ReactNode, v?: number | null) => <tr key={nome}><td>{nome}</td><td className="r num">{fmt(a)}</td><td className="r num muted">{fmt(b)}</td><td className="r num">{v === undefined ? '' : sinal(v)}</td></tr>
  return <>
    <PageHead eyebrow="Gestão" title="Painel"><label className="row" style={{ gap: 6 }}><span className="muted">Mês</span><input type="month" value={mes || d.mes} max={new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7)} onChange={e => setMes(e.target.value)} style={{ width: 'auto' }} aria-label="Mês do painel" /></label></PageHead>
    <div className="stack">
      <div className="kpis">
        <Tile l={`Faturamento · ${d.rotulo}`} v={brlInt(r.faturamento)} s={`${r.pedidos} pedido(s)`} />
        <Tile l="Ticket médio" v={r.ticket ? brlInt(r.ticket) : '—'} />
        <Tile l="Positivação" v={pct(r.positivacao)} s={`${r.positivados} de ${r.carteira} clientes compraram`} />
        <Tile l="Carteira" v={String(r.carteira)} s={`${d.carteira.ativos} ativos · ${d.carteira.emRisco} em risco · ${d.carteira.inativos} inativos`} />
      </div>
      <ColunasMensais serie={d.serie} destaque={d.mes} />
      <div className="card" style={{ padding: 16 }}><div className="eyebrow">Vendedores · {d.rotulo}</div>
        <div className="scrollx"><table className="tbl"><thead><tr><th>Vendedor</th><th className="r so-desktop">Carteira</th><th>Positivação</th><th className="r">Faturamento</th><th className="r so-desktop">Ticket</th><th className="r">Contatos</th></tr></thead><tbody>
          {d.vendedores.map((v: any) => <tr key={v.id ?? 'sem'}><td>{v.nome}</td><td className="r num so-desktop">{v.carteira}</td>
            <td><div className="row" style={{ flexWrap: 'nowrap' }}><span className="num" style={{ minWidth: 38 }}>{pct(v.positivacao)}</span><span className="so-desktop"><Meter v={v.positivacao} label={`Positivação de ${v.nome}`} /></span></div></td>
            <td className="r num">{brlInt(v.faturamento)}</td><td className="r num so-desktop">{v.ticket ? brlInt(v.ticket) : '—'}</td>
            <td className="r num">{v.id ? <>{v.contatosFeitos}<span className="muted"> · {v.vencidos} na fila</span></> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>As vendas contam para o vendedor da carteira atual de cada cliente. “Na fila” = contatos vencidos hoje.</p></div>
      <div className="grid2">
        <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}><div className="eyebrow">Leads</div>
          {ls.porEtapa.map((e: any) => <div key={e.etapa} className="row" style={{ flexWrap: 'nowrap' }}><span style={{ minWidth: 120 }}>{ROTULO_ETAPA[e.etapa]}</span><div style={{ flex: 1 }}><Meter v={e.n / maxEtapa} label={ROTULO_ETAPA[e.etapa]} /></div><span className="num" style={{ minWidth: 28, textAlign: 'right' }}>{e.n}</span></div>)}
          <div className="muted" style={{ fontSize: 13 }}>No mês: {ls.criadosNoMes} novo(s) · {ls.convertidosNoMes} convertido(s) · {ls.perdidosNoMes} perdido(s) · conversão {pct(ls.taxaConversao)}{ls.porOrigem.length > 0 && ` · origem: ${ls.porOrigem.map((o: any) => `${ORIGEM_LEAD[o.origem] ?? o.origem} ${o.n}`).join(', ')}`}</div></div>
        <div className="card" style={{ padding: 16, display: 'grid', gap: 6, alignContent: 'start' }}><div className="eyebrow">Satisfação (NPS) · {d.nps.periodo}</div>
          {d.nps.respostas === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhuma resposta ainda.</p> : <>
            <div className="num" style={{ fontFamily: 'var(--f-display)', fontSize: 44, lineHeight: 1 }}>{d.nps.nps}</div>
            <div className="muted">{d.nps.respostas} resposta(s) · média {String(d.nps.media).replace('.', ',')} · promotores {d.nps.promotores} · neutros {d.nps.neutros} · detratores {d.nps.detratores}</div></>}
          {d.nps.detratoresAbertos > 0 && <div className="note">{d.nps.detratoresAbertos} cliente(s) insatisfeito(s) esperando contato.</div>}</div>
      </div>
      {comp.dados && <div className="card" style={{ padding: 16 }}><div className="eyebrow">Últimos {comp.dados.dias} dias × {comp.dados.dias} dias anteriores</div>
        <div className="scrollx"><table className="tbl compacta"><thead><tr><th></th><th className="r">Agora</th><th className="r">Antes</th><th className="r">Variação</th></tr></thead><tbody>
          {linhaComp('Faturamento', comp.dados.atual.faturamento, comp.dados.anterior.faturamento, n => <><span className="so-desktop">{brlInt(n)}</span><span className="so-mobile">{brlCompacto(n)}</span></>, comp.dados.variacao.faturamento)}
          {linhaComp('Pedidos', comp.dados.atual.pedidos, comp.dados.anterior.pedidos, String, comp.dados.variacao.pedidos)}
          {linhaComp('Compraram', comp.dados.atual.clientesPositivados, comp.dados.anterior.clientesPositivados, String, comp.dados.variacao.clientesPositivados)}
          {linhaComp('Positivação', comp.dados.atual.positivacao, comp.dados.anterior.positivacao, pct)}
          {linhaComp('Reativados', comp.dados.atual.reativados, comp.dados.anterior.reativados, String)}
          {linhaComp('Leads convertidos', comp.dados.atual.leadsConvertidos, comp.dados.anterior.leadsConvertidos, String)}
          {linhaComp('Contatos feitos', comp.dados.atual.contatosFeitos, comp.dados.anterior.contatosFeitos, String)}</tbody></table></div>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Reativado = voltou a comprar depois de mais de 180 dias parado. Compare “Agora” e “Antes” para medir o efeito do app.</p></div>}
    </div>
  </>
}
