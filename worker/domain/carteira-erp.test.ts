import { describe, it, expect } from 'vitest'
import { donoDaConta, escolherDonoLead, donoNaConversao, montarAtualizacaoVendedor } from './carteira-erp'
import { mesclarConfigPessoa, montarCorpoPessoa, campoValido } from './leads'

describe('donoDaConta', () => {
  const base = { donoAtual: 'ana', donoErp: 'beto', trocaLocalPendente: false, erpManda: false }
  it('sem campo do ERP: dono definido nunca muda sozinho', () => { expect(donoDaConta(base)).toEqual({ dono: 'ana', mudou: false, porErp: false }) })
  it('sem campo do ERP: conta sem dono recebe o vendedor do último pedido', () => { expect(donoDaConta({ ...base, donoAtual: null })).toEqual({ dono: 'beto', mudou: true, porErp: false }) })
  it('com campo do ERP: o ERP manda e o app acompanha', () => { expect(donoDaConta({ ...base, erpManda: true })).toEqual({ dono: 'beto', mudou: true, porErp: true }) })
  it('com campo do ERP, igual ao app: nada muda', () => { expect(donoDaConta({ ...base, erpManda: true, donoErp: 'ana' })).toEqual({ dono: 'ana', mudou: false, porErp: false }) })
  it('com campo do ERP mas sem vendedor lá (ou não mapeado): mantém o do app', () => {
    expect(donoDaConta({ ...base, erpManda: true, donoErp: null })).toEqual({ dono: 'ana', mudou: false, porErp: false })
    expect(donoDaConta({ ...base, erpManda: true, donoErp: null, donoAtual: null })).toEqual({ dono: null, mudou: false, porErp: false })
  })
  it('troca local pendente protege a escolha do admin contra o ERP antigo', () => { expect(donoDaConta({ ...base, erpManda: true, trocaLocalPendente: true })).toEqual({ dono: 'ana', mudou: false, porErp: false }) })
})

describe('escolherDonoLead / donoNaConversao', () => {
  it('a carteira do CNPJ vence; depois o admin; depois quem cadastrou; senão rodízio', () => {
    expect(escolherDonoLead({ donoCarteira: 'c', escolhidoPeloAdmin: 'a', vendedorQueCadastrou: 'v' })).toEqual({ dono: 'c', precisaRodizio: false })
    expect(escolherDonoLead({ donoCarteira: null, escolhidoPeloAdmin: 'a', vendedorQueCadastrou: 'v' })).toEqual({ dono: 'a', precisaRodizio: false })
    expect(escolherDonoLead({ donoCarteira: null, escolhidoPeloAdmin: null, vendedorQueCadastrou: 'v' })).toEqual({ dono: 'v', precisaRodizio: false })
    expect(escolherDonoLead({ donoCarteira: null, escolhidoPeloAdmin: null, vendedorQueCadastrou: null })).toEqual({ dono: null, precisaRodizio: true })
  })
  it('na conversão o ERP vence; o lead só preenche conta sem dono', () => { expect(donoNaConversao('erp', 'lead')).toBe('erp'); expect(donoNaConversao(null, 'lead')).toBe('lead'); expect(donoNaConversao(null, null)).toBeNull() })
})

describe('montarAtualizacaoVendedor', () => {
  const atual = { Id: 10, Nome: 'Loja', Cnpj: '1', UsuarioTecnicoId: 3, CadastroGeralEndereco: [{ Municipio: 'X' }] }
  it('devolve o cadastro atual com só o campo trocado (sem mexer no original)', () => {
    const r = montarAtualizacaoVendedor(atual, 'UsuarioTecnicoId', 7); expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.corpo).toEqual({ ...atual, UsuarioTecnicoId: 7 }); expect(atual.UsuarioTecnicoId).toBe(3)
  })
  it('recusa campo vazio/inválido, vendedor sem ligação e resposta vazia', () => {
    expect(montarAtualizacaoVendedor(atual, '', 7)).toMatchObject({ ok: false }); expect(montarAtualizacaoVendedor(atual, 'a b; drop', 7)).toMatchObject({ ok: false })
    expect(montarAtualizacaoVendedor(atual, 'Campo', null)).toMatchObject({ ok: false }); expect(montarAtualizacaoVendedor(atual, 'Campo', 0)).toMatchObject({ ok: false })
    for (const x of [null, [], {}, 'x']) expect(montarAtualizacaoVendedor(x, 'Campo', 7)).toMatchObject({ ok: false })
  })
})

describe('config do campo do vendedor', () => {
  it('só aceita nome de campo seguro; padrão desligado', () => {
    expect(mesclarConfigPessoa(null).campoVendedor).toBe(''); expect(mesclarConfigPessoa({ campoVendedor: ' VendedorId ' }).campoVendedor).toBe('VendedorId')
    for (const c of ['1abc', 'a-b', 'a.b', 'a b', '$x', 'x'.repeat(50)]) expect(mesclarConfigPessoa({ campoVendedor: c }).campoVendedor).toBe('')
    expect(campoValido('UsuarioTecnicoId')).toBe(true)
  })
  it('cadastro de lead já leva o vendedor quando o campo está configurado', () => {
    const lead = { cnpj: '11222333000181', razaoSocial: 'Loja X LTDA', contato: 'Ana', whatsapp: null, vendedorReinId: 7 }
    const com = montarCorpoPessoa(lead, mesclarConfigPessoa({ tipoClienteId: 5, campoVendedor: 'VendedorId' })); expect(com.ok && com.corpo.VendedorId).toBe(7)
    const sem = montarCorpoPessoa(lead, mesclarConfigPessoa({ tipoClienteId: 5 })); expect(sem.ok && 'VendedorId' in sem.corpo).toBe(false)
  })
})
