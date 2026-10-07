/** Tema claro/escuro: escolha da pessoa (guardada neste aparelho) ou, sem escolha, o do sistema. */
export type Tema = 'claro' | 'escuro'
const CHAVE = 'semeialeads_tema'
const COR: Record<Tema, string> = { escuro: '#000B1A', claro: '#F3F6FA' }

export function temaSalvo(): Tema | null {
  try { const v = localStorage.getItem(CHAVE); return v === 'claro' || v === 'escuro' ? v : null } catch { return null }
}
export function temaAtual(): Tema {
  return temaSalvo() ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro')
}
export function aplicarTema(t: Tema) {
  document.documentElement.dataset.theme = t === 'claro' ? 'light' : 'dark'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', COR[t])
}
export function alternarTema(): Tema {
  const novo: Tema = temaAtual() === 'claro' ? 'escuro' : 'claro'
  try { localStorage.setItem(CHAVE, novo) } catch { /* modo privado: vale só nesta visita */ }
  aplicarTema(novo)
  return novo
}
