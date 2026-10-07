# API Rein Sistemas (ERP Ctrl-e) — referência para o projeto

Fontes: documentação https://api.rein.net.br/doc/ e Postman Collection
https://api.rein.net.br/postman/reinsistemas_postman_collection.json (environment exportado em 08/2025).
Suporte Rein: (41) 3077-5497 · https://ajuda.reinsistemas.com.br/contato

Legenda: ✅ documentado · ⚠️ VALIDAR = hipótese, confirmar com a Rein ou em teste de homologação.

---

## 1. Autenticação (HMAC-SHA256) ✅

Credenciais fornecidas pela Rein (obtidas no "core"): `ClientId`, `ClientSecret`, `Database`.
`BaseUrl = https://api.rein.net.br`. HTTPS obrigatório. Token vale **no máximo 15 minutos**.

Para **cada requisição**:

```
timestamp  = unixSecondsNow + 300            // expiração futura (padrão 300 s; máx. 900 s)
dataToSign = `${endpoint}.${database}.${timestamp}`   // endpoint = caminho, ex.: "/api/v1/produto"
token      = HMAC_SHA256(key = ClientSecret, data = dataToSign) → hex (minúsculo)
```

Headers obrigatórios:

| Header | Valor |
|---|---|
| `Token` | hash hex calculado |
| `Database` | nome da base |
| `Timestamp` | o mesmo timestamp usado na assinatura |
| `ClientId` | client id |
| `Content-Type` | `application/json` |

⚠️ VALIDAR:
- Rotas com id (`/api/v1/pessoa/123`): o `endpoint` assinado inclui o id? (hipótese: **sim**, caminho completo).
- Querystring (`?page=2&termo=x`) entra na assinatura? (hipótese: **não**, só o caminho).
- Implementar ambas as variações atrás de config (`REIN_SIGN_INCLUDE_QUERY=false`) e testar na primeira chamada real.

Implementação de referência: `docs/reference/rein-auth.ts`.

---

## 2. Convenção de verbos (atenção: incomum) ✅

| Ação | Verbo |
|---|---|
| Listar / consultar | `GET` |
| **Cadastrar (criar)** | **`PUT`** na coleção (`/api/v1/recurso`) |
| **Atualizar** | **`POST`** no item (`/api/v1/recurso/{id}`) |

Não há `DELETE` documentado.

---

## 3. Endpoints

Prefixo: `/api/v1`. Paginação: query `page` (⚠️ VALIDAR tamanho da página, base 0 ou 1, e formato da
resposta — total/próxima página). Busca textual: query `termo`.

### 3.1 Pessoa (clientes/fornecedores) — núcleo do app

| Método | Rota | Query |
|---|---|---|
| GET | `/pessoa` | `termo` (nome), `page` |
| GET | `/pessoa/{id}` | — |
| PUT | `/pessoa` | — (cadastrar) |
| POST | `/pessoa/{id}` | — (atualizar) |

Campos de cadastro (PUT): `InscricaoEstadual`, `Nome`, `RazaoSocial`, `Cnpj`, `Observacao`,
`ObservacaoFiscal`, `PerfilFornecedor`, `TipoPessoa` (`"J"`), `TipoCliente: [{Id, Nome}]`.

Campos de atualização (POST) — os mais úteis para o app:
- Identificação: `Nome`, `RazaoSocial`, `Cnpj`, `Cnae`, `InscricaoEstadual`, `InscricaoMunicipal`, `TipoPessoa`, `Crt`, `IndicadorInscricaoEstadual`
- Contato: `Fone`, `Whatsapp`, `Celular`, `EmailFinanceiro`, `EmailFiscal`, `EmailMalaDireta`, `Site`
- Comercial: `CanalVendaId`, `TabelaPrecoPadrao`, `LimiteDeCredito`, `PrazoLimiteCredito`, `CreditoDevolucao`, `CondicaoPagamentoBloqueado[]`, `TipoCliente[]`, `UsuarioTecnicoId`
- Datas: `DataCadastro`, `DataFundacao`, `DataUltimaModificacao`
- Endereços `CadastroGeralEndereco[]`: `Id, Municipio, Estado, PaisId, Identificador, Logradouro, Numero, Bairro, Complemento, Cep, Principal, Entrega, Retirada, Cobranca, Observacao`

