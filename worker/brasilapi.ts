/** Consulta pública de CNPJ na BrasilAPI. Só recebe 14 dígitos já validados (sem SSRF); falha de rede nunca derruba o cadastro. */
import { cnpjValido, parseBrasilApi, soDigitos, type Enriquecimento } from './domain/leads'

export async function consultarCnpj(cnpj: string, f: typeof fetch = fetch): Promise<Enriquecimento | null> {
  const d = soDigitos(cnpj)
  if (!cnpjValido(d)) return null
  try {
    const r = await f(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' } })
    return r.ok ? parseBrasilApi(await r.json()) : null
  } catch { return null }
}
