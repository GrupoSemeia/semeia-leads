# CLAUDE.md — Semeia Leads

Leia este arquivo inteiro antes de mexer no código. Consulte `docs/` conforme a tarefa.

## O que é
**Semeia Leads** é um **SaaS** (Grupo Semeia Digital) de captação de leads, gestão de carteira/venda e pós-venda para **distribuidoras B2B que usam o ERP Ctrl-e (Rein Sistemas)**. É uma camada comercial sobre o ERP: o ERP é a fonte da verdade de clientes, produtos, preços e pedidos; o app lê pela **API Rein**, guarda um espelho local e adiciona carteira por vendedor, priorização, agenda de contatos, funil de leads, pós-venda e indicadores.

- **Primeiro cliente (tenant piloto):** AC3 Informática (Augusto Rodrigues; matriz Curitiba/PR, filial Itajaí/SC; ~1.000 revendedores; 4 vendedores; vendas pelo WhatsApp).
- Idioma da UI, mensagens, erros e commits: **português do Brasil**, tom simples. Identificadores no código em **inglês** (termos do ERP — `pessoa`, `pedido` — ficam como são nos tipos da Rein). Rodapé/telas públicas: "Um produto Grupo Semeia Digital".
- Uso real: celular dos vendedores (PWA) e WhatsApp. Toda tela funciona em 360–400 px.

## Documentos
| Arquivo | Quando ler |
|---|---|
| `docs/01-produto-mvp.md` | Escopo, personas, histórias, telas, critérios de aceite |
| `docs/02-api-rein.md` | Qualquer código que chame a API Rein (HMAC, endpoints, lacunas ⚠️ VALIDAR) |
| `docs/03-arquitetura.md` | Sync, regras de negócio (ABC, status, score, agenda). **Stack/Prisma/pg-boss desatualizados** — vale esta página |
| `docs/04-roadmap.md` | Ordem de implementação; marque `[x]` ao concluir |
| `docs/05-deploy.md` | Publicar, backup, checklist do piloto |

## Stack (Cloudflare — mesma do AroCerto)
- **Um Worker** (`wrangler.jsonc`): API Hono em `/api/*` + SPA React (Vite, `dist/`) com fallback SPA. `run_worker_first: ["/api/*"]`.
- **D1** `semeia-leads` (binding `DB`, id `41fa0c8d-488a-47ff-a20f-05bbb66ef05f`). Migrações em `migrations/` (`npm run db:local` / `db:remote`). Nunca editar migração já aplicada — criar `0002_...sql`.
- Jobs do sync: **Cron Triggers** (+ Queues se precisar de fan-out). Sem Redis, sem Postgres.
- Imagens de produto: **R2** `semeia-leads-imagens` (binding `IMAGENS`), índice em `product_images`.
- Validação com zod (a adicionar junto com os métodos tipados do cliente Rein), testes com **vitest**.
- Não mexer em outros Workers/bancos da conta Cloudflare (`semeia-api`, `semeia-classificados`, `arocerto`).

## Regras inegociáveis
1. **Multi-tenant — regra nº 1.** Toda tabela de negócio tem `tenant_id`. **Toda query filtra por `tenantOf(c)`** (vem da sessão, nunca do corpo). UPDATE/DELETE sempre com `WHERE id=? AND tenant_id=?`. IDs vindos do cliente (conta, produto, vendedor) devem ser conferidos como da empresa. Vendedor só vê `owner_id = eu`.
2. **Credenciais Rein só no backend.** `client_secret` fica criptografado (AES-GCM, `SECRETS_KEY` do Worker) em `tenant_rein`, nunca volta ao navegador nem entra em log/auditoria.
3. **Toda chamada à Rein passa por `worker/rein/client.ts`.** Nada de `fetch` solto para a Rein.
4. **Escrita no ERP protegida por flag por empresa** (`tenant_rein.pessoa_write_enabled`, `pedido_write_enabled`; padrão desligado). Pedido tem efeito fiscal — só ligar após homologar. Com a flag desligada, grava local como pendente e avisa o vendedor.
5. **O app não é fonte da verdade do ERP.** Tabelas espelho só são alteradas pelo sync; dados próprios (carteira, leads, tarefas, interações, NPS) em tabelas próprias.
6. Itens ⚠️ VALIDAR de `docs/02-api-rein.md` são hipóteses: implemente atrás de config e escreva teste de contrato.
7. LGPD: não exportar contatos em massa sem papel `manager`/`admin`; auditar exportações (`audit_log`). Custo e margem nunca chegam ao vendedor. Não colocar dados pessoais em URL.

