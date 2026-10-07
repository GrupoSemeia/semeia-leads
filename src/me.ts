import { createContext, useContext } from 'react'

export type Me = {
  logado: boolean
  usuario: { id: string; nome: string; email: string; papel: 'admin' | 'manager' | 'seller' }
  empresa: { id: string; name: string; city: string; plan: string }
  empresas: { id: string; name: string; city: string }[]
  trialDias: number | null
  plano: { tier: string; efetivo: string; nome: string; contratado: string; nivel: number; emTeste: boolean; suspenso: boolean; limiteVendedores: number; limiteClientes: number | null
    vendedores: number; clientes: number; preco: number; vendedorExtra: number; extraContratados: number; mesesPagosNoAno: number }
  admin?: boolean
}
export const MeCtx = createContext<{ me: Me; recarregar: () => void } | null>(null)
export const useMe = () => useContext(MeCtx)!
