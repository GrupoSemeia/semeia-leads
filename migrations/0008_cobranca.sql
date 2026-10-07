-- Semeia Leads · cobrança dos planos pela Asaas
-- O plano só passa a valer com o pagamento confirmado (webhook). CPF/CNPJ vai só para a Asaas; não é guardado aqui.

CREATE TABLE subscriptions (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),         -- uma assinatura por empresa
  asaas_customer_id TEXT NOT NULL,
  asaas_subscription_id TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL,                                        -- plano escolhido (vale quando o pagamento confirma)
  extra_sellers INTEGER NOT NULL DEFAULT 0,
  cycle TEXT NOT NULL DEFAULT 'MONTHLY',                     -- MONTHLY | YEARLY
  value INTEGER NOT NULL,                                    -- centavos por cobrança
  status TEXT NOT NULL DEFAULT 'pendente',                   -- pendente | ativa | atrasada | cancelada
  paid_until TEXT,                                           -- AAAA-MM-DD: pago até (vencimento + 1 ciclo)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,                                       -- id da cobrança na Asaas
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  value INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  invoice_url TEXT NOT NULL DEFAULT '',
  billing_type TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX payments_tenant ON payments(tenant_id, due_date);