⚠️ VALIDAR: o POST é parcial (merge) ou substitui o registro inteiro? Até confirmar, **sempre fazer GET,
mesclar e enviar o objeto completo**. Formato das datas.

### 3.2 Usuário (vendedores)

| GET | `/usuario` | `termo`, `page` |

Usado para mapear `usuario.Id` ↔ usuário do app (é o `CodVendedor` dos pedidos — ⚠️ VALIDAR).

### 3.3 Produto

| Método | Rota |
|---|---|
| GET | `/produto` (⚠️ paginação não aparece na collection) |
| GET | `/produto/{id}` |
| PUT | `/produto` |
| POST | `/produto/{id}` (exemplo só atualiza `ProdutoDescricao[]`) |

Campos relevantes para leitura: `Nome`, `CodigoProduto`, `SkuGeral`, `ProdutoMarcaId`, `ProdutoCategoria[{CategoriaId}]`,
`Ncm`, `UrlAmigavel`, `Kit`, `Servico`, `ProdutoDescricao[{Titulo, Descricao, CanalVendaId, Ativo}]`,
`ProdutoGrade[]` (variações/SKU): `Sku, CodigoBarras, Ativo, Principal, EstoqueMinimo, EstoqueMaximo, PesoBruto, Largura, Altura, Comprimento, DataUltimaModificacao`,
`ProdutoGrade[].ProdutoImagem[{OrdemExibicao, NomeArquivo, TipoArquivo, BinarioArquivo}]` (imagem em binário/base64 — ⚠️ VALIDAR),
`ProdutoGrade[].ProdutoMargem[{TabelaPrecoId, PrecoComDesconto, ValorDesconto, TipoDesconto, Margem, UltimoCustoEmReal, ...}]` → **preço por tabela**.

**Custo e margem são sensíveis**: nunca enviar ao front de `VENDEDOR`; só preço da tabela do cliente.

### 3.4 Variação, Categoria, Marca, Unidade, Figura Fiscal

| GET/PUT/POST | `/variacao`, `/variacao/{id}` |
| GET/PUT/POST | `/categoria`, `/categoria/{id}` (campos `Nome, Descricao, CategoriaPaiId, PalavraChave`) |
| GET/PUT/POST | `/marca`, `/marca/{id}` |
| GET/PUT/POST | `/unidade`, `/unidade/{id}` |
| GET | `/figura-fiscal` (`termo` = NCM) |

O app **só lê** estes recursos.

### 3.5 Tabela de Preço

| GET | `/tabela-preco` |

### 3.6 Pedido — base de toda a inteligência da carteira

| Método | Rota | Query |
|---|---|---|
| GET | `/pedido` | `DataMovInicial`, `DataMovFinal`, `TipoMovimento` (1=Compra, **4=Venda**), `Finalizado` (0/1), `CodDestino` (id pessoa), `CpfCnpj` |
| GET | `/pedido/{id}` | — |
| PUT | `/pedido` | — (cadastrar) |
| POST | `/pedido/{id}` | — (atualizar) |

