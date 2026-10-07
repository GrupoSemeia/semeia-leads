-- Semeia Leads · pré-pedido (Sprint 5)
-- O preço de cada linha é gravado no momento em que o vendedor monta o pedido, vindo SEMPRE do servidor (tabela do cliente), nunca do navegador.

CREATE TABLE pre_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pessoa_rein_id INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),     -- vendedor que montou
  tabela_rein_id INTEGER NOT NULL,                -- tabela de preço do cliente usada nos preços
  status TEXT NOT NULL DEFAULT 'RASCUNHO',        -- RASCUNHO | PENDENTE_FLAG | ENVIANDO | ENVIADO | ERRO
  total INTEGER NOT NULL DEFAULT 0,               -- centavos
  note TEXT,
  pedido_rein_id INTEGER,                         -- pedido criado no ERP
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX pre_orders_tenant ON pre_orders(tenant_id, status, created_at);
CREATE INDEX pre_orders_user ON pre_orders(tenant_id, user_id, created_at);

CREATE TABLE pre_order_items (
  pre_order_id TEXT NOT NULL REFERENCES pre_orders(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  line INTEGER NOT NULL,
  produto_rein_id INTEGER NOT NULL,
  name TEXT NOT NULL,                             -- nome e código no momento da venda
  code TEXT,
  qty INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,                    -- centavos
  PRIMARY KEY (pre_order_id, line)
);
