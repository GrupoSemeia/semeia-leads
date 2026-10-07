import { describe, it, expect } from 'vitest'
import { esc, assuntoSeguro, emailValido, emailRecuperacaoSenha, avisoDetrator, avisoLeadSite, avisoPagamentoAtrasado, avisoErroTroca, avisoSyncFalhou, avisoTesteAcabando } from './emails'

describe('segurança dos textos', () => {
  it('escapa HTML', () => { expect(esc(`<script>alert("x")</script> & 'a'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;a&#39;') })
  it('assunto sem quebra de linha (injeção de cabeçalho) e com limite', () => { expect(assuntoSeguro('Oi\r\nBcc: x@y.com')).toBe('Oi Bcc: x@y.com'); expect(assuntoSeguro('a'.repeat(300)).length).toBe(120) })
  it('valida e-mail e recusa lista, aspas e quebra de linha', () => { expect(emailValido('ana@empresa.com.br')).toBe(true); for (const x of ['a@b', 'a b@c.com', 'a@b.com,c@d.com', '"x"@a.com', 'a@b.com\nBcc: z@z.com', '', null, 5]) expect(emailValido(x)).toBe(false) })
  it('empresa maliciosa não vira HTML nem cabeçalho', () => {
    const m = avisoLeadSite({ empresa: '<img src=x onerror=alert(1)>\r\nBcc: v@v.com', contato: '<b>x</b>', link: 'https://app.test/leads' })
    expect(m.assunto).not.toMatch(/[\r\n]/); expect(m.html).not.toContain('<img'); expect(m.html).not.toContain('<b>x</b>'); expect(m.html).toContain('&lt;img')
  })
  it('link perigoso é ignorado', () => { for (const l of ['javascript:alert(1)', 'data:text/html,x', 'https://a.com/x"onmouseover="y']) { const m = avisoTesteAcabando({ dias: 2, link: l }); expect(m.html).not.toContain('<a '); expect(m.texto).not.toContain(l) } })
})

describe('conteúdo', () => {
  it('recuperação de senha traz o link, a validade e o aviso de ignorar', () => {
    const m = emailRecuperacaoSenha({ nome: 'Ana', link: 'https://app.test/redefinir/abc', validadeMin: 60 })
    expect(m.texto).toContain('https://app.test/redefinir/abc'); expect(m.texto).toContain('60 minutos'); expect(m.texto).toContain('ignore este e-mail'); expect(m.html).toContain('href="https://app.test/redefinir/abc"'); expect(m.assunto).toContain('senha')
  })
  it('detrator mostra a nota e corta comentário longo', () => { const m = avisoDetrator({ cliente: 'Loja X', nota: 3, comentario: 'x'.repeat(500) }); expect(m.assunto).toContain('nota 3'); expect(m.texto.length).toBeLessThan(700) })
  it('lead sem vendedor pede distribuição; com vendedor diz quem', () => { expect(avisoLeadSite({ empresa: 'A', contato: 'B' }).texto).toContain('distribua'); expect(avisoLeadSite({ empresa: 'A', contato: 'B', vendedor: 'Ana' }).texto).toContain('carteira de Ana') })
  it('pagamento, erro de troca, sync e teste', () => {
    expect(avisoPagamentoAtrasado({ valor: 'R$ 449,90', vencimento: '07/10/2026' }).texto).toContain('R$ 449,90'); expect(avisoErroTroca({ cliente: 'Loja', para: 'Ana', erro: 'timeout' }).texto).toContain('timeout')
    expect(avisoSyncFalhou({ job: 'pedidos', erro: 'HTTP 500' }).assunto).toContain('falhou'); expect(avisoTesteAcabando({ dias: 0 }).assunto).toContain('hoje'); expect(avisoTesteAcabando({ dias: 3 }).assunto).toContain('3 dia')
  })
})