## Autenticação e papéis
PBKDF2-SHA256 100k; cookie `semeialeads_sessao` (HttpOnly, Secure em HTTPS, SameSite=Lax, 30 dias); `sessions` guarda o SHA-256 do token. Papéis por empresa em `members`: `admin` (dono da conta), `manager` (gestor), `seller` (vendedor). **Só o `admin` (na AC3, o Augusto) troca cliente ou lead de carteira** (`requireRole()` sem papéis = só admin); gestor vê tudo mas não troca. Usuário pode estar em várias empresas (`/api/auth/switch-tenant`). Convites: `/convite/<token>` (7 dias, banco guarda hash). **Recuperação de senha:** `/esqueci` → `POST /api/auth/esqueci` (resposta sempre igual; 3/h por usuário e 10/h por IP; token de 32 bytes, 1 h, banco guarda o hash em `password_resets`) → e-mail com `/redefinir/<token>` → `POST /api/auth/redefinir/:token` (uso único, senha ≥ 8, **apaga todas as sessões** do usuário, não faz login sozinho). E-mail: `worker/email.ts` (Resend; sem `RESEND_API_KEY`+`EMAIL_FROM` fica desligado; `EMAIL_PROVIDER=console` só em dev), textos em `worker/domain/emails.ts`; link usa `APP_URL` ou a origem da requisição. **Avisos por e-mail** (`worker/notify.ts`, `notificarGestores`; migração 0011): vão para admin/gestor com `members.notify_email=1` (liga/desliga em Minha conta; `PATCH /api/auth/preferencias`), nunca derrubam a operação, deduplicam por chave em `notifications_sent`. Eventos: nota NPS ≤ 6, lead novo pelo site (máx. 10/h), troca de vendedor que falhou no ERP, e só para o admin: pagamento em atraso (webhook Asaas), falha do sync agendado (1×/dia), teste grátis acabando (≤ 3 dias). **Notificações no aparelho (Web Push)** (`worker/push.ts`, `routes/push.ts`, `public/sw.js`, migração 0013): os mesmos eventos chegam também como notificação para quem ligou em Minha conta → "Ligar notificações neste aparelho" (admin/gestor da empresa). Protocolo escrito à mão com WebCrypto (VAPID ES256 + aes128gcm, RFC 8291), **conferido contra a biblioteca http_ece**; só aceita endereços de push do Google, Mozilla, Apple e Windows (o servidor chama o endereço que o navegador informa). Chaves: `VAPID_PUBLIC_KEY` em `vars` e **`VAPID_PRIVATE_KEY` como secret** (gerar com `node scripts/gerar-vapid.mjs`; nunca commitar a privada); sem elas o recurso fica desligado. 404/410 do serviço apagam a inscrição. No iPhone só funciona com o app instalado na tela inicial.
**Minha conta** (`src/pages/Conta.tsx`, clique nas iniciais): trocar senha (`POST /api/auth/senha`: pede a atual, encerra as outras sessões), avisos por e-mail e notificações no aparelho.
**Conta só da plataforma:** e-mail em `ADMINS` que não pertence a nenhuma empresa entra com `sessions.tenant_id` NULL (migração 0012); `Session.tenantId` vira `''` e o middleware `soComEmpresa` só deixa passar `/api/admin` e `/api/push` (o resto responde 403); o front mostra `ShellPlataforma` (só Todas as empresas, Minha conta, Ajuda). Quem não é administrador da plataforma continua precisando de uma empresa para entrar. Administradores da plataforma: e-mails em `ADMINS` (`wrangler.jsonc`) — veja **Administração da plataforma** abaixo.
Cadastro novo = **teste grátis de 14 dias** com tudo liberado (`plan='trial'`); depois vale o plano contratado (`tenants.tier`). **Planos (aprovados pelo Neto, `worker/plans.ts`):**

