-- Recuperação de senha por e-mail: o banco guarda só o hash do token.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX password_resets_user ON password_resets(user_id, created_at);
CREATE INDEX password_resets_ip ON password_resets(ip_hash, created_at);