Body (PUT/POST):
```json
{
  "CodOrigem": 0, "CodDestino": 0, "CodEmpresaServico": 0, "CodVendedor": 0, "CanalVendaId": 0,
  "IndicadorPresenca": 0, "CodNatureza": "", "UsoMercadoria": "",
  "Produto":   [{ "IdProduto": 0, "CodProduto": "", "CodTabelaPreco": 0, "QtdProduto": 0, "ValorUnitario": 0 }],
  "Pagamento": [{ "ParcelaId": 0, "CodMeioPagamento": 0, "ValorPagamento": 0, "DataPagamento": "" }]
}
```
Interpretação (⚠️ VALIDAR): `CodOrigem` = empresa emitente (matriz/filial), `CodDestino` = cliente (pessoa),
`CodVendedor` = usuário vendedor, `CanalVendaId` = canal (criar canal **"App Carteira"** no ERP).
⚠️ VALIDAR: formato de data dos filtros; se o GET de lista traz itens e totais ou só cabeçalho
(se só cabeçalho, buscar `/pedido/{id}` para cada pedido novo); se pedidos cancelados aparecem e como identificá-los.

---

## 4. O que NÃO existe na API (lacunas conhecidas)

| Lacuna | Impacto no MVP | Contorno |
|---|---|---|
| Sem webhooks | Não há evento "pedido criado" | Polling de pedidos a cada 15 min (janela móvel) |
| Sem filtro "alterado desde" em pessoa/produto | Sync completo caro | Sync noturno completo + comparar `DataUltimaModificacao` |
| Sem saldo de estoque | Vendedor não vê disponibilidade | MVP mostra "consultar estoque"; pedir endpoint à Rein |
| Sem financeiro/títulos | Sem alerta de inadimplência | Mostrar `LimiteDeCredito`; fase 2 |
| Sem NF-e / rastreio | Pós-venda não mostra nota/entrega | Fase 2 |
| Sem vínculo cliente↔vendedor explícito | — | Carteira controlada **no app**; seed = vendedor do último pedido |
| Rate limit não documentado | Risco de bloqueio | Cliente com concorrência máx. 2, backoff exponencial em 429/5xx |

## 5. Mapeamento para o app

| ERP | App |
|---|---|
| `pessoa` com `TipoCliente` "Prospect" (criar no ERP ⚠️) | `Lead` convertido / cliente sem pedido |
| `pessoa` | `ReinPessoa` (espelho) + `Account` (dados do app: dono da carteira, status, score) |
| `usuario` | `ReinUsuario` ↔ `User` (role VENDEDOR) |
| `pedido` TipoMovimento=4 | `ReinPedido` + `ReinPedidoItem` → métricas RFM/ABC |
| `produto` + `ProdutoMargem` + `tabela-preco` | Catálogo com preço da tabela do cliente |

## 6. Perguntas para a Rein (enviar antes da Sprint 2)

1. Assinatura: endpoint assinado inclui id e/ou querystring? Formato exato do timestamp (segundos)?
2. Paginação: tamanho da página, base, metadados de total; `/produto` e `/pedido` paginam?
3. Formato de datas nos filtros e nos campos.
4. `GET /pedido` (lista) retorna itens e valores? Como identificar pedido cancelado/faturado?
5. Existe endpoint de **saldo de estoque**, **títulos a receber**, **NF-e/XML**, **rastreio**?
6. Existe filtro por data de alteração ou webhooks (atuais ou previstos)?
7. Rate limit por ClientId.
8. `POST /pessoa/{id}` é parcial ou total?
9. Valores válidos de `CodNatureza`, `UsoMercadoria`, `IndicadorPresenca`, `CodMeioPagamento` para venda B2B da AC3; existe ambiente de homologação?
10. Podemos ter uma base de **teste/homologação** (`Database`) separada da produção?
11. **Vendedor da carteira:** qual campo da pessoa guarda o vendedor responsável pelo cliente (`UsuarioTecnicoId`? outro?), que tipo de valor ele aceita (id do usuário) e se o `GET /pessoa/{id}` devolve esse campo. O app lê e grava esse campo para manter a carteira igual ao ERP.
12. `POST /pessoa/{id}` aceita receber o objeto devolvido pelo `GET` com um campo trocado, ou precisa só dos campos alterados? Há campos somente-leitura que o POST rejeita?
