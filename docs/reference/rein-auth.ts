/**
 * Referência: assinatura de requisições da API Rein Sistemas (Ctrl-e).
 * Fonte: https://api.rein.net.br/doc/  — dataToSign = `${endpoint}.${database}.${timestamp}`
 * Mover para packages/rein-client/src/auth.ts na Sprint 1.
 *
 * ⚠️ VALIDAR com a Rein: se `endpoint` inclui id e querystring (ver docs/02-api-rein.md §1).
 */
import { createHmac } from "node:crypto";

export interface ReinCredentials {
  clientId: string;
  clientSecret: string;
  database: string;
  baseUrl?: string; // default https://api.rein.net.br
}

export interface SignOptions {
  /** segundos até expirar; doc usa 300, máximo 900 (15 min) */
  ttlSeconds?: number;
  /** incluir querystring na assinatura? hipótese padrão: false */
  includeQuery?: boolean;
  now?: () => number; // para testes
}

export function signRequest(
  pathWithQuery: string, // ex.: "/api/v1/pessoa?page=2"
  creds: ReinCredentials,
  opts: SignOptions = {},
): Record<string, string> {
  const ttl = Math.min(opts.ttlSeconds ?? 300, 900);
  const nowSec = Math.floor((opts.now ?? Date.now)() / 1000);
  const timestamp = String(nowSec + ttl);

  const endpoint = opts.includeQuery ? pathWithQuery : pathWithQuery.split("?")[0];
  const dataToSign = `${endpoint}.${creds.database}.${timestamp}`;
  const token = createHmac("sha256", creds.clientSecret).update(dataToSign).digest("hex");

  return {
    "Content-Type": "application/json",
    Token: token,
    Database: creds.database,
    Timestamp: timestamp,
    ClientId: creds.clientId,
  };
}

/** Exemplo de uso (GET). Lembrete: criar = PUT na coleção; atualizar = POST no item. */
export async function reinFetch<T>(
  method: "GET" | "PUT" | "POST",
  pathWithQuery: string,
  creds: ReinCredentials,
  body?: unknown,
  opts?: SignOptions,
): Promise<T> {
  const base = creds.baseUrl ?? "https://api.rein.net.br";
  const res = await fetch(base + pathWithQuery, {
    method,
    headers: signRequest(pathWithQuery, creds, opts),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Rein ${method} ${pathWithQuery.split("?")[0]} -> HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
