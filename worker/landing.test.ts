import { describe, it, expect } from 'vitest'
import html from '../public/inicio.html?raw'
import { PLANOS, VENDEDOR_EXTRA, MESES_PAGOS_NO_ANO } from './plans'

/** A página de apresentação não pode divergir dos preços e limites reais (worker/plans.ts). */
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

describe('página de apresentação (public/inicio.html)', () => {
  it.each(Object.entries(PLANOS))('mostra o preço e o nome do plano %s', (_, p) => { expect(html).toContain(p.nome); expect(html).toContain(brl(p.preco)) })
  it('mostra os limites de vendedores e clientes de cada plano', () => {
    expect(html).toContain(`Até ${PLANOS.essencial.vendedores} vendedores e ${PLANOS.essencial.clientes} clientes`)
    expect(html).toContain(`Até ${PLANOS.profissional.vendedores} vendedores e ${String(PLANOS.profissional.clientes!).replace(/(\d)(\d{3})$/, '$1.$2')} clientes`)
    expect(html).toContain(`Até ${PLANOS.distribuidor.vendedores} vendedores e clientes sem limite`)
  })
  it('mostra o vendedor adicional e a regra do anual', () => { expect(html).toContain(brl(VENDEDOR_EXTRA)); expect(html).toContain(`pague ${MESES_PAGOS_NO_ANO} meses e leve 12`) })
  it('o plano com funil de leads/pré-pedido/painel está no plano certo', () => {
    const bloco = (nome: string) => { const i = html.indexOf(`<h3>${nome}</h3>`); return html.slice(i, html.indexOf('</div>', html.indexOf('</ul>', i))) }
    expect(bloco('Essencial')).not.toMatch(/pré-pedido|funil|painel/i); expect(bloco('Profissional')).toMatch(/Pré-pedido e funil de leads/); expect(bloco('Distribuidor')).toMatch(/Painel do gestor/)
  })
  it('leva ao cadastro e ao login do app', () => { expect(html).toContain('href="/entrar?criar=1"'); expect(html).toContain('href="/entrar"') })
  it('tem título, descrição e rodapé da marca; sem texto de preenchimento esquecido', () => {
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/); expect(html).toMatch(/<meta name="description" content="[^"]{60,}"/); expect(html).toContain('Um produto'); expect(html).toContain('Grupo Semeia Digital')
    for (const lixo of ['lorem', 'ipsum', '{{', 'undefined']) expect(html.toLowerCase()).not.toContain(lixo)
    expect(html).not.toMatch(/\b(TODO|FIXME|XXX)\b/)   // marcadores de pendência esquecidos (em maiúsculas; "todos" em português é palavra normal)
  })
  it('não promete o que o app não faz (envio automático de WhatsApp, IA)', () => { for (const x of [/envio autom[áa]tico/i, /rob[ôo] de atendimento/i, /intelig[êe]ncia artificial/i]) expect(html).not.toMatch(x) })
  it('tags HTML principais balanceadas', () => { for (const t of ['section', 'details', 'header', 'footer', 'main']) expect((html.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length).toBe((html.match(new RegExp(`</${t}>`, 'g')) ?? []).length) })
})
