import { PageHead } from '../ui'

export default function EmBreve({ eyebrow, titulo, texto }: { eyebrow: string; titulo: string; texto: string }) {
  return <><PageHead eyebrow={eyebrow} title={titulo} /><div className="card" style={{ padding: 20 }}><p className="muted" style={{ margin: 0 }}>{texto}</p></div></>
}
