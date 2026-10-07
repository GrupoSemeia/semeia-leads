import { describe, it, expect } from 'vitest'
import { mesValido, mesDe, janelaDoMes, mesesAte, rotuloMes, taxa, variacaoPct, calcularNps, janelasComparativo, foiReativado, cumprimentoAgenda } from './painel'
import { DIA } from './carteira'

describe('meses (fuso de Brasília)', () => {
  it('valida AAAA-MM', () => { expect(mesValido('2026-10')).toBe(true); for (const x of ['2026-13', '2026-00', '26-10', '2026-1', '2026-10-01', null, 5]) expect(mesValido(x)).toBe(false) })
  it('o mês local começa às 03:00 UTC', () => { expect(janelaDoMes('2026-10')).toEqual({ de: '2026-10-01 03:00:00', ate: '2026-11-01 03:00:00' }); expect(janelaDoMes('2026-12').ate).toBe('2027-01-01 03:00:00') })
  it('virada de mês: 31/10 23:30 em Brasília ainda é outubro', () => { expect(mesDe(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10'); expect(mesDe(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11') })
  it('lista os últimos n meses atravessando o ano', () => { expect(mesesAte('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']); expect(mesesAte('2026-10', 1)).toEqual(['2026-10']) })
  it('rótulo curto', () => { expect(rotuloMes('2026-03')).toBe('mar/26') })
})

describe('taxa e variação', () => {
  it('sem base não divide por zero', () => { expect(taxa(5, 0)).toBe(0); expect(taxa(1, 4)).toBe(0.25); expect(variacaoPct(10, 0)).toBeNull() })
  it('variação percentual com uma casa', () => { expect(variacaoPct(150, 100)).toBe(50); expect(variacaoPct(75, 100)).toBe(-25); expect(variacaoPct(100, 300)).toBe(-66.7) })
})

describe('calcularNps', () => {
  it('promotores − detratores', () => {
    const r = calcularNps([10, 9, 9, 8, 7, 6, 3, 0]); expect(r).toMatchObject({ respostas: 8, promotores: 3, neutros: 2, detratores: 3, nps: 0 })
    expect(calcularNps([10, 10, 9]).nps).toBe(100); expect(calcularNps([0, 5, 6]).nps).toBe(-100); expect(calcularNps([10, 7]).media).toBe(8.5)
  })
  it('sem respostas válidas não há nota; lixo é ignorado', () => { expect(calcularNps([]).nps).toBeNull(); expect(calcularNps([11, -1, 5.5, NaN]).respostas).toBe(0) })
})

describe('comparativo e reativação', () => {
  const agora = new Date('2026-10-07T12:00:00Z')
  it('duas janelas consecutivas de 60 dias', () => {
    const j = janelasComparativo(agora); expect(j.atual.ate).toBe('2026-10-07 12:00:00'); expect(j.atual.de).toBe(j.anterior.ate)
    expect(new Date(j.atual.de.replace(' ', 'T') + 'Z').getTime() - new Date(j.anterior.de.replace(' ', 'T') + 'Z').getTime()).toBe(60 * DIA)
  })
  it('reativado = voltou após mais de 180 dias parado', () => {
    const f = new Date('2026-09-01T00:00:00Z')
    expect(foiReativado(new Date(f.getTime() - 181 * DIA), f)).toBe(true); expect(foiReativado(new Date(f.getTime() - 180 * DIA), f)).toBe(false); expect(foiReativado(null, f)).toBe(false)
  })
  it('cumprimento da agenda', () => { expect(cumprimentoAgenda(8, 2)).toBe(0.8); expect(cumprimentoAgenda(0, 0)).toBe(0); expect(cumprimentoAgenda(0, 5)).toBe(0) })
})