| Plano | Preço/mês | Vendedores | Clientes | Conteúdo |
|---|---|---|---|---|
| Essencial (nível 1) | R$ 249,90 | 2 | 500 | Carteira, agenda do dia, ficha do cliente, WhatsApp em 1 toque |
| Profissional (nível 2) | R$ 449,90 | 5 | 2.000 | + catálogo com preço da tabela, pré-pedido, funil de leads, pós-venda e NPS |
| Distribuidor (nível 3) | R$ 799,90 | 15 | sem limite | + painel do gestor, redistribuição de carteira, várias filiais, suporte prioritário |

Vendedor adicional R$ 59,90/mês; anual = 10 × mensal (2 meses grátis); sem taxa de implantação; **sem desconto de fundador** (decisão do Neto). "Vendedor" = membro com papel `seller`. Limite de vendedores é imposto no servidor (`assertVagaVendedor`); limite de clientes é só aviso — **dados nunca são apagados**. Gating de funções por plano: `requireNivel(n)` (`worker/lib.ts`) quando as funções existirem. Cobrança: ver **Cobrança** abaixo. Plataforma: `PATCH /api/admin/tenants/:id` (só `ADMINS`) muda tier/situação/vendedores extras.

## Convenções
Dinheiro em centavos (inteiro) ou decimal — nunca float. Datas no banco em UTC; exibir em `America/Sao_Paulo`. Erros: `throw fail(status, 'mensagem em português')` → `{ erro }`. Regra de negócio nova vai em módulo puro (`worker/domain/`, sem I/O) com teste antes de usar na API. Commits pequenos, em português e no imperativo.

## Comandos
```bash
npm install
npm run db:local && npm run dev   # build do front + wrangler dev (precisa de .dev.vars com SECRETS_KEY)
npm run dev:web                   # Vite com proxy para o Worker (porta 8787)
npm run typecheck && npm test && npm run build   # precisam passar antes de commit
npm run db:remote                 # migrações no D1 de produção
npx wrangler secret put SECRETS_KEY   # openssl rand -base64 32
```

## Carteira (`worker/domain/carteira.ts`, `worker/metrics.ts`, `worker/routes/accounts.ts`)
- Regras puras e testadas: status (≤90 ativo, ≤180 em risco, senão inativo, sem pedido = prospect), curva ABC (20% A / 30% B / resto C entre quem faturou nos últimos 12 meses), frequência de contato (A7 B14 C30; em risco/inativo usam o menor entre a curva e 15/45 dias), score 0–100 (curva + atraso + recompra prevista + risco), agenda do dia, positivação. Parâmetros padrão em `PARAMS_PADRAO`, sobrescritos por `settings.params`.
- `accounts` guarda dono (`owner_id`) e métricas por cliente do ERP. `recomputeAccounts` recalcula tudo; a regra do dono está em `donoDaConta` (veja **Carteira e ERP** abaixo). Ligação vendedor do app ↔ vendedor do ERP em Configurações → Equipe. `ownership_history` registra trocas (`by_user_id='erp'` quando o ERP mudou).
- Vendedor só enxerga `owner_id = ele` (lista e ficha, 404 fora disso); gestor/admin veem tudo; **só o admin move clientes**. Ficha nunca traz custo/margem.

