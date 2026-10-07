/** Serviço de leads: criação com validação, deduplicação, consulta de CNPJ e rodízio; conversão automática no sync. */
import { type Env, fail, newId, clean } from './lib'
import { cnpjValido, normalizarWhatsapp, soDigitos, proximoFollowup, proximoDoRodizio, estaAberto, ORIGENS, ABERTAS, type Origem } from './domain/leads'
import { consultarCnpj } from './brasilapi'
import { escolherDonoLead, donoNaConversao } from './domain/carteira-erp'
import { trocarDonoContas } from './carteira-erp'

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null)
const eUnico = (e: unknown) => /UNIQUE|constraint/i.test(String((e as any)?.message ?? e))

export async function escolherDonoRodizio(db: D1Database, tenantId: string): Promise<string | null> {
  const v = await db.prepare("SELECT user_id FROM members WHERE tenant_id=? AND role='seller' AND active=1 ORDER BY created_at, user_id").bind(tenantId).all<{ user_id: string }>()
  const r = await db.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='lead_rodizio'").bind(tenantId).first<{ value: string }>()
  let ultimo: string | null = null; try { ultimo = r ? JSON.parse(r.value).ultimo ?? null : null } catch { /* ignora */ }
  const dono = proximoDoRodizio(v.results.map(x => x.user_id), ultimo)
  if (dono) await db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'lead_rodizio', ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value=excluded.value").bind(tenantId, JSON.stringify({ ultimo: dono })).run()
  return dono
}

export type NovoLead = { cnpj: unknown; razaoSocial?: unknown; contato: unknown; whatsapp: unknown; cidade?: unknown; uf?: unknown; segmento?: unknown; origem?: unknown }
export type ResultadoLead = { id: string | null; duplicado: boolean; jaCliente: boolean; dono: string | null }

/**
 * Cria um lead. `publico` = veio do formulário do site: nunca revela se o CNPJ já é cliente ou já tem lead (privacidade dos clientes),
 * e um CNPJ repetido só registra "novo contato". No cadastro manual esses casos viram aviso (409).
 */
