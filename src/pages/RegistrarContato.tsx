import { useState, type FormEvent } from 'react'
import { api, RESULTADOS, CANAIS, hojeISO } from '../api'
import { Modal, useToast } from '../ui'

/** Janela para registrar o resultado de um contato. `tarefaId` conclui a tarefa da agenda junto. */
export default function RegistrarContato({ pessoaId, nome, tarefaId, aoFechar, aoSalvar }: { pessoaId: number; nome: string; tarefaId?: string; aoFechar: () => void; aoSalvar: () => void }) {
  const [resultado, setResultado] = useState('VENDEU'), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(''); setOcupado(true)
    const f = new FormData(e.currentTarget)
    try {
      await api(`/accounts/${pessoaId}/interactions`, { body: { canal: f.get('canal'), resultado, nota: f.get('nota'), reagendarPara: f.get('data') || undefined, tarefaId } })
      toast('Contato registrado.'); aoSalvar(); aoFechar()
    } catch (x: any) { setErro(x.message) } finally { setOcupado(false) }
  }
  return <Modal titulo="Registrar contato" sub={nome} onClose={aoFechar}>
    <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
      <label className="fl"><span>Como foi o contato?</span><select name="canal" defaultValue="whatsapp">{CANAIS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="fl"><span>Resultado</span><select value={resultado} onChange={e => setResultado(e.target.value)}>{RESULTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {resultado === 'REAGENDAR' && <label className="fl"><span>Voltar a falar em</span><input name="data" type="date" min={hojeISO()} required /></label>}
      <label className="fl"><span>Observação (opcional)</span><textarea name="nota" maxLength={500} placeholder="Ex.: pediu proposta de 10 SSDs" /></label>
      {erro && <div className="err">{erro}</div>}
      <div className="row"><button className="btn pri" disabled={ocupado}>Salvar</button><button type="button" className="btn" onClick={aoFechar}>Cancelar</button></div>
    </form>
  </Modal>
}
