import { describe, it, expect } from 'vitest'
import { cpfValido, cnpjValidoCobranca, documentoValido, valorDaAssinatura, validarPedidoAssinatura, somarMeses, somarDias, diaLocal, primeiroVencimento, pagoAte, efeitoDoEvento, acessoLiberado, TOLERANCIA_DIAS } from './cobranca'

describe('documentos', () => {
  it('CPF por dígitos verificadores', () => { expect(cpfValido('529.982.247-25')).toBe(true); expect(cpfValido('52998224725')).toBe(true); for (const x of ['52998224726', '11111111111', '123', '', null]) expect(cpfValido(x)).toBe(false) })
  it('CNPJ por dígitos verificadores', () => { expect(cnpjValidoCobranca('11.222.333/0001-81')).toBe(true); for (const x of ['11222333000182', '00000000000000', '1']) expect(cnpjValidoCobranca(x)).toBe(false) })
  it('aceita CPF ou CNPJ', () => { expect(documentoValido('52998224725')).toBe(true); expect(documentoValido('11222333000181')).toBe(true); expect(documentoValido('12345678900')).toBe(false) })
})

describe('valorDaAssinatura', () => {
  it('plano + vendedores extras', () => { expect(valorDaAssinatura('profissional', 0, 'MONTHLY')).toBe(44990); expect(valorDaAssinatura('profissional', 2, 'MONTHLY')).toBe(44990 + 2 * 5990); expect(valorDaAssinatura('essencial', 1, 'MONTHLY')).toBe(24990 + 5990) })
  it('anual = 10 × mensal (2 meses grátis)', () => { expect(valorDaAssinatura('distribuidor', 0, 'YEARLY')).toBe(79990 * 10); expect(valorDaAssinatura('essencial', 3, 'YEARLY')).toBe((24990 + 3 * 5990) * 10) })
  it('extra negativo ou quebrado não reduz o valor', () => { expect(valorDaAssinatura('essencial', -5, 'MONTHLY')).toBe(24990); expect(valorDaAssinatura('essencial', 1.9, 'MONTHLY')).toBe(24990 + 5990) })
})

describe('validarPedidoAssinatura', () => {
  const bom = { tier: 'profissional', extraSellers: 1, ciclo: 'YEARLY', cpfCnpj: '529.982.247-25' }
  it('aceita e normaliza', () => { expect(validarPedidoAssinatura(bom)).toEqual({ ok: true, pedido: { tier: 'profissional', extraSellers: 1, ciclo: 'YEARLY', cpfCnpj: '52998224725' } }); expect(validarPedidoAssinatura({ tier: 'essencial', cpfCnpj: '52998224725' })).toMatchObject({ ok: true, pedido: { extraSellers: 0, ciclo: 'MONTHLY' } }) })
  it('recusa plano, extras, ciclo e documento inválidos', () => {
    for (const ruim of [{ ...bom, tier: 'ouro' }, { ...bom, tier: undefined }, { ...bom, extraSellers: -1 }, { ...bom, extraSellers: 101 }, { ...bom, extraSellers: 1.5 }, { ...bom, ciclo: 'WEEKLY' }, { ...bom, cpfCnpj: '123' }, null]) expect(validarPedidoAssinatura(ruim)).toMatchObject({ ok: false })
  })
  it('na mudança de plano o documento não é exigido', () => { expect(validarPedidoAssinatura({ tier: 'essencial' }, false)).toMatchObject({ ok: true }) })
})

