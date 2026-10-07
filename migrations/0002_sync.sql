-- Semeia Leads · espelho do ERP Ctrl-e (Rein) e controle do sync (Sprints 1–2)
-- Só o sync escreve nas tabelas rein_*. Dinheiro em centavos. Datas em UTC 'AAAA-MM-DD HH:MM:SS'.
-- missing_count/deleted_at: registro que some do ERP só é marcado como apagado após 2 sincronizações completas sem aparecer.

CREATE TABLE rein_usuarios (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '', raw TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL, missing_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  PRIMARY KEY (tenant_id, rein_id)
);
CREATE TABLE rein_tabelas_preco (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '', synced_at TEXT NOT NULL, missing_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  PRIMARY KEY (tenant_id, rein_id)
);
CREATE TABLE rein_categorias (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '', parent_id INTEGER, synced_at TEXT NOT NULL, missing_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  PRIMARY KEY (tenant_id, rein_id)
);
CREATE TABLE rein_marcas (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '', synced_at TEXT NOT NULL, missing_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  PRIMARY KEY (tenant_id, rein_id)
);
CREATE TABLE rein_produtos (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '', code TEXT, sku TEXT, brand_id INTEGER, category_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1, is_service INTEGER NOT NULL DEFAULT 0, modified_at TEXT,
  raw TEXT NOT NULL DEFAULT '{}',                -- sem imagens e sem margens (viram rein_precos)
  synced_at TEXT NOT NULL, missing_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  PRIMARY KEY (tenant_id, rein_id)
);
-- preço por tabela. cost/margin são SENSÍVEIS: nunca devolver para o vendedor.
CREATE TABLE rein_precos (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), produto_rein_id INTEGER NOT NULL, tabela_rein_id INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0, cost INTEGER, margin REAL,
  PRIMARY KEY (tenant_id, produto_rein_id, tabela_rein_id)
);
CREATE TABLE rein_pessoas (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '', legal_name TEXT, cnpj TEXT, cnae TEXT,
  whatsapp TEXT, phone TEXT, email TEXT, city TEXT, uf TEXT,
  price_table_id INTEGER, credit_limit INTEGER, sales_channel_id INTEGER,
  registered_at TEXT, modified_at TEXT, raw TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL, missing_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  PRIMARY KEY (tenant_id, rein_id)
);
CREATE INDEX rein_pessoas_cnpj ON rein_pessoas(tenant_id, cnpj);
CREATE TABLE rein_pedidos (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), rein_id INTEGER NOT NULL,
  pessoa_rein_id INTEGER, vendedor_rein_id INTEGER, sales_channel_id INTEGER,
  ordered_at TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER, cancelled INTEGER NOT NULL DEFAULT 0,
  items_synced INTEGER NOT NULL DEFAULT 0, raw TEXT NOT NULL DEFAULT '{}', synced_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, rein_id)
);
CREATE INDEX rein_pedidos_pessoa ON rein_pedidos(tenant_id, pessoa_rein_id, ordered_at);
CREATE INDEX rein_pedidos_data ON rein_pedidos(tenant_id, ordered_at);
CREATE TABLE rein_pedido_itens (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), pedido_rein_id INTEGER NOT NULL, line INTEGER NOT NULL,
  produto_rein_id INTEGER, qty REAL NOT NULL DEFAULT 0, unit_price INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, pedido_rein_id, line)
);
CREATE INDEX rein_itens_produto ON rein_pedido_itens(tenant_id, produto_rein_id);

-- um job por empresa; cursor permite retomar de onde parou (o Worker tem limite de chamadas por execução)
CREATE TABLE sync_state (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), job TEXT NOT NULL,       -- cadastros | pedidos | backfill
  status TEXT NOT NULL DEFAULT 'idle',                                    -- idle | running
  cursor TEXT, run_id TEXT, lease_until TEXT, last_ok_at TEXT, last_error TEXT,
  PRIMARY KEY (tenant_id, job)
);
