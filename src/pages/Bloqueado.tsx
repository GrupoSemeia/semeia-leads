import { Link } from 'react-router-dom'
import { Icon } from '../ui'

/** Mostra o aviso de plano quando a API recusa por nível (mensagem começa com "Disponível a partir do plano"). */
export const ehBloqueioDePlano = (erro: string | null | undefined) => !!erro && erro.startsWith('Disponível a partir do plano')
export function Bloqueado({ mensagem }: { mensagem: string }) {
  return <div className="card" style={{ padding: 24, display: 'grid', gap: 10, justifyItems: 'start' }}>
    <Icon n="lock" s={28} /><h3>Recurso de outro plano</h3><p className="muted" style={{ margin: 0 }}>{mensagem} Seus dados continuam guardados. Para mudar de plano, fale com o Grupo Semeia Digital.</p>
    <Link className="btn" to="/configuracoes">Ver meu plano</Link></div>
}
