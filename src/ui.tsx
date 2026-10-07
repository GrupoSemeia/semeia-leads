import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

/* ---------- ícones ---------- */
const P: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  gear: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  money: '<path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.4 4.5 3.2-2 3.3-4.5 3.3-4.5-1.4-4.5-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chat: '<path d="M4 20l1.3-4A8 8 0 1 1 8.2 19z"/><path d="M9 10.5h6M9 13.5h4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  down: '<path d="M6 9l6 6 6-6"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.4 3.2 7.8 7.5 9 4.3-1.2 7.5-4.6 7.5-9V6z"/><path d="M9 12l2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
}
export function Icon({ n, s = 18 }: { n: string; s?: number }) {
  return <svg className="ic" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[n] ?? '' }} />
}
export function Logo({ s = 28 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="3" /><circle cx="20" cy="20" r="11.5" fill="none" stroke="currentColor" strokeWidth="2" />
    {[0, 72, 144, 216, 288].map(a => <path key={a} d="M18.6 14 L17.4 5.5 L22.6 5.5 L21.4 14Z" fill="currentColor" transform={`rotate(${a} 20 20)`} />)}<circle cx="20" cy="20" r="4" fill="#A3FF12" /></svg>
}


export function PageHead({ eyebrow, title, children, back }: { eyebrow: string; title: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return <>{back}<div className="ph"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div><div className="row">{children}</div></div></>
}

/* ---------- modal ---------- */
export function Modal({ titulo, sub, onClose, children, rodape, largo }: { titulo: string; sub?: string; onClose: () => void; children: ReactNode; rodape?: ReactNode; largo?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return <div className="modal-wrap" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${largo ? 'wide' : ''}`} role="dialog" aria-modal="true">
      <div className="mh"><div>{sub && <div className="eyebrow">{sub}</div>}<h3>{titulo}</h3></div><button className="btn ghost sm" onClick={onClose} aria-label="Fechar"><Icon n="x" /></button></div>
      <div className="mb">{children}</div>
      {rodape && <div className="mf">{rodape}</div>}
    </div></div>
}

/* ---------- avisos rápidos ---------- */
const ToastCtx = createContext<(m: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(x => (x === m ? null : x)), 3500) }, [])
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>
}
export const useToast = () => useContext(ToastCtx)

/* ---------- carregar dados ---------- */
export function useApi<T>(caminho: string | null, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!caminho) return
    let vivo = true
    api<T>(caminho).then(d => vivo && (setDados(d), setErro(null))).catch(e => vivo && setErro(e.message))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, n, ...deps])
  return { dados, erro, recarregar: () => setN(x => x + 1), setDados }
}
export const Carregando = ({ erro }: { erro?: string | null }) => <div className="loading">{erro ? <span className="err">{erro}</span> : 'Carregando…'}</div>

export async function copiar(txt: string, toast: (m: string) => void) {
  try { await navigator.clipboard.writeText(txt); toast('Copiado.') } catch { toast('Não consegui copiar automaticamente — selecione o texto.') }
}