describe('datas', () => {
  it('soma meses com fim de mês', () => { expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28'); expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15'); expect(somarMeses('2026-10-07', 12)).toBe('2027-10-07') })
  it('soma dias', () => { expect(somarDias('2026-10-28', 5)).toBe('2026-11-02'); expect(somarDias('2026-12-30', 3)).toBe('2027-01-02') })
  it('dia local de Brasília', () => { expect(diaLocal(new Date('2026-10-08T02:59:00Z'))).toBe('2026-10-07'); expect(diaLocal(new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-08') })
  it('primeiro vencimento: fim do teste, ou hoje se já acabou / sem teste', () => {
    expect(primeiroVencimento('2026-10-21T16:00:00.000Z', '2026-10-07')).toBe('2026-10-21'); expect(primeiroVencimento('2026-10-01T16:00:00.000Z', '2026-10-07')).toBe('2026-10-07'); expect(primeiroVencimento(null, '2026-10-07')).toBe('2026-10-07')
  })
  it('pago até = vencimento + 1 ciclo', () => { expect(pagoAte('2026-10-21', 'MONTHLY')).toBe('2026-11-21'); expect(pagoAte('2026-10-21', 'YEARLY')).toBe('2027-10-21') })
})

describe('efeitoDoEvento', () => {
  it('pagamento confirmado/recebido', () => { expect(efeitoDoEvento('PAYMENT_CONFIRMED', 'CONFIRMED')).toBe('pago'); expect(efeitoDoEvento('PAYMENT_RECEIVED', 'RECEIVED')).toBe('pago'); expect(efeitoDoEvento('PAYMENT_UPDATED', 'RECEIVED')).toBe('pago') })
  it('evento de pago com status ainda pendente não vale', () => { expect(efeitoDoEvento('PAYMENT_UPDATED', 'PENDING')).toBe('ignorar'); expect(efeitoDoEvento('PAYMENT_RECEIVED', undefined)).toBe('ignorar') })
  it('vencida, cancelada e o resto', () => { expect(efeitoDoEvento('PAYMENT_OVERDUE', 'OVERDUE')).toBe('atrasado'); expect(efeitoDoEvento('SUBSCRIPTION_DELETED')).toBe('cancelado'); expect(efeitoDoEvento('PAYMENT_CREATED', 'PENDING')).toBe('ignorar'); expect(efeitoDoEvento('PAYMENT_REFUNDED', 'REFUNDED')).toBe('ignorar') })
})

describe('acessoLiberado', () => {
  const agora = new Date('2026-10-07T15:00:00Z')
  it('suspenso pelo suporte: bloqueado', () => { expect(acessoLiberado({ plan: 'suspenso', trialUntil: null, assinatura: null }, agora)).toMatchObject({ liberado: false, motivo: 'suspenso' }) })
  it('teste grátis: livre e avisa nos últimos 3 dias; acabou: bloqueado', () => {
    expect(acessoLiberado({ plan: 'trial', trialUntil: '2026-10-21T15:00:00Z', assinatura: null }, agora)).toMatchObject({ liberado: true, diasDeTeste: 14, aviso: null })
    expect(acessoLiberado({ plan: 'trial', trialUntil: '2026-10-09T15:00:00Z', assinatura: null }, agora)).toMatchObject({ liberado: true, diasDeTeste: 2, aviso: 'teste_acaba' })
    expect(acessoLiberado({ plan: 'trial', trialUntil: '2026-10-07T14:00:00Z', assinatura: null }, agora)).toMatchObject({ liberado: false, motivo: 'teste_acabou' })
    expect(acessoLiberado({ plan: 'trial', trialUntil: null, assinatura: null }, agora)).toMatchObject({ liberado: false, motivo: 'teste_acabou' })
  })
  it('ativo sem assinatura (liberado à mão): livre', () => { expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: null }, agora)).toMatchObject({ liberado: true, motivo: 'ok' }) })
  it('assinatura em dia: livre sem aviso', () => { expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: { status: 'ativa', pagoAte: '2026-11-07' } }, agora)).toMatchObject({ liberado: true, aviso: null }) })
  it('atrasada: livre com aviso por 10 dias, depois bloqueia', () => {
    const a = { status: 'atrasada', pagoAte: '2026-10-01' }
    expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: a }, agora)).toMatchObject({ liberado: true, aviso: 'atrasada', ateQuando: '2026-10-11' })
    expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: a }, new Date('2026-10-11T20:00:00Z'))).toMatchObject({ liberado: true })
    expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: a }, new Date('2026-10-12T04:00:00Z'))).toMatchObject({ liberado: false, motivo: 'sem_pagamento' })
    expect(TOLERANCIA_DIAS).toBe(10)
  })
  it('cancelada: vale só até a data paga (sem tolerância)', () => {
    const a = { status: 'cancelada', pagoAte: '2026-10-10' }
    expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: a }, agora)).toMatchObject({ liberado: true, aviso: null })
    expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: a }, new Date('2026-10-11T12:00:00Z'))).toMatchObject({ liberado: false, motivo: 'cancelado' })
  })
  it('assinatura sem data paga não bloqueia por engano', () => { expect(acessoLiberado({ plan: 'ativo', trialUntil: null, assinatura: { status: 'ativa', pagoAte: null } }, agora).liberado).toBe(true) })
})
