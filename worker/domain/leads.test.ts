import { describe, it, expect } from 'vitest'
import { cnpjValido, formatarCnpj, normalizarWhatsapp, validarTransicao, proximoFollowup, proximoDoRodizio, parseBrasilApi, montarCorpoPessoa, mesclarConfigPessoa, CONFIG_PESSOA_VAZIA, estaAberto, ehEtapa } from './leads'
import { DIA } from './carteira'

describe('cnpjValido', () => {
  it('aceita CNPJ real com ou sem máscara', () => { expect(cnpjValido('11.222.333/0001-81')).toBe(true); expect(cnpjValido('11222333000181')).toBe(true); expect(cnpjValido('00.000.000/0001-91')).toBe(true) })
  it('recusa dígito verificador errado, tamanho errado e sequências', () => {
    expect(cnpjValido('11222333000182')).toBe(false); expect(cnpjValido('1122233300018')).toBe(false); expect(cnpjValido('')).toBe(false); expect(cnpjValido(null)).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false); expect(cnpjValido('11111111111111')).toBe(false)
  })
  it('formata', () => { expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81') })
})

describe('normalizarWhatsapp', () => {
  it('só dígitos, de 10 a 13', () => { expect(normalizarWhatsapp('(41) 99999-0000')).toBe('41999990000'); expect(normalizarWhatsapp('+55 41 99999-0000')).toBe('5541999990000') })
  it('recusa curto, longo e lixo', () => { expect(normalizarWhatsapp('9999-0000')).toBeNull(); expect(normalizarWhatsapp('1234567890123456')).toBeNull(); expect(normalizarWhatsapp('abc')).toBeNull(); expect(normalizarWhatsapp(null)).toBeNull() })
})

describe('validarTransicao', () => {
  it('movimentos normais entre etapas abertas', () => { expect(validarTransicao('NOVO', 'CONTATADO')).toEqual({ ok: true }); expect(validarTransicao('NEGOCIANDO', 'NOVO')).toEqual({ ok: true }) })
  it('convertido só sozinho; convertido não sai', () => {
    expect(validarTransicao('NEGOCIANDO', 'CONVERTIDO')).toMatchObject({ ok: false }); expect(validarTransicao('CONVERTIDO', 'NOVO')).toMatchObject({ ok: false }); expect(validarTransicao('CONVERTIDO', 'PERDIDO', 'x')).toMatchObject({ ok: false })
  })
  it('perdido exige motivo', () => { expect(validarTransicao('NOVO', 'PERDIDO')).toMatchObject({ ok: false }); expect(validarTransicao('NOVO', 'PERDIDO', ' ab ')).toMatchObject({ ok: false }); expect(validarTransicao('NOVO', 'PERDIDO', 'preço alto')).toEqual({ ok: true }) })
  it('perdido só reabre como novo', () => { expect(validarTransicao('PERDIDO', 'NOVO')).toEqual({ ok: true }); expect(validarTransicao('PERDIDO', 'NEGOCIANDO')).toMatchObject({ ok: false }) })
  it('etapas', () => { expect(estaAberto('NOVO')).toBe(true); expect(estaAberto('PERDIDO')).toBe(false); expect(ehEtapa('X')).toBe(false) })
})

describe('proximoFollowup', () => {
  const agora = new Date('2026-10-07T12:00:00Z')
  it('novo vence na hora; depois 2–3 dias; fechados nunca', () => {
    expect(proximoFollowup('NOVO', agora)).toEqual(agora); expect(proximoFollowup('CONTATADO', agora)).toEqual(new Date(agora.getTime() + 2 * DIA))
    expect(proximoFollowup('CATALOGO_ENVIADO', agora)).toEqual(new Date(agora.getTime() + 3 * DIA)); expect(proximoFollowup('NEGOCIANDO', agora)).toEqual(new Date(agora.getTime() + 2 * DIA))
    expect(proximoFollowup('PERDIDO', agora)).toBeNull(); expect(proximoFollowup('CONVERTIDO', agora)).toBeNull()
  })
})

describe('proximoDoRodizio', () => {
  const v = ['a', 'b', 'c']
  it('anda em círculo', () => { expect(proximoDoRodizio(v, 'a')).toBe('b'); expect(proximoDoRodizio(v, 'c')).toBe('a') })
  it('sem histórico ou com último que saiu, começa do primeiro', () => { expect(proximoDoRodizio(v, null)).toBe('a'); expect(proximoDoRodizio(v, 'zzz')).toBe('a') })
  it('sem vendedores, sem dono', () => { expect(proximoDoRodizio([], 'a')).toBeNull(); expect(proximoDoRodizio(['x'], 'x')).toBe('x') })
})

describe('parseBrasilApi', () => {
  it('lê a resposta da BrasilAPI', () => {
    expect(parseBrasilApi({ razao_social: ' Loja X LTDA ', nome_fantasia: 'Loja X', municipio: 'CURITIBA', uf: 'PR', cnae_fiscal: 4751201, descricao_situacao_cadastral: 'ATIVA', ddd_telefone_1: '4130000000' }))
      .toEqual({ razaoSocial: 'Loja X LTDA', fantasia: 'Loja X', cidade: 'CURITIBA', uf: 'PR', cnae: '4751201', situacao: 'ATIVA', telefone: '4130000000' })
  })
  it('resposta vazia ou de erro vira null', () => { expect(parseBrasilApi(null)).toBeNull(); expect(parseBrasilApi({ message: 'CNPJ não encontrado' })).toBeNull(); expect(parseBrasilApi('x')).toBeNull() })
})

describe('montarCorpoPessoa', () => {
  const cfg = mesclarConfigPessoa({ tipoClienteId: '7' }), lead = { cnpj: '11222333000181', razaoSocial: 'Loja X LTDA', fantasia: 'Loja X', contato: 'Ana', whatsapp: '41999990000' }
  it('monta o corpo do PUT /pessoa', () => {
    const r = montarCorpoPessoa(lead, cfg); expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.corpo).toMatchObject({ Nome: 'Loja X', RazaoSocial: 'Loja X LTDA', Cnpj: '11222333000181', TipoPessoa: 'J', TipoCliente: [{ Id: 7, Nome: 'Prospect' }] }); expect(r.corpo.Observacao).toContain('Ana')
  })
  it('recusa sem configuração, sem razão social ou com CNPJ inválido', () => {
    expect(montarCorpoPessoa(lead, CONFIG_PESSOA_VAZIA)).toMatchObject({ ok: false }); expect(montarCorpoPessoa({ ...lead, razaoSocial: ' ' }, cfg)).toMatchObject({ ok: false }); expect(montarCorpoPessoa({ ...lead, cnpj: '123' }, cfg)).toMatchObject({ ok: false })
  })
  it('config ignora lixo', () => { expect(mesclarConfigPessoa({ tipoClienteId: 'x' })).toEqual(CONFIG_PESSOA_VAZIA); expect(mesclarConfigPessoa({ tipoClienteId: -1, tipoClienteNome: ' Cliente novo ' })).toEqual({ tipoClienteId: null, tipoClienteNome: 'Cliente novo', campoVendedor: '' }) })
})
