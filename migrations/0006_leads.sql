-- Semeia Leads · funil de leads (Sprint 6)

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cnpj TEXT NOT NULL,                              -- só dígitos, já validado
  razao_social TEXT,
  contact_name TEXT NOT NULL,
  whatsapp TEXT,
  city TEXT, uf TEXT,
  segment TEXT,
  source TEXT NOT NULL DEFAULT 'manual',           -- site | manual | lista | indicacao
  stage TEXT NOT NULL DEFAULT 'NOVO',              -- NOVO | CONTATADO | CATALOGO_ENVIADO | NEGOCIANDO | CONVERTIDO | PERDIDO
  lost_reason TEXT,
  owner_id TEXT REFERENCES users(id),              -- vendedor responsável (NULL = sem dono)
  pessoa_rein_id INTEGER,                          -- preenchido quando o CNPJ existe no ERP
  existing_client INTEGER NOT NULL DEFAULT 0,      -- 1 = o CNPJ já era cliente (com pedidos) quando o lead chegou
  enrichment TEXT,                                 -- JSON da BrasilAPI (dado público de empresa)
  next_followup_at TEXT,
  converted_at TEXT,
  erp_status TEXT NOT NULL DEFAULT 'NAO_ENVIADO',  -- NAO_ENVIADO | PENDENTE_FLAG | ENVIANDO | ENVIADO | ERRO
  erp_error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Só um lead ABERTO por CNPJ em cada empresa (barra duplicata mesmo com dois envios ao mesmo tempo).
CREATE UNIQUE INDEX leads_cnpj_aberto ON leads(tenant_id, cnpj) WHERE stage NOT IN ('PERDIDO', 'CONVERTIDO');
CREATE INDEX leads_tenant ON leads(tenant_id, stage, created_at);
CREATE INDEX leads_dono ON leads(tenant_id, owner_id, next_followup_at);
CREATE INDEX leads_pessoa ON leads(tenant_id, pessoa_rein_id);

CREATE TABLE lead_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  user_id TEXT,                                    -- NULL = automático (formulário, sync)
  type TEXT NOT NULL,                              -- criado | etapa | nota | dono | erp | convertido | novo_contato
  text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX lead_events_lead ON lead_events(tenant_id, lead_id, created_at);
