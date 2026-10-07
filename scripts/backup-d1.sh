#!/usr/bin/env bash
# Cópia de segurança do banco de produção (D1) em um arquivo .sql, FORA do repositório.
# Uso: CLOUDFLARE_API_TOKEN=... ./scripts/backup-d1.sh [pasta]
# O arquivo tem dados de clientes (LGPD): guarde em local privado e criptografado, nunca no Git.
set -euo pipefail
DESTINO="${1:-$HOME/backups-semeia-leads}"
mkdir -p "$DESTINO"
ARQ="$DESTINO/semeia-leads-$(date -u +%Y%m%dT%H%M%SZ).sql"
npx wrangler d1 export semeia-leads --remote --output "$ARQ"
chmod 600 "$ARQ"
echo "Backup salvo em $ARQ"
