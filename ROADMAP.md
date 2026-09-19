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
- Seis geradores de PDF com a identidade visual da empresa da decoradora

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

- **Pasta do evento**: `contracts.kind` aceita adendo, orçamento e referência;
  só o contrato principal tem upload na tela.
- **Audiência do item de montagem**: `assemblyItems.visibility`
  (interno/cliente/equipe) é gravado e nunca lido — os relatórios por audiência
  não existem.
- **Política de autonomia da Central**: `adminAutonomyPolicy` é gravável e
  **inerte** por decisão; ligar autonomia é mudança de fase, não de dado.
- **Transcrição de áudio**: `communicationMessages.transcricao` existe para não
  exigir migração depois.

---

## Backend pronto, sem caminho na tela

Funções que existem, são testadas e ninguém consegue chamar pelo aplicativo:

- Catálogo de materiais: `materials.update` e `setArchived` (criar só acontece
  dentro do diálogo de receita; não há tela de materiais)
- Biblioteca de composições: `create`, `update`, `duplicate`, `setArchived`
- Acervo: `reservar` manual e `disponibilidade`
- Ficha técnica: `limparReceita` e `desvincularCompra`
- Compras: `unregisterCost`
- Notificações: `generateMyAlerts`
- Assinatura: `asaas.getCustomerPortalUrl` (sem uso e sem guarda — ver
  "Recomendações")

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

## Decisões pendentes (de produto, não de código)

1. **Quando ligar o envio externo da Central** — exige número comercial
   integrado e critério medido de acerto da IA (`communicationTriage.divergiu`).
2. **Se a vertical Buffet ganha deployment próprio** — a coluna `vertical` já
   existe em toda entidade da Central para o dia em que ganhar.
3. **Se o catálogo de materiais merece tela própria** — hoje o cadastro nasce de
   dentro da receita, e a manutenção não tem onde acontecer.
4. **Se multiempresa volta ao mapa** — decide se `users` continua sendo a
   fronteira de dados.