## Carteira e ERP (`worker/domain/carteira-erp.ts`, `worker/carteira-erp.ts`) — decisão do Augusto/Neto
- **O ERP manda na carteira.** Com `settings.pessoa_erp.campoVendedor` configurado (nome do campo da pessoa no ERP que guarda o vendedor — **vazio por padrão**, ⚠️ pergunta 11 da Rein), o vendedor vem desse campo (`rein_pessoas.raw`) e, se mudar no ERP, o app acompanha. Sem o campo: o dono já definido não muda sozinho e só conta sem dono recebe o vendedor do último pedido (semente).
- **Só o admin troca carteira** (`POST /api/accounts/reassign`, `PATCH /api/leads/:id` com `dono`). Trocar o lead de um cliente do ERP **é** trocar a carteira do cliente.
- **Toda troca vai para o ERP:** `trocarDonoContas` grava histórico, enfileira em `owner_erp_sync` (uma troca ativa por cliente) e leva os leads abertos junto (`alinharLeadsComCarteira`). `processarVendedorErp` (cron + botão em Configurações) lê o cadastro atual, troca só o campo do vendedor e faz `POST /pessoa/{id}` **uma vez**; só roda com campo configurado **e** `pessoa_write_enabled` ligado. Falha ao ler não grava e tenta de novo (3x); falha ao gravar vira `ERRO` sem repetir (o admin confere no ERP e resolve). Depois de enviar, o espelho local é atualizado na hora (`json_set`), senão o recálculo leria o vendedor antigo e desfaria a troca; enquanto há troca pendente o ERP antigo não sobrescreve a escolha do admin.
- ⚠️ O corpo do POST é o cadastro atual com o campo trocado (o POST pode ser total); nome do campo, tipo do valor (id do usuário do ERP) e se o POST aceita o objeto lido do GET são hipóteses até a Rein confirmar.

## Agenda, contato e pós-venda (`worker/domain/contato.ts`, `routes/agenda.ts`, `tasks.ts`)
- `GET /api/agenda` junta contas com contato vencido + tarefas vencidas (`agendaCompleta`, pura): um item por cliente, tarefa manda no motivo e eleva o score (Tratar insatisfação 100, pós-venda 60, NPS 50). Responsável = dono ATUAL da conta; cliente sem dono só aparece para gestor (`?escopo=todos`). A resposta já traz a mensagem de WhatsApp renderizada.
- Registrar contato (`POST /api/accounts/:id/interactions`): resultado obrigatório; define `reschedule_at` (orçamento +3 d, não respondeu +2 d, sem interesse +30 d, reagendar = data, vendeu = frequência normal); "não respondeu" mantém a tarefa aberta e adia 2 dias, os demais concluem. Clique no WhatsApp só entra no histórico, não conta como contato.
- Tarefas `POS_VENDA_D1`/`NPS_D7` nascem no fim de cada sync para pedidos dos últimos 10 dias (idempotente por `dedupe_key`; a carga de 24 meses não inunda a agenda). NPS: `/nps/:token` (público, 192 bits, uma resposta); nota ≤ 6 cria `TRATAR_NPS`. Recompra/reativação são motivos da agenda, não tarefas.
- Modelos de mensagem por empresa (`message_templates`, variáveis `{{contato}} {{vendedor}} {{empresa}} {{produto}} {{link}}`), criados na primeira leitura e editáveis em Configurações.

## Catálogo e pré-pedido (`routes/catalogo.ts`, `routes/prepedidos.ts`, `domain/pedido.ts`)
- Plano Profissional (nível 2) ou acima (`requireNivel(2)` em `/catalogo` e `/pre-pedidos`); conta suspensa é barrada em tudo que usa `requireNivel`.
- Catálogo mostra o preço da **tabela do cliente** (`rein_pessoas.price_table_id` → `rein_precos`); sem cliente escolhido não há preço. Vendedor só consulta cliente da própria carteira. Nunca sai custo/margem.
- **O preço nunca vem do navegador**: o servidor refaz o preço de cada linha na tabela do cliente ao criar/editar (`precificar`) e grava no pedido (`pre_order_items`). Quantidade é inteira de 1 a 99.999, sem produto repetido, até 200 linhas. Vendedor só enxerga os pré-pedidos que montou; gestor vê todos.
- Envio ao ERP (`POST /api/pre-pedidos/:id/enviar`): com `pedido_write_enabled` desligado vira `PENDENTE_FLAG` (resumo para copiar). Ligado: exige a configuração do pedido (`settings.pedido_erp`: CodOrigem, canal "App Carteira", natureza, uso, presença, meio de pagamento, prazo) e o vendedor ligado ao ERP; reserva `ENVIANDO` antes de chamar a Rein e **nunca repete** (`reinFetch` só repete GET). Em erro vira `ERRO` com aviso de conferir no ERP antes de reenviar; o gestor resolve com `/resolver`. Modo de teste "envia" com id fictício.
- ⚠️ Todos os valores do corpo do `PUT /pedido` são hipóteses até a Rein confirmar (pergunta 9 de `docs/02-api-rein.md`).

