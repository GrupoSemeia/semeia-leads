-- Semeia Leads · agenda, contatos, pós-venda e NPS (Sprint 4)

CREATE TABLE interactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pessoa_rein_id INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,                          -- whatsapp | ligacao | visita | email
  result TEXT,                                    -- VENDEU | ORCAMENTO | SEM_INTERESSE | NAO_RESPONDEU | REAGENDAR | NULL (só anotação/clique)
  note TEXT,
  next_contact_at TEXT,                           -- data definida por este contato (reagendar / retorno)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX interactions_conta ON interactions(tenant_id, pessoa_rein_id, created_at);

-- Tarefas automáticas. O responsável é sempre o dono ATUAL da conta (accounts.owner_id), não quem era na criação.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,                             -- POS_VENDA_D1 | NPS_D7 | TRATAR_NPS
  status TEXT NOT NULL DEFAULT 'ABERTA',          -- ABERTA | FEITA | CANCELADA
  pessoa_rein_id INTEGER NOT NULL,
  ref_id INTEGER,                                 -- pedido (ERP) de origem
  due_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL,                       -- ex.: 'NPS_D7:pedido:12345' (geração idempotente)
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, dedupe_key)
);
CREATE INDEX tasks_abertas ON tasks(tenant_id, status, due_at);
CREATE INDEX tasks_conta ON tasks(tenant_id, pessoa_rein_id, status);

-- Pesquisa de satisfação: o link público /nps/<token> não exige login. Token aleatório de 192 bits.
CREATE TABLE nps_responses (
  token TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pessoa_rein_id INTEGER NOT NULL,
  pedido_rein_id INTEGER NOT NULL,
  score INTEGER,
  comment TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, pedido_rein_id)
);
CREATE INDEX nps_tenant ON nps_responses(tenant_id, answered_at);

CREATE TABLE message_templates (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);
