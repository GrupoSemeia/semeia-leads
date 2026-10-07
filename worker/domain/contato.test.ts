import { describe, it, expect } from 'vitest'
import { efeitoDoContato, concluiTarefa, tarefasDoPedido, insatisfeito, notaValida, agendaCompleta, modeloSugerido, renderModelo, MODELOS_PADRAO, type TarefaAberta } from './contato'
import { PARAMS_PADRAO as P, DIA, type ContaAgenda } from './carteira'

const agora = new Date('2026-10-07T12:00:00Z')
const apos = (d: number) => new Date(agora.getTime() + d * DIA)
const atras = (d: number) => apos(-d)

describe('efeitoDoContato', () => {
  it('orçamento volta em 3 dias, não respondeu em 2, sem interesse em 30', () => {
    expect(efeitoDoContato('ORCAMENTO', agora)).toEqual({ ok: true, reagendarPara: apos(3) })
    expect(efeitoDoContato('NAO_RESPONDEU', agora)).toEqual({ ok: true, reagendarPara: apos(2) })
    expect(efeitoDoContato('SEM_INTERESSE', agora)).toEqual({ ok: true, reagendarPara: apos(30) })
  })
  it('vendeu (ou só uma anotação) volta à frequência normal', () => {
    expect(efeitoDoContato('VENDEU', agora)).toEqual({ ok: true, reagendarPara: null })
    expect(efeitoDoContato(null, agora)).toEqual({ ok: true, reagendarPara: null })
  })
  it('reagendar exige data e não aceita passado (hoje vale)', () => {
    expect(efeitoDoContato('REAGENDAR', agora)).toMatchObject({ ok: false })
    expect(efeitoDoContato('REAGENDAR', agora, new Date('invalid'))).toMatchObject({ ok: false })
    expect(efeitoDoContato('REAGENDAR', agora, atras(1))).toMatchObject({ ok: false })
    expect(efeitoDoContato('REAGENDAR', agora, new Date('2026-10-07T00:00:00Z'))).toMatchObject({ ok: true })
    expect(efeitoDoContato('REAGENDAR', agora, apos(10))).toEqual({ ok: true, reagendarPara: apos(10) })
  })
  it('só "não respondeu" mantém a tarefa aberta', () => { expect(concluiTarefa('NAO_RESPONDEU')).toBe(false); expect(concluiTarefa('VENDEU')).toBe(true); expect(concluiTarefa(null)).toBe(true) })
})

describe('tarefasDoPedido', () => {
  it('pedido recente gera D+1 e D+7', () => {
    const t = tarefasDoPedido(atras(0), agora)
    expect(t.map(x => x.tipo)).toEqual(['POS_VENDA_D1', 'NPS_D7']); expect(t[0].venceEm).toEqual(apos(1)); expect(t[1].venceEm).toEqual(apos(7))
  })
  it('pedido antigo (carga inicial) não gera nada', () => { expect(tarefasDoPedido(atras(11), agora)).toEqual([]); expect(tarefasDoPedido(atras(10), agora)).toHaveLength(2) })
})

describe('NPS', () => {
  it('nota ≤ 6 é insatisfação', () => { expect(insatisfeito(6)).toBe(true); expect(insatisfeito(7)).toBe(false); expect(insatisfeito(0)).toBe(true) })
  it('valida nota inteira 0–10', () => { expect([0, 10, 7].every(notaValida)).toBe(true); expect([-1, 11, 5.5, '7', null].some(notaValida)).toBe(false) })
})

const conta = (id: number, o: Partial<ContaAgenda> = {}): ContaAgenda => ({ id, curva: 'B', status: 'ATIVO', pedidos12m: 5, ultimoPedido: atras(10), intervaloMedioDias: 60, proximoContato: atras(1), ultimoContato: atras(14), score: 30, ...o })
const tarefa = (id: string, tipo: TarefaAberta['tipo'], c: ContaAgenda, o: Partial<TarefaAberta> = {}): TarefaAberta => ({ id, tipo, venceEm: atras(0), conta: c, ...o })

