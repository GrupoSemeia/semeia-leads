-- Semeia Leads · troca de vendedor da carteira refletida no ERP (decisão do Augusto/Neto: o ERP manda na carteira)
-- Cada troca feita no app (só o admin troca) vira uma linha aqui; um processo envia ao ERP. Uma troca ativa por cliente.

CREATE TABLE owner_erp_sync (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pessoa_rein_id INTEGER NOT NULL,
  to_user_id TEXT NOT NULL REFERENCES users(id),   -- novo vendedor; o código dele no ERP é lido de members.rein_user_id na hora de enviar
  status TEXT NOT NULL DEFAULT 'PENDENTE',         -- PENDENTE | ENVIANDO | ENVIADO | ERRO
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Só uma troca "em aberto" por cliente: uma nova troca substitui a anterior que ainda não foi enviada.
CREATE UNIQUE INDEX owner_erp_sync_ativo ON owner_erp_sync(tenant_id, pessoa_rein_id) WHERE status IN ('PENDENTE', 'ENVIANDO', 'ERRO');
CREATE INDEX owner_erp_sync_status ON owner_erp_sync(tenant_id, status, created_at);
