-- Semeia Leads · esquema inicial (Sprint 0)
-- Multi-tenant: toda tabela de negócio tem tenant_id, sempre vindo da sessão.
-- Dinheiro em centavos (INTEGER). Datas em UTC 'AAAA-MM-DD HH:MM:SS'.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'trial',            -- trial | ativo | suspenso
  trial_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'seller',           -- admin | manager | seller
  active INTEGER NOT NULL DEFAULT 1,
  rein_user_id INTEGER,                          -- vínculo com o usuário/vendedor do ERP
  whatsapp TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                           -- SHA-256 do token do cookie
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,                           -- SHA-256 do token do link
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'seller',
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- Credenciais do ERP Ctrl-e (Rein) por empresa. client_secret fica criptografado (AES-GCM) e nunca volta ao navegador.
CREATE TABLE tenant_rein (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  base_url TEXT NOT NULL DEFAULT 'https://api.rein.net.br',
  client_id TEXT NOT NULL DEFAULT '',
  client_secret_enc TEXT NOT NULL DEFAULT '',
  database TEXT NOT NULL DEFAULT '',
  mock INTEGER NOT NULL DEFAULT 1,
  sign_include_query INTEGER NOT NULL DEFAULT 0,
  pessoa_write_enabled INTEGER NOT NULL DEFAULT 0,
  pedido_write_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,                           -- JSON
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  job TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  ok INTEGER,
  stats TEXT,
  error TEXT
);
CREATE INDEX sync_runs_tenant ON sync_runs(tenant_id, started_at);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX audit_tenant ON audit_log(tenant_id, created_at);