## Leads (`worker/domain/leads.ts`, `worker/leads.ts`, `routes/leads.ts`, `routes/publico.ts`)
- Plano Profissional (nível 2) ou acima (`requireNivel(2)` em `/leads`; o formulário público some para quem não tem o plano ou está suspenso, com a mesma resposta de "não existe").
- Criação (`criarLead`) valida CNPJ (dígitos verificadores), WhatsApp e contato; consulta a BrasilAPI (só 14 dígitos válidos, timeout 4 s, falha nunca bloqueia); **quem atende é o vendedor da carteira do CNPJ** (ERP/app, `escolherDonoLead`); só sem carteira vale o vendedor escolhido pelo admin, quem cadastrou (vendedor) ou o **rodízio circular** entre vendedores ativos (ponteiro em `settings.lead_rodizio`). Lead de cliente do ERP segue a carteira dele. Índice único parcial garante **um lead aberto por CNPJ por empresa**, mesmo com envios simultâneos.
- **Privacidade do formulário público:** a resposta é sempre `{ok:true}`, seja lead novo, repetido ou CNPJ que já é cliente. Nunca revelar a carteira da empresa a quem preenche. Cadastro manual, ao contrário, avisa (409) "já é cliente de X" / "já existe lead aberto com Y". Lead de CNPJ que já era cliente nasce com `existing_client=1`, vai para o dono da conta e **não converte sozinho**.
- Funil: `validarTransicao` (convertido só pelo sistema e não sai; perdido exige motivo e só reabre como Novo). Follow-up: Novo vence na hora, depois +2/+3 dias; aparece em "Leads para acompanhar" na tela Hoje. Vendedor só vê/mexe nos leads dele; **só o admin troca o dono** (e isso vai para o ERP).
- Conversão (`convertLeads`, no fim de cada sync): liga o lead ao cadastro do ERP pelo CNPJ e, no primeiro pedido não cancelado, vira `CONVERTIDO`. **O ERP vence:** o vendedor do lead só assume o cliente se a conta ainda estiver sem dono (`donoNaConversao`), e então a troca vai para a fila do ERP.
- Cadastro no ERP (`POST /api/leads/:id/push-erp`): mesmo padrão de segurança do pedido (trava `pessoa_write_enabled`, config `settings.pessoa_erp`, `ENVIANDO` reservado, nunca repete, gestor resolve com `/erp-resolver`). ⚠️ Id do tipo "Prospect" e campos obrigatórios do `PUT /pessoa` são hipóteses até a Rein confirmar.

## Tema claro/escuro (`src/tema.ts`, tokens em `src/styles.css`)
- Padrão = tema do sistema; botão lua/sol no topo guarda a escolha em `localStorage` (`semeialeads_tema`). `index.html` aplica o tema antes de pintar (sem piscar). Tema claro = `:root[data-theme="light"]` redefinindo os mesmos tokens (`--bg`, `--ink`, `--accent`…). **Barra lateral e painel esquerdo do login ficam escuros nos dois temas** e usam o ciano vivo (`--accent` redefinido dentro deles). Não use cores fixas (`#fff`, `#000B1A`) em tela nova: use os tokens. A landing (`public/inicio.html`) e as telas públicas do cliente final têm estilo próprio.

## Ajuda dentro do app (`src/pages/Ajuda.tsx`)
- Menu "Suporte → Ajuda" (`/ajuda/:tema`) e botão "?" no topo, que abre o assunto da tela atual (`temaDaRota`). Um assunto por tela + "Por onde começar" e "Palavras do sistema"; gestor/admin e administrador da plataforma veem os assuntos extras. Texto em `TEMAS` (português simples). **Mudou uma tela? Atualize o assunto dela aqui** (`src/ajuda.test.ts` confere ids e o mapa rota → assunto).

