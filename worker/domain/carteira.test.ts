import { describe, it, expect } from 'vitest'
import { PARAMS_PADRAO as P, mergeParams, statusDe, curvaABC, frequenciaDias, proximoContato, scorePrioridade, recompraPrevista, motivoDe, montarAgenda, positivacao, DIA, type MetricasEntrada, type ContaAgenda } from './carteira'

const agora = new Date('2026-10-07T12:00:00Z')
const atras = (d: number) => new Date(agora.getTime() - d * DIA)

describe('statusDe', () => {
  it('fronteiras 90 e 180 dias', () => {
    expect(statusDe(null, agora, P)).toBe('PROSPECT')
    expect(statusDe(atras(90), agora, P)).toBe('ATIVO'); expect(statusDe(atras(91), agora, P)).toBe('EM_RISCO')
    expect(statusDe(atras(180), agora, P)).toBe('EM_RISCO'); expect(statusDe(atras(181), agora, P)).toBe('INATIVO')
  })
})

describe('curvaABC', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, faturamento: (n - i) * 1000 }))
  it('20% A, 30% B, resto C (10 clientes → 2/3/5)', () => {
    const c = curvaABC(mk(10), P), conta = (k: string) => [...c.values()].filter(v => v === k).length
    expect([conta('A'), conta('B'), conta('C')]).toEqual([2, 3, 5]); expect(c.get(1)).toBe('A'); expect(c.get(10)).toBe('C')
  })
  it('quem não faturou fica sem curva; um único cliente é A', () => {
    const c = curvaABC([{ id: 1, faturamento: 500 }, { id: 2, faturamento: 0 }], P)
    expect(c.get(1)).toBe('A'); expect(c.has(2)).toBe(false)
  })
  it('empate desempata pelo id (estável)', () => {
    const c = curvaABC([{ id: 2, faturamento: 100 }, { id: 1, faturamento: 100 }], P)
    expect(c.get(1)).toBe('A'); expect(c.get(2)).toBe('C')
  })
  it('sem clientes → vazio', () => { expect(curvaABC([], P).size).toBe(0) })
})

describe('frequência e próximo contato', () => {
  it('curva define a frequência; em risco usa o menor valor', () => {
    expect(frequenciaDias('A', 'ATIVO', P)).toBe(7); expect(frequenciaDias('C', 'ATIVO', P)).toBe(30)
    expect(frequenciaDias('C', 'EM_RISCO', P)).toBe(15); expect(frequenciaDias('A', 'EM_RISCO', P)).toBe(7)
    expect(frequenciaDias('C', 'INATIVO', P)).toBe(30); expect(frequenciaDias(null, 'PROSPECT', P)).toBe(30)
  })
  it('nunca contatado vence agora; reagendamento manual vale mais', () => {
    expect(proximoContato(null, 7, agora)).toEqual(agora)
    expect(proximoContato(atras(3), 7, agora)).toEqual(new Date(agora.getTime() + 4 * DIA))
    const manual = new Date('2026-11-01T00:00:00Z'); expect(proximoContato(atras(30), 7, agora, manual)).toEqual(manual)
  })
})

const base: MetricasEntrada = { curva: 'A', status: 'ATIVO', pedidos12m: 5, ultimoPedido: atras(10), intervaloMedioDias: 30, proximoContato: agora }
describe('score', () => {
  it('curva A, contato em dia, sem recompra = 40', () => { expect(scorePrioridade(base, agora, P)).toBe(40) })
  it('atraso soma 2 por dia até 25', () => {
    expect(scorePrioridade({ ...base, proximoContato: atras(5) }, agora, P)).toBe(50)
    expect(scorePrioridade({ ...base, proximoContato: atras(40) }, agora, P)).toBe(65)
  })
  it('recompra prevista (>=3 pedidos e >=0,9 do intervalo) soma 20', () => {
    const m = { ...base, ultimoPedido: atras(27) }
    expect(recompraPrevista(m, agora, P)).toBe(true); expect(scorePrioridade(m, agora, P)).toBe(60)
    expect(recompraPrevista({ ...m, pedidos12m: 2 }, agora, P)).toBe(false); expect(recompraPrevista({ ...m, ultimoPedido: atras(26) }, agora, P)).toBe(false)
  })
  it('risco soma 15 (em risco) ou 8 (inativo) e o teto é 100', () => {
    expect(scorePrioridade({ ...base, curva: 'C', status: 'EM_RISCO', ultimoPedido: atras(100), intervaloMedioDias: null }, agora, P)).toBe(25)
    expect(scorePrioridade({ ...base, curva: 'C', status: 'INATIVO', ultimoPedido: atras(300), intervaloMedioDias: null }, agora, P)).toBe(18)
    expect(scorePrioridade({ ...base, status: 'EM_RISCO', proximoContato: atras(90), ultimoPedido: atras(100), intervaloMedioDias: 50 }, agora, P)).toBe(100)
  })
  it('prospect sem curva = 0 de peso', () => { expect(scorePrioridade({ ...base, curva: null, status: 'PROSPECT', ultimoPedido: null, pedidos12m: 0 }, agora, P)).toBe(0) })
})

describe('motivo e agenda', () => {
  const conta = (id: number, o: Partial<ContaAgenda> = {}): ContaAgenda => ({ ...base, id, ultimoContato: atras(9), score: scorePrioridade(base, agora, P), ...o })
  it('motivos em português', () => {
    expect(motivoDe(conta(1), agora, P)).toBe('Curva A — 9 dias sem contato')
    expect(motivoDe(conta(1, { status: 'EM_RISCO', ultimoPedido: atras(112) }), agora, P)).toBe('Em risco — 112 dias sem comprar')
    expect(motivoDe(conta(1, { ultimoPedido: atras(28) }), agora, P)).toBe('Recompra prevista')
    expect(motivoDe(conta(1, { ultimoContato: null }), agora, P)).toBe('Curva A — nunca contatado')
  })
  it('agenda: só vencidos, maior score primeiro, limite do tamanho', () => {
    const futuro = new Date(agora.getTime() + 2 * DIA)
    const contas = [conta(1, { score: 10 }), conta(2, { score: 90 }), conta(3, { score: 50, proximoContato: futuro }), conta(4, { score: 90, proximoContato: atras(2) })]
    expect(montarAgenda(contas, agora, P).map(c => c.id)).toEqual([4, 2, 1])
    expect(montarAgenda(contas, agora, { ...P, agendaSize: 2 })).toHaveLength(2)
  })
})

describe('positivação e parâmetros', () => {
  it('conta só a carteira (sem prospects)', () => {
    const r = positivacao([{ id: 1, status: 'ATIVO' }, { id: 2, status: 'INATIVO' }, { id: 3, status: 'PROSPECT' }, { id: 4, status: 'EM_RISCO' }], new Set([1, 3]))
    expect(r).toEqual({ total: 3, positivados: 1, taxa: 1 / 3 })
  })
  it('carteira vazia não divide por zero', () => { expect(positivacao([], new Set()).taxa).toBe(0) })
  it('mergeParams ignora lixo e mantém coerência', () => {
    expect(mergeParams(null)).toEqual(P)
    const p = mergeParams({ ativoDias: 60, emRiscoDias: 10, agendaSize: -5, freq: { A: 'x', B: 3 } })
    expect(p.ativoDias).toBe(60); expect(p.emRiscoDias).toBeGreaterThan(60); expect(p.agendaSize).toBe(25); expect(p.freq.A).toBe(7); expect(p.freq.B).toBe(3)
  })
})
