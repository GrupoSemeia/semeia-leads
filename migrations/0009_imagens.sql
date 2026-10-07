-- Semeia Leads · imagens de produto (arquivos no R2; aqui só o índice)
CREATE TABLE product_images (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  produto_rein_id INTEGER NOT NULL,
  pos INTEGER NOT NULL,                 -- 0 = principal
  r2_key TEXT NOT NULL,                 -- montada no servidor: <empresa>/<produto>/<pos>-<hash>.<ext>
  hash TEXT NOT NULL,                   -- SHA-256 do conteúdo (só regrava quando a foto muda; também é o ETag)
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, produto_rein_id, pos)
);
