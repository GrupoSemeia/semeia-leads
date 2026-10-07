/** Troca de carteira (só o admin) e envio da troca ao ERP. O ERP manda na carteira; o app só escreve nele atrás de trava, uma tentativa por vez. */
import { type Env, newId, audit } from './lib'
import { mesclarConfigPessoa, ABERTAS, type ConfigPessoaErp } from './domain/leads'
import { montarAtualizacaoVendedor } from './domain/carteira-erp'
import { loadReinCreds } from './routes/rein'
import { reinApiFor } from './rein/api'

export async function carregarConfigPessoa(db: D1Database, t: string): Promise<ConfigPessoaErp> {
  const r = await db.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='pessoa_erp'").bind(t).first<{ value: string }>()
  try { return mesclarConfigPessoa(r ? JSON.parse(r.value) : null) } catch { return mesclarConfigPessoa(null) }
}

const enfileirar = (db: D1Database, t: string, pessoaId: number, para: string, por: string) => db.prepare(
  `INSERT INTO owner_erp_sync (id, tenant_id, pessoa_rein_id, to_user_id, by_user_id) VALUES (?,?,?,?,?)
   ON CONFLICT(tenant_id, pessoa_rein_id) WHERE status IN ('PENDENTE','ENVIANDO','ERRO')
   DO UPDATE SET to_user_id=excluded.to_user_id, status='PENDENTE', error=NULL, attempts=0, by_user_id=excluded.by_user_id, updated_at=datetime('now')
   WHERE owner_erp_sync.status <> 'ENVIANDO'`).bind(newId(), t, pessoaId, para, por)

/** Leads abertos de um cliente seguem o vendedor da carteira dele. */
export async function alinharLeadsComCarteira(db: D1Database, t: string) {
  const abertas = ABERTAS.map(e => `'${e}'`).join(',')
  await db.prepare(
    `UPDATE leads SET owner_id = (SELECT a.owner_id FROM accounts a WHERE a.tenant_id = leads.tenant_id AND a.pessoa_rein_id = leads.pessoa_rein_id), updated_at = datetime('now')
      WHERE tenant_id = ? AND stage IN (${abertas}) AND pessoa_rein_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM accounts a WHERE a.tenant_id = leads.tenant_id AND a.pessoa_rein_id = leads.pessoa_rein_id AND a.owner_id IS NOT NULL AND a.owner_id IS NOT leads.owner_id)`).bind(t).run()
}

/**
 * Passa clientes para outro vendedor (ou "sem dono"): grava o histórico, enfileira a atualização do ERP e leva junto os leads abertos.
 * Quem chama garante que `para` é da equipe e que o usuário é admin.
 */
export async function trocarDonoContas(db: D1Database, t: string, ids: number[], para: string | null, por: string): Promise<number> {
  if (!ids.length) return 0
  const marcas = ids.map(() => '?').join(',')
  const atuais = await db.prepare(`SELECT pessoa_rein_id AS id, owner_id FROM accounts WHERE tenant_id=? AND pessoa_rein_id IN (${marcas})`).bind(t, ...ids).all<any>()
  const mudam = atuais.results.filter((r: any) => (r.owner_id ?? null) !== para)
  const stmts = mudam.flatMap((r: any) => [
    db.prepare('UPDATE accounts SET owner_id=? WHERE tenant_id=? AND pessoa_rein_id=?').bind(para, t, r.id),
    db.prepare('INSERT INTO ownership_history (id, tenant_id, pessoa_rein_id, from_user_id, to_user_id, by_user_id) VALUES (?,?,?,?,?,?)').bind(newId(), t, r.id, r.owner_id, para, por),
    ...(para ? [enfileirar(db, t, r.id, para, por)] : []),   // "sem dono" não tem o que escrever no ERP
  ])
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
  await alinharLeadsComCarteira(db, t)
  return mudam.length
}

export type ResultadoEnvio = { processados: number; enviados: number; erros: number; restantes: number; bloqueio: null | 'campo' | 'trava' | 'sem_conexao' | 'credenciais' }

/**
 * Envia ao ERP as trocas de vendedor pendentes: lê o cadastro atual, troca só o campo do vendedor e grava (POST uma vez só).
 * Só roda com o campo do vendedor configurado e a escrita de pessoa ligada. Falha ao ler não escreve nada e tenta de novo (até 3x);
 * falha ao gravar vira ERRO sem repetir (o ERP pode ter aplicado): o admin confere e resolve.
 */