## Página de apresentação (`public/inicio.html`, `worker/index.ts`)
- `GET /` (por isso `"/"` está em `run_worker_first`): sem sessão serve `/inicio` (HTML estático, identidade Semeia, mobile-first); com sessão, ou abrindo por `/?origem=app` (`start_url` do PWA), serve o app. `cache-control: no-store` + `Vary: Cookie`. Botões levam a `/entrar` e `/entrar?criar=1`. `robots.txt` bloqueia `/api/`, `/nps/`, `/convite/`, `/seja-revendedor/` e `/entrar`.
- **Preços, limites e regras da página são conferidos por teste** (`worker/landing.test.ts` lê `public/inicio.html` e compara com `worker/plans.ts`): mudou plano ou preço, o teste falha até a página acompanhar. O teste também barra promessas que o app não cumpre (envio automático de WhatsApp, robô, IA) e texto de preenchimento esquecido. Mantenha as afirmações da página verdadeiras (ex.: gravação no ERP "só se quiser e depois de validar").

## Imagens de produto (`worker/domain/imagens.ts`, `worker/sync/imagens.ts`, `routes/imagens.ts`)
- As fotos vêm em base64 dentro do cadastro do produto (`ProdutoGrade[].ProdutoImagem`). `nProduto` as separa do `raw`; o sync grava até 3 por produto no R2 (`<empresa>/<produto>/<pos>-<hash>.<ext>`) e o índice no D1. **Só regrava quando o conteúdo muda** (hash SHA-256 = ETag) e apaga o arquivo antigo se a foto trocou. Até 20 gravações por página do sync; o que passar entra na próxima sincronização (`imagensAdiadas` nas estatísticas).
- **Segurança:** o tipo vem do conteúdo (assinatura dos primeiros bytes), não do nome nem do tipo declarado; só JPEG, PNG e WEBP, até 3 MB (SVG, GIF, HTML etc. são ignorados, `imagensIgnoradas`). A chave do R2 é montada no servidor com a empresa da sessão; `GET /api/imagens/:produtoId[/:pos]` (plano Profissional+, login) consulta o índice da empresa e responde com `nosniff` e `Content-Security-Policy: sandbox`, `ETag` e cache privado de 1 dia.
- Não apagamos fotos de produto que sumiram do ERP (a listagem pode vir "magra"); arquivos órfãos ficam. ⚠️ Pergunta à Rein: o `GET /produto` (lista) devolve as imagens em base64 de todos os produtos, o que é pesado; pedir listagem sem binário ou endpoint de imagem.

## Administração da plataforma (`worker/routes/admin.ts`, `domain/plataforma.ts`, `src/pages/Admin.tsx`)
- Menu "Plataforma → Todas as empresas" (`/admin`) só para e-mails em `ADMINS`; quem não é admin da plataforma recebe 404. A conta do administrador pode ou não pertencer a uma empresa (sem empresa, só enxerga esta tela).
- Mostra por empresa: dono, equipe, nº de clientes, último login (aprox.), situação calculada (teste / ativa / suspensa / bloqueada e o motivo), plano, cobrança (status, valor, pago até), estado do ERP (modo de teste/conectado, escrita ligada, última sync, erro) e, no topo, receita mensal recorrente (anual ÷ 12), teste acabando e atrasos.
- **Não abre clientes, pedidos, leads, preços nem custos de nenhuma empresa** (só contagens e estado da conta; há teste conferindo as chaves devolvidas). Ações: estender teste (1–90 dias), liberar sem cobrança (`plan='ativo'` manual, para piloto/cortesia), suspender/reativar, ajustar plano e vendedores extras. Toda mudança vai para o `audit_log` da empresa com quem fez.

