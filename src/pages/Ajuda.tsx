import { Link, useParams } from 'react-router-dom'
import { PageHead, Icon } from '../ui'
import { useMe } from '../me'

type Tema = {
  id: string; titulo: string; icone: string; rota?: string
  quem?: string            // quem usa / de qual plano
  gestor?: boolean         // só gestor/admin
  plataforma?: boolean     // só administrador da plataforma
  resumo: string
  passos: string[]
  dicas?: string[]
}

/** Textos de ajuda de cada tela. Mantenha em linguagem simples; se uma tela mudar, atualize aqui. */
export const TEMAS: Tema[] = [
  { id: 'comecar', titulo: 'Por onde começar', icone: 'home', resumo: 'O Semeia Leads fica em cima do seu ERP. Ele mostra quem chamar hoje, guarda cada contato e acompanha os leads novos até virarem clientes.',
    passos: ['Comece pela tela Hoje: ela lista os clientes que precisam de contato e já traz a mensagem pronta para o WhatsApp.', 'Depois do contato, volte e registre o resultado. O sistema marca a próxima data sozinho.', 'Em Carteira você vê todos os seus clientes; em Leads, os interessados que ainda não compraram.', 'Quem gerencia a empresa também usa o Painel (números do mês) e Configurações (conexão com o ERP e equipe).'],
    dicas: ['Os clientes, produtos, preços e pedidos vêm do ERP: o ERP é a fonte da verdade e o app só lê.', 'No celular, abra o menu pelo botão de três risquinhas no canto de cima.', 'O botão de lua/sol no topo troca entre o tema escuro e o claro. Sem escolha sua, o app segue o tema do aparelho; a escolha fica guardada neste aparelho.', 'Cada pessoa só vê os clientes da própria carteira. Gestor e administrador veem todos.'] },
  { id: 'hoje', titulo: 'Hoje', icone: 'home', rota: '/', quem: 'Todos os planos', resumo: 'A lista de trabalho do dia: quem você deve chamar agora, na ordem de importância.',
    passos: ['Cada linha é um cliente com o motivo do contato (contato em dia, recompra prevista, pós-venda, pesquisa de satisfação ou cliente insatisfeito).', 'Toque no botão do WhatsApp para abrir a conversa com a mensagem pronta. O clique fica no histórico, mas não conta como contato feito.', 'Toque em Abrir para ver a ficha do cliente e registrar o resultado do contato.', 'Mais abaixo, “Leads para acompanhar” mostra os interessados com retorno vencido.', 'Gestor e administrador têm o botão “Ver todos os vendedores”, que inclui também os clientes sem dono.'],
    dicas: ['Quanto maior a pontuação, mais no topo o cliente aparece. Cliente insatisfeito sempre vem primeiro.', 'Se você registrar “Não respondeu”, o cliente volta para a lista em 2 dias.'] },
  { id: 'carteira', titulo: 'Carteira', icone: 'users', rota: '/carteira', quem: 'Todos os planos', resumo: 'Todos os clientes da sua carteira, com busca e filtros.',
    passos: ['Busque pelo nome, CNPJ, telefone ou cidade.', 'Filtre por curva (A, B ou C), por situação (ativo, em risco, inativo, prospect) e, se for gestor, por vendedor ou “Sem dono”.', 'Toque em um cliente para abrir a ficha.', 'Só o administrador da empresa move clientes de carteira: marque os clientes, escolha “Passar para…” e confirme em “Confirmar e mover”.', 'No plano Distribuidor, o administrador também usa “Redistribuir por filtro” para passar muitos clientes de uma vez; o sistema mostra quantos serão movidos antes de confirmar.'],
    dicas: ['Toda troca de carteira vai para o histórico e, se o cadastro no ERP estiver ligado, também é enviada ao ERP.', 'Curva A são os clientes que mais compram (20%), B os seguintes (30%) e C os demais.'] },
  { id: 'cliente', titulo: 'Ficha do cliente', icone: 'file', rota: '/carteira/:id', quem: 'Todos os planos', resumo: 'Tudo sobre um cliente: quanto compra, o que compra e o que já foi conversado.',
    passos: ['No topo: curva, faturamento dos últimos 12 meses, ticket médio e data do último pedido.', '“Últimos pedidos” e “Mais comprados” mostram o histórico de compras (nunca aparece custo ou margem).', '“Categorias que nunca comprou” são boas ideias de oferta.', 'Escolha um “Modelo de mensagem” e abra o WhatsApp com o texto pronto.', 'Depois do contato, registre o resultado: vendeu, mandei orçamento, sem interesse, não respondeu ou reagendar. Isso define quando o cliente volta para a lista Hoje.', 'O “Histórico de contatos” guarda tudo o que foi registrado.'] },
  { id: 'leads', titulo: 'Leads', icone: 'inbox', rota: '/leads', quem: 'Plano Profissional ou acima', resumo: 'O funil de quem demonstrou interesse e ainda não é cliente.',
    passos: ['O funil tem as etapas Novo, Contatado, Catálogo enviado, Negociando e Convertido; quem foi descartado fica como Perdido.', 'Para cadastrar à mão, use “Cadastro manual”: informe o CNPJ (os números são conferidos), o nome do contato e o WhatsApp. Se a razão social ficar vazia, o sistema busca pelo CNPJ.', 'Abra um lead para mover de etapa, anotar uma conversa ou adiar o próximo contato. Para marcar como Perdido é preciso dizer o motivo.', 'Quem atende o lead é o vendedor da carteira daquele CNPJ. Sem carteira, vale o escolhido pelo administrador ou o rodízio automático entre os vendedores.', 'Copie o “Link do formulário Seja revendedor” e divulgue: quem preencher entra aqui sozinho.', 'Com a escrita no ERP liberada, “Cadastrar no ERP” envia o lead como cliente novo.'],
    dicas: ['O lead vira Convertido sozinho quando o primeiro pedido dele aparece no ERP.', 'Se o CNPJ já for cliente, o sistema avisa na hora: ele não vira um lead novo.', 'Só o administrador troca o lead de vendedor.'] },
  { id: 'catalogo', titulo: 'Catálogo', icone: 'tag', rota: '/catalogo', quem: 'Plano Profissional ou acima', resumo: 'Os produtos do ERP com o preço da tabela de cada cliente.',
    passos: ['Escolha primeiro o cliente do pedido: o preço mostrado é o da tabela dele.', 'Busque por nome, código ou SKU e filtre por marca ou categoria. Cada produto mostra uma miniatura da foto, quando o ERP tem imagem.', 'Adicione os produtos e as quantidades e toque em “Revisar pedido”.'],
    dicas: ['Sem cliente escolhido não aparece preço.', 'O preço nunca vem do seu navegador: o servidor confere na tabela do cliente antes de gravar.', 'Cada vendedor só consegue escolher clientes da própria carteira.'] },
  { id: 'pre-pedidos', titulo: 'Pré-pedidos', icone: 'file', rota: '/pre-pedidos', quem: 'Plano Profissional ou acima', resumo: 'Os pedidos que você montou no catálogo, do rascunho até o envio ao ERP.',
    passos: ['Abra um pré-pedido para ajustar produtos, quantidades e observação, e toque em “Salvar alterações”.', 'Ao enviar: se o envio automático ao ERP estiver desligado, o sistema mostra um resumo para você copiar e lançar no ERP.', 'Se o envio automático estiver ligado, o pedido segue direto para o ERP.', 'Se o ERP não confirmar, o pré-pedido fica marcado com aviso: confira no ERP se o pedido entrou antes de tentar de novo. Depois use “O pedido entrou no ERP” ou “Não entrou: voltar para rascunho”.'],
    dicas: ['Um pedido enviado nunca é repetido sozinho, para não duplicar nota fiscal.', 'Vendedor vê só os pré-pedidos que montou; gestor vê todos.'] },
  { id: 'painel', titulo: 'Painel', icone: 'kanban', rota: '/painel', gestor: true, quem: 'Gestor e administrador · plano Distribuidor', resumo: 'Os números do mês da operação inteira.',
    passos: ['No topo: faturamento, pedidos, ticket médio e positivação (clientes que compraram ÷ clientes da carteira).', 'O gráfico dos últimos 12 meses mostra a evolução; use a visão em tabela se preferir os valores.', 'A tabela por vendedor mostra quanto cada carteira vendeu, os contatos feitos e os leads por etapa.', 'A pesquisa de satisfação mostra a nota (promotores menos detratores) dos últimos 90 dias.', 'O comparativo “Agora × Antes” coloca os últimos 60 dias ao lado dos 60 anteriores para medir a melhora.'],
    dicas: ['As vendas contam para o vendedor dono da carteira hoje.', 'Custo e margem nunca aparecem aqui.'] },
  { id: 'configuracoes', titulo: 'Configurações', icone: 'gear', rota: '/configuracoes', gestor: true, quem: 'Gestor e administrador', resumo: 'Onde a empresa liga o ERP, define regras e cuida da equipe.',
    passos: ['Plano: situação da assinatura (o pagamento fica em “Plano e pagamento”).', 'Regras da carteira: dias para ativo/em risco, tamanho da lista Hoje, frequência de contato por curva. Ao salvar, a carteira é recalculada.', 'Conexão com o ERP: credenciais da Rein, ou o “Modo de teste” com dados de exemplo. Use “Testar conexão” depois de salvar.', 'Envio de pedido e Cadastro no ERP: liberam a escrita no ERP. Deixe desligado até validar com a Rein, porque pedido tem efeito fiscal.', 'Sincronização: “Carga inicial” traz os dados do ERP (repita até concluir); depois o sistema atualiza sozinho.', 'Trocas de vendedor no ERP: acompanhe e resolva trocas que não chegaram ao ERP.', 'Modelos de mensagem: edite os textos do WhatsApp (variáveis como {{contato}} e {{empresa}}).', 'Equipe: convide vendedores e gestores por link, ligue cada pessoa ao vendedor do ERP e ative ou desative acessos.'],
    dicas: ['O segredo da conexão com o ERP nunca volta para a tela depois de salvo.', 'O limite de vendedores depende do plano; vendedor extra é cobrado à parte.'] },
  { id: 'conta', titulo: 'Minha conta', icone: 'users', rota: '/conta', quem: 'Todos os planos', resumo: 'Seus dados de acesso e a forma de ser avisado. Abra clicando nas suas iniciais, no canto de cima.',
    passos: ['Trocar a senha: digite a senha atual e a nova (mínimo de 8 caracteres). Os outros aparelhos onde você estava logado precisam entrar de novo; este continua.', 'Avisos por e-mail (gestor e administrador): ligue ou desligue os e-mails de cliente insatisfeito, lead novo pelo site e problemas com o ERP ou o pagamento.', 'Notificações neste aparelho: toque em “Ligar notificações neste aparelho”, aceite o pedido do navegador e use “Enviar teste” para conferir. Gestor e administrador recebem os mesmos avisos também na tela do celular ou do computador.'],
    dicas: ['No iPhone, instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por ele; sem isso o iPhone não mostra notificações.', 'As notificações são por aparelho: ligue em cada celular ou computador que quiser.', 'Esqueceu a senha? Na tela de entrada, use “Esqueci a senha”.'] },
  { id: 'plano', titulo: 'Plano e pagamento', icone: 'money', rota: '/assinatura', quem: 'Administrador da empresa', resumo: 'Escolha do plano, cobrança e situação da assinatura.',
    passos: ['Escolha o plano, quantos vendedores extras e se o pagamento é mensal ou anual (anual = 2 meses grátis).', 'Informe o CPF ou CNPJ e siga para a página de pagamento (Pix, boleto ou cartão).', 'Pagou e a tela não mudou? Toque em “Já paguei, atualizar”.', 'Em “Cobranças” ficam as cobranças geradas.'],
    dicas: ['O teste grátis de 14 dias libera tudo. Depois dele, vale o plano contratado.', 'Se o acesso for bloqueado por falta de pagamento, os dados ficam guardados e voltam quando regularizar.'] },
  { id: 'plataforma', titulo: 'Todas as empresas', icone: 'shield', rota: '/admin', plataforma: true, quem: 'Administradores da plataforma (Grupo Semeia)', resumo: 'Visão de todas as empresas clientes: situação, plano e uso. Não abre clientes, pedidos nem custos de nenhuma empresa.',
    passos: ['No topo: receita mensal recorrente, testes acabando e atrasos.', 'Em cada empresa: dono, equipe, clientes, último acesso, situação, cobrança e estado do ERP.', 'Ações rápidas: estender o teste, liberar sem cobrança (piloto/cortesia), suspender ou reativar.', 'Em “Ajuste manual”, mude plano e vendedores extras e toque em “Salvar ajuste”.'],
    dicas: ['Toda mudança fica registrada no histórico da empresa.', 'A conta do Grupo Semeia pode ser só da plataforma, sem pertencer a nenhuma empresa: ela entra direto nesta tela e não enxerga os dados de nenhum cliente.'] },
  { id: 'glossario', titulo: 'Palavras do sistema', icone: 'eye', resumo: 'O que significam os termos que aparecem nas telas.',
    passos: ['Curva A, B e C: classificação pelo faturamento dos últimos 12 meses. A são os 20% que mais compram, B os 30% seguintes, C o resto.', 'Ativo: comprou há até 90 dias. Em risco: de 91 a 180 dias. Inativo: mais de 180 dias. Prospect: nunca comprou.', 'Pontuação (0 a 100): ordena a lista Hoje. Soma a importância do cliente (curva), o atraso no contato, a recompra prevista e o risco de perder o cliente.', 'Positivação: parte dos clientes da carteira que comprou no mês.', 'Recompra prevista: o cliente está perto do intervalo normal entre as compras dele.', 'Sem dono: cliente que ainda não está na carteira de nenhum vendedor.', 'Modo de teste: o app usa dados de exemplo em vez de falar com o ERP.'] },
]

