# Deploy, backup e piloto — Semeia Leads

Tudo abaixo é feito na máquina de quem administra a conta Cloudflare do Grupo Semeia Digital (a sessão do Claude não alcança a Cloudflare por `wrangler`).

## 1. Primeira publicação
```bash
git clone https://github.com/GrupoSemeia/semeia-leads && cd semeia-leads
npm ci
npx wrangler login                          # conta Grupo Semeia Digital
openssl rand -base64 32 | npx wrangler secret put SECRETS_KEY   # criptografa o ClientSecret da Rein de cada empresa. GUARDE uma cópia do valor em cofre: sem ele os segredos já salvos não abrem
npm run db:remote                           # aplica as migrações pendentes (0001–0007 já estão aplicadas em produção)
npm run deploy                              # build + wrangler deploy → https://semeia-leads.<conta>.workers.dev
```
- Cron: `*/15 * * * *` já está no `wrangler.jsonc` (sync de pedidos e fila de trocas de vendedor no ERP).
- **Domínio próprio:** descomente `routes` em `wrangler.jsonc` com o domínio escolhido (a zona precisa estar na conta). Não crie registros DNS à mão para esse nome.
- Administradores da plataforma: e-mails em `ADMINS` (`wrangler.jsonc`).

## 2. Backup (dados de clientes — LGPD)
- **Primário:** D1 Time Travel (restauração a qualquer minuto dos últimos 30 dias): `npx wrangler d1 time-travel info semeia-leads` e `... restore semeia-leads --timestamp=<ISO>`.
- **Cópia fora da Cloudflare:** `CLOUDFLARE_API_TOKEN=… npm run backup` gera um `.sql` fora do repositório, com permissão 600. Guarde em local privado e criptografado; **nunca no Git**. Sugestão: semanal.
- Ao trocar o `SECRETS_KEY` ou restaurar o banco, as credenciais da Rein salvas só abrem com a chave original.

## 3. Checklist do piloto (1 vendedor na AC3)
1. Publicar (seção 1) e criar a conta do Augusto (cadastro com 14 dias grátis) — ele é o `admin`.
2. **Antes de ligar a Rein real:** enviar à Rein as perguntas de `docs/02-api-rein.md` §6 (inclui 11 e 12: campo do vendedor e `POST /pessoa`). Pedir uma base de homologação.
3. Configurações → Conexão com o ERP: preencher ClientId, ClientSecret, Database, **desligar o modo de teste**, “Testar conexão”. Ajustar `worker/rein/normalize.ts`/`api.ts` com a primeira resposta real (paginação, datas, formato das listas).
4. Configurações → Sincronização: **Carga inicial (24 meses)**. Conferir contagens (clientes, produtos, pedidos).
5. Equipe: convidar os 4 vendedores e ligar cada um ao vendedor dele no ERP.
6. Escolher **1 vendedor** para o piloto; ele usa a tela Hoje (agenda, WhatsApp, registrar contato) por 2 semanas.
7. **Baseline:** abrir Painel → “Últimos 60 dias × 60 dias anteriores” e registrar os números (positivação, reativados, leads convertidos) antes do piloto; repetir depois.
8. Escrita no ERP (pedido, cadastro de lead, troca de vendedor) **continua desligada** até a Rein confirmar os valores; o app funciona sem ela (resumo para copiar, pendências visíveis).
9. Instalar no celular: abrir o site no Chrome/Safari → “Adicionar à tela inicial”.

## 4. O que ainda é manual / pendente
- Cobrança dos planos (Asaas, como no AroCerto) e tela de administração da plataforma (hoje só `PATCH /api/admin/tenants/:id`).
- Imagens de produto (R2), landing page, recuperação de senha por e-mail, e-mail/push de alerta ao gestor.