## Cobrança dos planos — Asaas (`worker/routes/assinatura.ts`, `worker/billing.ts`, `worker/asaas.ts`, `domain/cobranca.ts`)
- O administrador escolhe plano + vendedores adicionais + ciclo (mensal, ou anual = 10 × mensal) + CPF/CNPJ → `POST /api/assinatura` cria cliente e assinatura na Asaas (`billingType: UNDEFINED`: Pix, boleto ou cartão na página da Asaas) e devolve o link da cobrança. **CPF/CNPJ vai só para a Asaas, não é guardado.** Primeira cobrança = fim do teste grátis (ou hoje, se já acabou).
- **O plano só vale com o pagamento confirmado** (webhook `POST /api/asaas/webhook`, cabeçalho `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`, comparado em tempo constante; ignora cobranças de assinaturas que não são nossas; idempotente). Assinatura já ativa que troca de plano/vendedores: vale na hora e o valor novo entra na próxima cobrança; trocar mensal↔anual só cancelando. "Já paguei, atualizar" (`/atualizar`) reconcilia com a Asaas se o webhook não chegou.
- **Acesso calculado na hora** (`acessoLiberado`, sem rotina diária): teste grátis livre até acabar (aviso nos últimos 3 dias); ativo sem assinatura (liberado à mão pelo suporte) livre; assinatura paga até `paid_until` (vencimento + 1 ciclo) **+ 10 dias de tolerância** (aviso de atraso); cancelada vale só até o fim do período pago. Sem acesso: middleware `exigirContaLiberada` responde **402** em tudo menos `/api/assinatura` e `/api/admin`; `/api/auth/me` traz `plano.bloqueado/motivo/mensagem` e o app mostra só a tela Plano e pagamento. **Dados nunca são apagados.** Conta suspensa pelo suporte (`plan='suspenso'`) também bloqueia.
- Segredos: `ASAAS_API_KEY` (chave de teste `$aact_hmlg_…` usa o sandbox sozinha) e `ASAAS_WEBHOOK_TOKEN`; `ASAAS_URL` em `vars`. Webhook a cadastrar na Asaas: `https://<domínio>/api/asaas/webhook` com os eventos de cobrança e de assinatura. Para o piloto da AC3 sem cobrança, o suporte coloca `plan='ativo'` (`PATCH /api/admin/tenants/:id`).

## Painel, parâmetros e redistribuição (`routes/painel.ts`, `routes/parametros.ts`, `domain/painel.ts`)
- **Painel do gestor** (`/api/painel`, `/api/painel/comparativo`): plano Distribuidor (nível 3), só gestor/admin. Faturamento, pedidos, ticket, positivação (clientes que compraram ÷ carteira), série de 12 meses, por vendedor, leads por etapa, NPS (promotores − detratores, últimos 90 dias) e comparativo 60 dias × 60 dias anteriores (baseline do piloto; "reativado" = voltou após > 180 dias parado). Meses e janelas no fuso de Brasília. **Vendas contam para o vendedor da carteira ATUAL do cliente.** Nunca expõe custo/margem. Gráfico: uma série só (cor de destaque), colunas ≤ 24 px com topo arredondado, dica ao passar o mouse/foco e visão em tabela; números de destaque são cartões, não gráfico.
- **Parâmetros** (`/api/parametros`, gestor): dias de ativo/em risco, tamanho da agenda, fator de recompra e frequência por curva/status em `settings.params`; `validarParamsEditaveis` recusa fora da faixa (não corrige em silêncio) e salvar recalcula a carteira.
- **Redistribuição em massa por filtro** (`POST /api/accounts/reassign-filtro`): só admin, plano Distribuidor; prévia antes de confirmar; até 2.000 clientes; mesma regra de histórico e fila do ERP da troca individual. A troca individual/seleção continua em todos os planos (só admin).
- PWA: `public/manifest.webmanifest` + `public/sw.js` (instalável; o service worker **não faz cache**, de propósito: dados de clientes só vêm do servidor, com login). CI em `.github/workflows/ci.yml`. Backup e publicação: `docs/05-deploy.md`.

## Sync com o ERP (`worker/sync/`, `worker/rein/`)
- `ReinApi` (`worker/rein/api.ts`) é a única interface que o sync conhece; implementações real e mock (`mock.ts`, "modo de teste" por empresa). Nomes de campos da Rein ficam **só** em `normalize.ts` (⚠️ hipóteses; ajustar lá quando a Rein confirmar). Datas sem fuso da Rein são tratadas como Brasília (`ERP_UTC_OFFSET_HOURS`).
- Espelho `rein_*` (migração 0002): só o sync escreve. `rein_precos.cost/margin` são sensíveis — nunca devolver ao vendedor. `raw` não guarda imagens nem margens.
- Jobs: `backfill` (manual, 1x), `cadastros` (diário 02h Brasília), `pedidos` (janela de 3 dias, a cada 15 min). Cada chamada a `runSlice` faz no máximo 25 chamadas à Rein e salva o cursor em `sync_state`; o navegador (`POST /api/sync/:job/run`) ou o cron repetem até `done`. Trava `lease_until` evita duas fatias ao mesmo tempo.
- Pedidos: a lista pode vir sem itens → fila `items_synced=0` buscada por `/pedido/{id}` (2 em paralelo). Registro que some do ERP só ganha `deleted_at` após 2 syncs completos sem aparecer.

