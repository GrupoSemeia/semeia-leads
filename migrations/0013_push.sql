-- Avisos no celular/computador (Web Push): uma linha por aparelho que ligou as notificações.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),         -- NULL = administrador da plataforma sem empresa
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX push_user ON push_subscriptions(user_id);
CREATE INDEX push_tenant ON push_subscriptions(tenant_id);
