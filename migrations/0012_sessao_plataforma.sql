-- Conta só da plataforma (administrador do Grupo Semeia sem empresa): a sessão pode não ter empresa.
CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,                           -- SHA-256 do token do cookie
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT REFERENCES tenants(id),         -- NULL = conta só da plataforma
  expires_at TEXT NOT NULL
);
INSERT INTO sessions_new (id, user_id, tenant_id, expires_at) SELECT id, user_id, tenant_id, expires_at FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
CREATE INDEX sessions_user ON sessions(user_id);