## Onde paramos
**Todo o código planejado está pronto** (Sprints 0–7 + cobrança Asaas, administração da plataforma, imagens de produto, página de apresentação, recuperação de senha, avisos por e-mail, ajuda dentro do app, tema claro/escuro), testado só com o modo de teste (dados de exemplo). Migrações 0001–0013 aplicadas no D1 de produção.

**Já no ar:** Worker `semeia-leads` publicado em https://semeia-leads.gruposemeiadigital.workers.dev (conta Cloudflare Grupo Semeia, plano **Workers Paid** — o gratuito limita a 5 crons e já estavam usados). Deploy automático pelo **Workers Builds** a cada push na branch `claude/festive-maxwell-x44qge` (build `npm run build`, deploy `npx wrangler deploy`, token próprio "semeia-leads build token"). Administradores da plataforma (`ADMINS`): `alcyjvneto@gmail.com` e `gruposemeiadigital@gmail.com`.
**Empresa de demonstração em produção** ("Grupo Semeia Digital (demonstração)", id `4aae3d4b-2055-4d12-8987-87a489ffd735`, plano Distribuidor/ativo, ERP em modo de teste): conta só da plataforma (`gruposemeiadigital@gmail.com`, **sem vínculo com a empresa** desde 08/10/2026; para ver os dados da demonstração use `admin@exemplo.semeia.test`), admin da empresa (`admin@exemplo.semeia.test`), gestor (`gestor@exemplo.semeia.test`), vendedores `carlos|mariana|rafael|juliana@exemplo.semeia.test` e 8 leads de exemplo. **Senhas não ficam no repositório** (foram passadas ao Neto na conversa; sem e-mail real, a recuperação de senha não funciona para as contas `@exemplo.semeia.test`). Clientes, produtos e pedidos de exemplo só existem depois da "Carga inicial" em Configurações → Sincronização. Apagar ou trocar essas contas antes de usar a empresa com dados reais.
**Manual de apresentação para o Augusto:** página privada no claude.ai (https://claude.ai/artifact/7Pv6UNGFcqd8Ct1w3R62ZJ); compartilhar pelo menu Compartilhar. Precisa ser atualizado se planos, preços ou telas mudarem.

**O que falta (depende de pessoas/contas — nenhuma linha de código pendente):**
1. **Secrets e variáveis do Worker** (Settings → Variables and Secrets; `docs/05-deploy.md`): `SECRETS_KEY` (obrigatório para conectar a Rein real; guardar cópia), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`. Domínio próprio em Domínios & Rotas.
2. **Webhook na Asaas**: `https://<domínio>/api/asaas/webhook` com os eventos de cobrança e assinatura e o mesmo token.
3. **E-mail (Resend)**: conta com domínio verificado. Sem isso nenhum e-mail sai (senha e avisos).
4. **Piloto AC3**: criar a conta do Augusto e, antes do fim do teste de 14 dias, `plan='ativo'` via `PATCH /api/admin/tenants/:id`, senão a conta é bloqueada. Condições comerciais do piloto: a combinar com o Neto.
5. **Rein**: enviar as perguntas de `docs/02-api-rein.md` (§6 e 11, 12, 13); obter credenciais reais; ajustar `normalize.ts`/`api.ts` (paginação, datas, formato das listas) com a primeira resposta real.
6. **Homologar escritas no ERP** (`pessoa_write_enabled`, `pedido_write_enabled` seguem desligadas; pedido tem efeito fiscal).
7. **Carga inicial (backfill)**, piloto com 1 vendedor e baseline das métricas.
8. **Notificações no aparelho:** cadastrar o secret `VAPID_PRIVATE_KEY` no Worker (a chave pública já está em `wrangler.jsonc`). Sem ele o botão avisa que ainda não está ativo.
