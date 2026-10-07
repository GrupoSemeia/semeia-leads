-- Semeia Leads · planos do SaaS e carteira de clientes (Sprint 3)

-- tier = plano contratado (essencial | profissional | distribuidor). plan = situação (trial | ativo | suspenso).
-- Durante o teste grátis tudo fica liberado; depois vale o tier.
ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'essencial';
ALTER TABLE tenants ADD COLUMN extra_sellers INTEGER NOT NULL DEFAULT 0;   -- vendedores adicionais contratados

-- Visão comercial de cada cliente do ERP (dados do app + métricas calculadas). 1:1 com rein_pessoas.
CREATE TABLE accounts (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pessoa_rein_id INTEGER NOT NULL,
  owner_id TEXT REFERENCES users(id),             -- vendedor dono da carteira (NULL = sem dono)
  curve TEXT,                                     -- A | B | C | NULL (sem faturamento em 12 meses)
  status TEXT NOT NULL DEFAULT 'PROSPECT',        -- PROSPECT | ATIVO | EM_RISCO | INATIVO
  revenue_12m INTEGER NOT NULL DEFAULT 0,         -- centavos
  orders_12m INTEGER NOT NULL DEFAULT 0,
  avg_ticket INTEGER,
  avg_interval_days INTEGER,
  last_order_at TEXT,
  last_contact_at TEXT,
  reschedule_at TEXT,                             -- "reagendar para" (Sprint 4)
  next_contact_due TEXT,
  priority_score INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, pessoa_rein_id)
);
CREATE INDEX accounts_owner ON accounts(tenant_id, owner_id, priority_score);
CREATE INDEX accounts_status ON accounts(tenant_id, status, curve);

CREATE TABLE ownership_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pessoa_rein_id INTEGER NOT NULL,
  from_user_id TEXT, to_user_id TEXT, by_user_id TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ownership_tenant ON ownership_history(tenant_id, pessoa_rein_id);