describe('agendaCompleta', () => {
  it('une contas vencidas e tarefas vencidas, um item por cliente', () => {
    const a = conta(1), b = conta(2, { proximoContato: apos(3) }), c = conta(3, { proximoContato: apos(5) })
    const r = agendaCompleta([a, b], [tarefa('t1', 'POS_VENDA_D1', a), tarefa('t2', 'NPS_D7', c)], agora, P)
    expect(r.map(i => i.id).sort()).toEqual([1, 3])   // conta 2 ainda não venceu
    expect(r.find(i => i.id === 1)).toMatchObject({ kind: 'tarefa', motivo: 'Pós-venda: confirmar recebimento', modelo: 'posvenda', score: 60 })
  })
  it('tarefa futura não aparece; tratar insatisfação vai no topo com a nota', () => {
    const a = conta(1), b = conta(2, { score: 90 })
    const r = agendaCompleta([a, b], [tarefa('t1', 'TRATAR_NPS', a, { nota: 3 }), tarefa('t2', 'NPS_D7', conta(9), { venceEm: apos(2) })], agora, P)
    expect(r[0]).toMatchObject({ id: 1, score: 100, motivo: 'Tratar insatisfação (nota 3)', modelo: 'tratar_nps' }); expect(r.some(i => i.id === 9)).toBe(false)
  })
  it('com duas tarefas do mesmo cliente, vale a mais prioritária', () => {
    const a = conta(1)
    const r = agendaCompleta([], [tarefa('t1', 'NPS_D7', a), tarefa('t2', 'POS_VENDA_D1', a), tarefa('t3', 'TRATAR_NPS', a)], agora, P)
    expect(r).toHaveLength(1); expect(r[0].tarefa?.tipo).toBe('TRATAR_NPS')
  })
  it('respeita o tamanho da agenda e o score da conta quando é maior que o da tarefa', () => {
    const contas = Array.from({ length: 5 }, (_, i) => conta(i + 1, { score: 10 + i }))
    expect(agendaCompleta(contas, [], agora, { ...P, agendaSize: 3 }).map(i => i.id)).toEqual([5, 4, 3])
    expect(agendaCompleta([], [tarefa('t', 'NPS_D7', conta(1, { score: 80 }))], agora, P)[0].score).toBe(80)
  })
})

describe('modeloSugerido', () => {
  it('escolhe pelo perfil do cliente', () => {
    expect(modeloSugerido(conta(1, { status: 'PROSPECT', ultimoPedido: null, pedidos12m: 0 }), agora, P)).toBe('saudacao')
    expect(modeloSugerido(conta(1, { ultimoPedido: atras(28), intervaloMedioDias: 30 }), agora, P)).toBe('recompra')
    expect(modeloSugerido(conta(1, { status: 'INATIVO', ultimoPedido: atras(300) }), agora, P)).toBe('reativacao')
    expect(modeloSugerido(conta(1), agora, P)).toBe('oferta')
  })
})

describe('renderModelo', () => {
  it('troca variáveis e some com as vazias', () => {
    expect(renderModelo('Olá, {{contato}}! Aqui é {{ vendedor }}.', { contato: 'Loja X', vendedor: 'Ana' })).toBe('Olá, Loja X! Aqui é Ana.')
    expect(renderModelo('Repor {{produto}} .', {})).toBe('Repor.')
    expect(renderModelo('Olá,  {{x}}  mundo', { x: 'a' })).toBe('Olá, a mundo')
  })
  it('todos os modelos padrão renderizam sem sobrar chaves', () => {
    for (const m of MODELOS_PADRAO) expect(renderModelo(m.body, { contato: 'A', vendedor: 'B', empresa: 'C', produto: 'D', link: 'E' })).not.toContain('{{')
  })
})
