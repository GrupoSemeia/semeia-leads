import { describe, it, expect } from 'vitest'
import { receitaMensal, estenderTeste, ultimoLoginDe, resumoPlataforma, type LinhaEmpresa } from './plataforma'
import { DIA } from './carteira'

describe('receitaMensal', () => {
  it('soma ativas e atrasadas; anual conta 1/12; pendente e cancelada não contam', () => {
    expect(receitaMensal([{ status: 'ativa', cycle: 'MONTHLY', value: 44990 }, { status: 'atrasada', cycle: 'MONTHLY', value: 24990 }, { status: 'ativa', cycle: 'YEARLY', value: 799900 }, { status: 'pendente', cycle: 'MONTHLY', value: 99999 }, { status: 'cancelada', cycle: 'MONTHLY', value: 99999 }]))
      .toBe(Math.round(44990 + 24990 + 799900 / 12))
    expect(receitaMensal([])).toBe(0)
  })
})
describe('estenderTeste', () => {
  const agora = new Date('2026-10-07T12:00:00Z')
  it('soma ao que sobrou do teste', () => { const r = estenderTeste('2026-10-10T12:00:00.000Z', 7, agora); expect(r).toEqual({ ok: true, novo: '2026-10-17T12:00:00.000Z' }) })
  it('teste já acabado ou sem data: conta a partir de agora', () => { expect(estenderTeste('2026-09-01T00:00:00.000Z', 14, agora)).toEqual({ ok: true, novo: new Date(agora.getTime() + 14 * DIA).toISOString() }); expect(estenderTeste(null, 3, agora)).toMatchObject({ ok: true }) })
  it('só de 1 a 90 dias inteiros', () => { for (const d of [0, -1, 91, 1.5, 'x', null, undefined]) expect(estenderTeste(null, d, agora)).toMatchObject({ ok: false }) })
})
describe('ultimoLoginDe', () => { it('expiração menos 30 dias', () => { expect(ultimoLoginDe('2026-11-06T12:00:00.000Z')).toBe('2026-10-07T12:00:00.000Z'); expect(ultimoLoginDe(null)).toBeNull() }) })
describe('resumoPlataforma', () => {
  const l = (o: Partial<LinhaEmpresa>): LinhaEmpresa => ({ situacao: 'teste', acessoMotivo: 'ok', testeAcabaEmDias: 10, assinaturaStatus: null, ...o })
  it('conta por situação e destaca teste acabando e atraso', () => {
    const r = resumoPlataforma([l({}), l({ testeAcabaEmDias: 2 }), l({ situacao: 'ativa', assinaturaStatus: 'ativa' }), l({ situacao: 'ativa', assinaturaStatus: 'atrasada' }), l({ situacao: 'suspensa' }), l({ situacao: 'bloqueada' })], 12345)
    expect(r).toEqual({ empresas: 6, emTeste: 2, ativas: 2, suspensas: 1, bloqueadas: 1, testeAcabando: 1, atrasadas: 1, receitaMensal: 12345 })
  })
})
