/** Geração das tarefas de pós-venda (idempotente) e utilidades de modelos de mensagem. */
import { newId, randomToken } from './lib'
import { tarefasDoPedido, JANELA_TAREFAS_DIAS, MODELOS_PADRAO } from './domain/contato'
import { DIA } from './domain/carteira'

const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
const utc = (s: string) => new Date(s.replace(' ', 'T') + 'Z')

/** Cria POS_VENDA_D1 e NPS_D7 (e o link de pesquisa) para pedidos recentes que ainda não têm. Chamada ao fim de cada sync. */
export async function generateTasks(db: D1Database, tenantId: string, agora = new Date()): Promise<number> {
  const desde = fmt(new Date(agora.getTime() - JANELA_TAREFAS_DIAS * DIA))
  const peds = await db.prepare(
    `SELECT o.rein_id, o.pessoa_rein_id, o.ordered_at FROM rein_pedidos o
      WHERE o.tenant_id = ? AND o.cancelled = 0 AND o.pessoa_rein_id IS NOT NULL AND o.ordered_at >= ?
        AND EXISTS (SELECT 1 FROM accounts a WHERE a.tenant_id = o.tenant_id AND a.pessoa_rein_id = o.pessoa_rein_id)`).bind(tenantId, desde).all<any>()
  const stmts: D1PreparedStatement[] = []
  for (const p of peds.results) {
    for (const t of tarefasDoPedido(utc(p.ordered_at), agora)) {
      const motivo = t.tipo === 'POS_VENDA_D1' ? 'Pós-venda: confirmar recebimento' : 'Enviar pesquisa de satisfação'
      stmts.push(db.prepare('INSERT OR IGNORE INTO tasks (id, tenant_id, type, pessoa_rein_id, ref_id, due_at, reason, dedupe_key) VALUES (?,?,?,?,?,?,?,?)')
        .bind(newId(), tenantId, t.tipo, p.pessoa_rein_id, p.rein_id, fmt(t.venceEm), motivo, `${t.tipo}:pedido:${p.rein_id}`))
      if (t.tipo === 'NPS_D7') stmts.push(db.prepare('INSERT OR IGNORE INTO nps_responses (token, tenant_id, pessoa_rein_id, pedido_rein_id) VALUES (?,?,?,?)').bind(randomToken(24), tenantId, p.pessoa_rein_id, p.rein_id))
    }
  }
  let criadas = 0
  for (let i = 0; i < stmts.length; i += 80) for (const r of await db.batch(stmts.slice(i, i + 80))) criadas += r.meta.changes ?? 0
  return criadas
}

/** Modelos da empresa; na primeira vez grava os padrão (a empresa pode editar depois). */
export async function ensureTemplates(db: D1Database, tenantId: string) {
  await db.batch(MODELOS_PADRAO.map(m => db.prepare('INSERT OR IGNORE INTO message_templates (tenant_id, key, title, body) VALUES (?,?,?,?)').bind(tenantId, m.key, m.title, m.body)))
  return (await db.prepare('SELECT key, title, body FROM message_templates WHERE tenant_id=? ORDER BY rowid').bind(tenantId).all<{ key: string; title: string; body: string }>()).results
}
