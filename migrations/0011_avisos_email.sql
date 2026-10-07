-- Avisos por e-mail ao gestor: preferência por pessoa e controle para não repetir.
ALTER TABLE members ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1;
CREATE TABLE notifications_sent (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, dedupe_key)
);
CREATE INDEX notifications_sent_data ON notifications_sent(tenant_id, created_at);