export async function criarLead(env: Env, tenantId: string, d: NovoLead, o: { criadoPor: string | null; escolhidoPeloAdmin?: string | null; vendedorQueCadastrou?: string | null; publico: boolean }): Promise<ResultadoLead> {
  const db = env.DB
  const cnpj = soDigitos(d.cnpj), whatsapp = normalizarWhatsapp(d.whatsapp), contato = clean(d.contato, 80)
  if (!cnpjValido(cnpj)) throw fail(400, 'CNPJ inválido. Confira os 14 números.')
  if (contato.length < 2) throw fail(400, 'Informe o nome da pessoa de contato.')
  if (!whatsapp) throw fail(400, 'WhatsApp inválido. Use DDD + número.')
  const origem: Origem = o.publico ? 'site' : (ORIGENS as readonly string[]).includes(String(d.origem)) && d.origem !== 'site' ? (d.origem as Origem) : 'manual'

  const pessoa = await db.prepare(
    `SELECT p.rein_id AS id, a.status, a.owner_id, u.name AS dono FROM rein_pessoas p LEFT JOIN accounts a ON a.tenant_id=p.tenant_id AND a.pessoa_rein_id=p.rein_id
       LEFT JOIN users u ON u.id = a.owner_id WHERE p.tenant_id=? AND p.cnpj=? AND p.deleted_at IS NULL LIMIT 1`).bind(tenantId, cnpj).first<any>()
  const jaCliente = !!pessoa && !!pessoa.status && pessoa.status !== 'PROSPECT'
  if (jaCliente && !o.publico) throw fail(409, `Este CNPJ já é cliente${pessoa.dono ? ` de ${pessoa.dono}` : ''}. Procure na Carteira.`)
  const aberto = await db.prepare("SELECT l.id, u.name AS dono FROM leads l LEFT JOIN users u ON u.id = l.owner_id WHERE l.tenant_id=? AND l.cnpj=? AND l.stage IN ('NOVO','CONTATADO','CATALOGO_ENVIADO','NEGOCIANDO')").bind(tenantId, cnpj).first<any>()
  if (aberto) {
    if (!o.publico) throw fail(409, `Já existe um lead aberto com este CNPJ${aberto.dono ? `, com ${aberto.dono}` : ''}.`)
    await db.prepare("INSERT INTO lead_events (id, tenant_id, lead_id, type, text) VALUES (?,?,?,?,?)").bind(newId(), tenantId, aberto.id, 'novo_contato', 'Pediu contato de novo pelo formulário.').run()
    await db.prepare("UPDATE leads SET next_followup_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(aberto.id, tenantId).run()
    return { id: aberto.id, duplicado: true, jaCliente: false, dono: null }
  }


  const enr = await consultarCnpj(cnpj)
  // quem atende é o vendedor da carteira do CNPJ (ERP/app); só sem carteira vale o escolhido pelo admin, quem cadastrou ou o rodízio
  const escolha = escolherDonoLead({ donoCarteira: pessoa?.owner_id ?? null, escolhidoPeloAdmin: o.escolhidoPeloAdmin ?? null, vendedorQueCadastrou: o.vendedorQueCadastrou ?? null })
  const dono = escolha.precisaRodizio ? await escolherDonoRodizio(db, tenantId) : escolha.dono
  const id = newId()
  try {
    await db.batch([
      db.prepare(`INSERT INTO leads (id, tenant_id, cnpj, razao_social, contact_name, whatsapp, city, uf, segment, source, owner_id, pessoa_rein_id, existing_client, enrichment, next_followup_at, erp_status, created_by)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, tenantId, cnpj, clean(d.razaoSocial, 120) || enr?.razaoSocial || null, contato, whatsapp, clean(d.cidade, 80) || enr?.cidade || null,
        clean(d.uf, 2).toUpperCase() || enr?.uf || null, clean(d.segmento, 60) || null, origem, dono, pessoa?.id ?? null, jaCliente ? 1 : 0, enr ? JSON.stringify(enr) : null,
        fmt(proximoFollowup('NOVO', new Date())), pessoa ? 'ENVIADO' : 'NAO_ENVIADO', o.criadoPor),
      db.prepare('INSERT INTO lead_events (id, tenant_id, lead_id, user_id, type, text) VALUES (?,?,?,?,?,?)').bind(newId(), tenantId, id, o.criadoPor, 'criado',
        o.publico ? 'Chegou pelo formulário do site.' : `Cadastrado manualmente${jaCliente ? ' (CNPJ já é cliente)' : ''}.`),
    ])
  } catch (e) {
    if (eUnico(e)) return { id: null, duplicado: true, jaCliente: false, dono: null }   // dois envios ao mesmo tempo: o outro já criou
    throw e
  }
  return { id, duplicado: false, jaCliente, dono }
}

/**
 * Ao fim de cada sync: (1) liga leads ao cadastro do ERP pelo CNPJ; (2) lead que fez o primeiro pedido vira CONVERTIDO e o cliente
 * passa para a carteira do vendedor do lead (com histórico). Lead de CNPJ que já era cliente não converte sozinho.
 */
export async function convertLeads(db: D1Database, tenantId: string): Promise<{ ligados: number; convertidos: number }> {
  const abertas = ABERTAS.map(e => `'${e}'`).join(',')
  const lig = await db.prepare(
    `UPDATE leads SET pessoa_rein_id = (SELECT p.rein_id FROM rein_pessoas p WHERE p.tenant_id = leads.tenant_id AND p.cnpj = leads.cnpj AND p.deleted_at IS NULL LIMIT 1), erp_status = 'ENVIADO'
      WHERE tenant_id = ? AND pessoa_rein_id IS NULL AND stage IN (${abertas})
        AND EXISTS (SELECT 1 FROM rein_pessoas p WHERE p.tenant_id = leads.tenant_id AND p.cnpj = leads.cnpj AND p.deleted_at IS NULL)`).bind(tenantId).run()
  const prontos = await db.prepare(
    `SELECT l.id, l.owner_id, l.pessoa_rein_id AS pessoa FROM leads l
      WHERE l.tenant_id = ? AND l.stage IN (${abertas}) AND l.existing_client = 0 AND l.pessoa_rein_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM rein_pedidos o WHERE o.tenant_id = l.tenant_id AND o.pessoa_rein_id = l.pessoa_rein_id AND o.cancelled = 0)`).bind(tenantId).all<any>()
  for (const l of prontos.results) {
    const stmts = [
      db.prepare("UPDATE leads SET stage='CONVERTIDO', converted_at=datetime('now'), next_followup_at=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(l.id, tenantId),
      db.prepare("INSERT INTO lead_events (id, tenant_id, lead_id, type, text) VALUES (?,?,?,?,?)").bind(newId(), tenantId, l.id, 'convertido', 'Fez o primeiro pedido no ERP. Virou cliente da carteira.'),
    ]
    await db.batch(stmts)
    // o ERP vence: o vendedor do lead só assume o cliente se a conta ainda estiver sem dono
    const conta = await db.prepare('SELECT owner_id FROM accounts WHERE tenant_id=? AND pessoa_rein_id=?').bind(tenantId, l.pessoa).first<{ owner_id: string | null }>()
    const dono = conta ? donoNaConversao(conta.owner_id, l.owner_id) : null
    if (conta && dono && dono !== conta.owner_id && (await db.prepare('SELECT 1 FROM members WHERE tenant_id=? AND user_id=? AND active=1').bind(tenantId, dono).first())) await trocarDonoContas(db, tenantId, [l.pessoa], dono, dono)
  }
  return { ligados: lig.meta.changes ?? 0, convertidos: prontos.results.length }
}
export { estaAberto }