/** Tema de ajuda correspondente a uma rota do app (usado pelo botão “?” do topo). */
export function temaDaRota(caminho: string): string {
  if (caminho === '/') return 'hoje'
  if (/^\/carteira\/.+/.test(caminho)) return 'cliente'
  if (/^\/pre-pedidos/.test(caminho)) return 'pre-pedidos'
  if (caminho === '/conta') return 'conta'
  const t = TEMAS.find(x => x.rota && x.rota === caminho)
  return t ? t.id : 'comecar'
}

export default function Ajuda() {
  const { me } = useMe()
  const { tema } = useParams()
  const gestor = me.usuario.papel !== 'seller'
  const visiveis = TEMAS.filter(t => (!t.gestor || gestor) && (!t.plataforma || me.admin))
  const atual = visiveis.find(t => t.id === tema) ?? visiveis[0]
  return <>
    <PageHead eyebrow="Ajuda" title="Como funciona cada tela" />
    <div className="ajuda">
      <nav className="ajuda-menu" aria-label="Assuntos da ajuda">
        {visiveis.map(t => <Link key={t.id} to={`/ajuda/${t.id}`} className={`ajuda-item ${t.id === atual.id ? 'on' : ''}`} aria-current={t.id === atual.id ? 'page' : undefined}><Icon n={t.icone} s={16} /> {t.titulo}</Link>)}
      </nav>
      <article className="card ajuda-corpo">
        <div className="bd stack">
          <div><div className="eyebrow">{atual.quem ?? 'Guia rápido'}</div><h2>{atual.titulo}</h2></div>
          <p>{atual.resumo}</p>
          <div><h3 className="ajuda-h">Como usar</h3><ol className="ajuda-lista">{atual.passos.map((p, i) => <li key={i}>{p}</li>)}</ol></div>
          {atual.dicas && <div><h3 className="ajuda-h">Bom saber</h3><ul className="ajuda-lista">{atual.dicas.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
          {atual.rota && !atual.rota.includes(':') && <div><Link className="btn" to={atual.rota}>Abrir esta tela <Icon n="arrow" s={16} /></Link></div>}
        </div>
      </article>
    </div>
  </>
}
