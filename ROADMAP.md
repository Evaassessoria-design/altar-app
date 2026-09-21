# ALTAR — estado do produto

Este arquivo responde a uma pergunta só: **o que existe de verdade hoje?**

O roadmap anterior listava como "a fazer" coisas que já estavam prontas há
meses (dashboard, eventos, briefing, checklist, galeria, compras, financeiro,
IA) e dava por pronto o que nunca foi feito. Um plano que não bate com o código
é pior do que nenhum: ele faz decidir errado.

Datado de 19/09/2026. Quando divergir do código, o código está certo.

---

## Pronto e em uso

**Comercial**
- Funil com sete estágios, registro de contato e follow-up
- Documentos do lead (proposta, contrato, comprovante) — sobrevivem à conversão
- Conversão de lead em evento, reaproveitando o que já foi digitado

**Evento**
- Cadastro, responsável, saúde do evento e resumo operacional
- Briefing completo e checklist de pré e pós-evento
- Orçamento, galeria por fase, agenda do dia
- Importação de contrato por IA (lê e propõe; quem aplica é a pessoa)

**Produção**
- Catálogo de materiais e biblioteca de composições
- Ficha técnica por item de montagem, com receita em snapshot
- Consolidado de necessidade e geração idempotente de compras
- Caderno de montagem e folha de carregamento, com PDFs

**Acervo**
- Itens por quantidade, reserva por janela com detecção de conflito
- Saída, retorno e ajuste de estoque com histórico auditável

**Fornecedores e equipe**
- Catálogo central por empresa e vínculo por evento
- Equipe, escala e responsável por evento, lead e compra

**Dinheiro**
- Compras com status, panorama semanal e vínculo com o livro-caixa
- Financeiro com receitas, despesas e custo real do evento
- Assinatura via Asaas: checkout, webhook auditado, reconciliação diária,
  tolerância de inadimplência e paywall aplicado no servidor

**Documentos**
- Caderno de montagem em três audiências — equipe, cliente e uso interno
- Cinco geradores de PDF com a identidade visual da empresa da decoradora:
  resumo do evento, orçamento, ficha técnica, caderno de montagem e folha de
  carregamento

**Operação do SaaS**
- Painel administrativo: contas, acesso, métricas, avisos do Asaas
- Central de Comunicações — recebimento multicanal, triagem por IA, fila de
  aprovação humana, tarefas, Ouvidoria e caixa de entrada completa
  (`docs/central-comunicacoes.md`)
- Ponte somente leitura para o Escritório 3D

---

## Existe no schema, ainda sem tela

Preparado de propósito, sem backfill e sem custo — mas hoje invisível para quem
usa:

- **Política de autonomia da Central**: `adminAutonomyPolicy` é gravável e
  **inerte** por decisão; ligar autonomia é mudança de fase, não de dado.
- **Transcrição de áudio**: `communicationMessages.transcricao` existe para não
  exigir migração depois.

---

## Backend pronto, sem caminho na tela

Funções que existem, são testadas e ninguém consegue chamar pelo aplicativo:

- Biblioteca de composições: `create` e `duplicate`. O resto do ciclo tem tela:
  `fichaTecnica.salvarNaBiblioteca` guarda a receita do item, `compositions.list`
  a aplica, e `update`, `setArchived` e `ondeEUsada` abrem em "Renomear ou
  arquivar esta receita na biblioteca", dentro do diálogo da receita. `create`
  não tem tela porque a biblioteca nasce do trabalho já feito, não de um
  formulário em branco — é deliberado
- Ficha técnica: `limparReceita`. Apagar TODAS as linhas da receita e salvar já
  esvazia o item; o que `limparReceita` faz a mais é também soltar a
  procedência (`compositionId`)
- Catálogo de fornecedores: `supplierCatalog.get` (a lista e a edição têm tela;
  uma página de UM fornecedor não existe)
- Notificações: `generateMyAlerts`
- Assinatura: `asaas.getCustomerPortalUrl` (sem uso e sem guarda — ver
  "Recomendações")

Saíram desta lista porque ganharam caminho na tela: `acervo.reservar` e
`acervo.disponibilidade` ("Reservar peça", no acervo do evento),
`fichaTecnica.desvincularCompra` (na linha da ficha) e
`purchases.unregisterCost` (no rótulo "no financeiro", em Compras).

O mapa completo, com evidência, impacto e esforço de cada um, está em
`docs/estado-do-produto.md`.

---

## Não existe

- **Multiempresa.** O modelo é por usuário; a migração para multi-tenant foi
  revertida antes de virar produto.
- **Planos, cupons, convites.** Existe um preço e uma assinatura.
- **Integração com Google Agenda.** A tela diz "Em breve" e o módulo
  `src/lib/agenda.ts` afirma no topo que não há OAuth, API nem sincronização.
- **Envio externo pela Central.** O número comercial não está integrado; o
  portão de saída recusa por construção.
- **Aplicativo nativo.** É um PWA.

---

## Para vender

Duas páginas escritas para a reunião, e não para o código:

- `docs/demo-comercial.md` — roteiro de 7 e de 20 minutos, com o que clicar, o
  que dizer, o que NÃO abrir, as perguntas que aparecem e o checklist de 10
  minutos antes do Meet.
- `docs/prontidao-comercial.md` — a matriz do que está PRONTO, PRONTO COM
  RESSALVA, NÃO MOSTRAR AINDA e FUTURO, recurso por recurso.

---

## Decisões pendentes (de produto, não de código)

1. **Quando ligar o envio externo da Central** — exige número comercial
   integrado e critério medido de acerto da IA (`communicationTriage.divergiu`).
2. **Se a vertical Buffet ganha deployment próprio** — a coluna `vertical` já
   existe em toda entidade da Central para o dia em que ganhar.
3. **Se o catálogo de materiais merece tela própria** — hoje o cadastro nasce de
   dentro da receita, e a manutenção não tem onde acontecer.
4. **Se multiempresa volta ao mapa** — decide se `users` continua sendo a
   fronteira de dados.
