import { describe, it, expect } from 'vitest'
import { TEMAS, temaDaRota } from './pages/Ajuda'

describe('ajuda', () => {
  it('cada assunto tem id único, resumo e passos', () => {
    expect(new Set(TEMAS.map(t => t.id)).size).toBe(TEMAS.length)
    for (const t of TEMAS) { expect(t.resumo.length).toBeGreaterThan(20); expect(t.passos.length).toBeGreaterThan(0) }
  })
  it('cada tela do menu aponta para o seu assunto', () => {
    const rotas: Record<string, string> = { '/': 'hoje', '/carteira': 'carteira', '/carteira/1000': 'cliente', '/leads': 'leads', '/catalogo': 'catalogo', '/pre-pedidos': 'pre-pedidos', '/pre-pedidos/abc': 'pre-pedidos', '/painel': 'painel', '/configuracoes': 'configuracoes', '/assinatura': 'plano', '/admin': 'plataforma', '/qualquer': 'comecar' }
    for (const [r, id] of Object.entries(rotas)) { expect(temaDaRota(r)).toBe(id); expect(TEMAS.some(t => t.id === id)).toBe(true) }
  })
})
