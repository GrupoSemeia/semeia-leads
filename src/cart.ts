import { useEffect, useState } from 'react'

/** Carrinho do pré-pedido, guardado na aba do navegador. Os preços aqui são só para mostrar: o servidor refaz todos ao salvar. */
export type ItemCarrinho = { produtoId: number; nome: string; codigo: string | null; preco: number; qtd: number }
export type Carrinho = { cliente: { id: number; nome: string; whatsapp: string | null } | null; itens: ItemCarrinho[] }
const KEY = 'semeialeads_carrinho', EVT = 'semeialeads:carrinho'
const VAZIO: Carrinho = { cliente: null, itens: [] }

export function lerCarrinho(): Carrinho {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return v && Array.isArray(v.itens) ? v : VAZIO } catch { return VAZIO }
}
export function gravarCarrinho(c: Carrinho) {
  try { sessionStorage.setItem(KEY, JSON.stringify(c)) } catch { /* modo privado: segue só em memória */ }
  window.dispatchEvent(new Event(EVT))
}
export function useCarrinho(): [Carrinho, (c: Carrinho) => void] {
  const [c, setC] = useState<Carrinho>(lerCarrinho)
  useEffect(() => { const f = () => setC(lerCarrinho()); window.addEventListener(EVT, f); return () => window.removeEventListener(EVT, f) }, [])
  return [c, gravarCarrinho]
}
export const totalCarrinho = (c: Carrinho) => c.itens.reduce((s, i) => s + i.qtd * i.preco, 0)
