/** Textos dos e-mails (português simples). Funções PURAS. Todo dado de empresa/cliente/lead é escapado no HTML e limpo de quebras de linha no assunto. */
export type Mensagem = { assunto: string; texto: string; html: string }

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
/** Assunto sem quebra de linha (injeção de cabeçalho) e com tamanho razoável. */
export const assuntoSeguro = (s: string) => s.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
export const emailValido = (e: unknown): e is string => typeof e === 'string' && e.length <= 160 && /^[^\s@<>,;"'\\]+@[^\s@<>,;"'\\]+\.[^\s@<>,;"'\\]+$/.test(e)
/** Só aceita link http(s) (nunca javascript:). */
const linkSeguro = (l?: string | null) => (l && /^https?:\/\/[^\s"'<>]+$/.test(l) ? l : null)

function montar(titulo: string, linhas: string[], opts: { link?: string | null; botao?: string; rodape?: string } = {}): Mensagem {
  const link = linkSeguro(opts.link), rodape = opts.rodape ?? 'Um produto Grupo Semeia Digital.'
  const texto = [titulo, '', ...linhas, ...(link ? ['', `${opts.botao ?? 'Abrir'}: ${link}`] : []), '', rodape].join('\n')
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#12263f">
<h2 style="margin:0 0 12px;font-size:20px">${esc(titulo)}</h2>${linhas.map(l => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join('')}${link ? `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#00c4d0;color:#000b1a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(opts.botao ?? 'Abrir')}</a></p>` : ''}
<p style="margin:22px 0 0;color:#5b6b82;font-size:12px">${esc(rodape)}</p></div>`
  return { assunto: assuntoSeguro(titulo), texto, html }
}

export const emailRecuperacaoSenha = (i: { nome: string; link: string; validadeMin: number }) =>
  montar('Redefinir sua senha do Semeia Leads', [`Olá, ${i.nome}.`, `Recebemos um pedido para redefinir a senha da sua conta. O link vale por ${i.validadeMin} minutos e só pode ser usado uma vez.`, 'Se não foi você, ignore este e-mail: sua senha continua a mesma.'], { link: i.link, botao: 'Criar nova senha' })

export const avisoDetrator = (i: { cliente: string; nota: number; comentario?: string | null; link?: string }) =>
  montar(`Cliente insatisfeito: ${i.cliente} deu nota ${i.nota}`, [`${i.cliente} respondeu a pesquisa de satisfação com nota ${i.nota}.`, ...(i.comentario ? [`Comentário: “${i.comentario.slice(0, 200)}”`] : []), 'O vendedor da carteira já recebeu a tarefa “Tratar insatisfação”.'], { link: i.link, botao: 'Ver o cliente' })
export const avisoLeadSite = (i: { empresa: string; contato: string; cidade?: string | null; vendedor?: string | null; link?: string }) =>
  montar(`Novo lead pelo site: ${i.empresa}`, [`${i.contato} pediu contato pelo formulário “Seja revendedor”${i.cidade ? ` (${i.cidade})` : ''}.`, i.vendedor ? `Foi para a carteira de ${i.vendedor}.` : 'Ficou sem vendedor: distribua o lead.'], { link: i.link, botao: 'Ver os leads' })
export const avisoPagamentoAtrasado = (i: { valor: string; vencimento: string; link?: string }) =>
  montar('Pagamento do Semeia Leads em atraso', [`A cobrança de ${i.valor}, com vencimento em ${i.vencimento}, não foi paga.`, 'Você continua com acesso por alguns dias. Regularize para não perder o acesso. Seus dados ficam guardados.'], { link: i.link, botao: 'Ver cobrança' })
export const avisoErroTroca = (i: { cliente: string; para: string; erro: string; link?: string }) =>
  montar('Troca de vendedor não chegou ao ERP', [`Não consegui atualizar o vendedor de ${i.cliente} (para ${i.para}) no ERP.`, `Detalhe: ${i.erro.slice(0, 200)}`, 'Confira no ERP se o vendedor já mudou e resolva em Configurações.'], { link: i.link, botao: 'Ver trocas pendentes' })
export const avisoSyncFalhou = (i: { job: string; erro: string; link?: string }) =>
  montar('A sincronização com o ERP falhou', [`A sincronização “${i.job}” falhou: ${i.erro.slice(0, 200)}`, 'Os dados do app ficam como estavam até a próxima tentativa. Se persistir, confira a conexão com o ERP em Configurações.'], { link: i.link, botao: 'Abrir Configurações' })
export const avisoTesteAcabando = (i: { dias: number; link?: string }) =>
  montar(i.dias <= 0 ? 'Seu teste grátis do Semeia Leads acaba hoje' : `Seu teste grátis acaba em ${i.dias} dia(s)`, ['Para continuar usando sem interrupção, escolha um plano.', 'A primeira cobrança só acontece no fim do teste. Seus dados ficam guardados se você não contratar.'], { link: i.link, botao: 'Escolher plano' })
