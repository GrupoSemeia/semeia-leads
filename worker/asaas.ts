/** Cliente mínimo da API da Asaas. `f` é injetável para teste. Chave de teste (`$aact_hmlg_…`) usa o sandbox sozinha. */
import type { Env } from './lib'

export type RespostaAsaas = { ok: true; dados: any } | { ok: false; erro: string }

export const baseAsaas = (env: Pick<Env, 'ASAAS_API_KEY' | 'ASAAS_URL'>) =>
  (env.ASAAS_API_KEY?.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : env.ASAAS_URL || 'https://api.asaas.com/v3').replace(/\/$/, '')

export async function chamarAsaas(env: Pick<Env, 'ASAAS_API_KEY' | 'ASAAS_URL'>, metodo: string, caminho: string, corpo?: unknown, f: typeof fetch = fetch): Promise<RespostaAsaas> {
  try {
    const r = await f(`${baseAsaas(env)}/${caminho}`, {
      method: metodo, signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', access_token: env.ASAAS_API_KEY ?? '', 'user-agent': 'SemeiaLeads' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const dados: any = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, erro: dados?.errors?.map((e: any) => e.description).join(' ') || `Erro ${r.status} na Asaas.` }
    return { ok: true, dados }
  } catch {
    return { ok: false, erro: 'Não foi possível falar com a Asaas agora. Tente de novo em instantes.' }
  }
}