export async function processarVendedorErp(env: Env, t: string, max = 10): Promise<ResultadoEnvio> {
  const db = env.DB, r: ResultadoEnvio = { processados: 0, enviados: 0, erros: 0, restantes: 0, bloqueio: null }
  const restantes = async () => (await db.prepare("SELECT COUNT(*) AS n FROM owner_erp_sync WHERE tenant_id=? AND status='PENDENTE'").bind(t).first<{ n: number }>())?.n ?? 0
  const cfg = await carregarConfigPessoa(db, t), creds = await loadReinCreds(env, t)
  const ligada = !!(await db.prepare('SELECT pessoa_write_enabled AS e FROM tenant_rein WHERE tenant_id=?').bind(t).first<{ e: number }>())?.e
  const bloquear = async (b: ResultadoEnvio['bloqueio']) => ({ ...r, bloqueio: b, restantes: await restantes() })
  if (!cfg.campoVendedor) return bloquear('campo')
  if (!creds) return bloquear('sem_conexao')
  if (!ligada) return bloquear('trava')
  if (!creds.mock && (!creds.clientId || !creds.clientSecret || !creds.database)) return bloquear('credenciais')

  const api = reinApiFor(creds)
  const fila = await db.prepare("SELECT id, pessoa_rein_id AS pessoa, to_user_id AS para, attempts, by_user_id AS por FROM owner_erp_sync WHERE tenant_id=? AND status='PENDENTE' ORDER BY created_at LIMIT ?").bind(t, max).all<any>()
  const marcar = (id: string, status: string, erro: string | null, extra = '') => db.prepare(`UPDATE owner_erp_sync SET status=?, error=?, updated_at=datetime('now')${extra} WHERE id=? AND tenant_id=?`).bind(status, erro, id, t).run()
  for (const item of fila.results) {
    const claim = await db.prepare("UPDATE owner_erp_sync SET status='ENVIANDO', updated_at=datetime('now') WHERE id=? AND tenant_id=? AND status='PENDENTE'").bind(item.id, t).run()
    if (!claim.meta.changes) continue
    r.processados++
    const m = await db.prepare('SELECT rein_user_id FROM members WHERE tenant_id=? AND user_id=? AND active=1').bind(t, item.para).first<{ rein_user_id: number | null }>()
    let atual: Record<string, unknown> | null
    try { atual = await api.getPessoa(item.pessoa) } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300), tentativas = item.attempts + 1
      await marcar(item.id, tentativas >= 3 ? 'ERRO' : 'PENDENTE', `Não consegui ler o cadastro no ERP: ${msg}`, `, attempts=${tentativas}`)   // nada foi gravado: seguro tentar de novo
      if (tentativas >= 3) r.erros++
      continue
    }
    const corpo = montarAtualizacaoVendedor(atual, cfg.campoVendedor, m?.rein_user_id ?? null)
    if (!corpo.ok) { await marcar(item.id, 'ERRO', corpo.erro); r.erros++; continue }
    try { await api.updatePessoa(item.pessoa, corpo.corpo) } catch (e: any) {
      await marcar(item.id, 'ERRO', `O ERP não confirmou: ${String(e?.message ?? e).slice(0, 250)}. Confira no ERP se o vendedor já mudou antes de reenviar.`)
      await audit(db, t, item.por, 'carteira.erp_erro', { pessoa: item.pessoa }); r.erros++; continue
    }
    await marcar(item.id, 'ENVIADO', null)
    // o espelho local passa a refletir o ERP já agora (senão o próximo recálculo leria o vendedor antigo e desfaria a troca)
    await db.prepare("UPDATE rein_pessoas SET raw = json_set(raw, ?, ?) WHERE tenant_id=? AND rein_id=?").bind(`$.${cfg.campoVendedor}`, m!.rein_user_id, t, item.pessoa).run()
    await audit(db, t, item.por, 'carteira.erp_ok', { pessoa: item.pessoa, vendedorErp: m!.rein_user_id, teste: creds.mock })
    r.enviados++
    // se enquanto enviava o admin trocou de novo, enfileira a troca mais recente
    const conta = await db.prepare('SELECT owner_id FROM accounts WHERE tenant_id=? AND pessoa_rein_id=?').bind(t, item.pessoa).first<{ owner_id: string | null }>()
    if (conta?.owner_id && conta.owner_id !== item.para) await enfileirar(db, t, item.pessoa, conta.owner_id, item.por).run()
  }
  r.restantes = await restantes()
  return r
}
