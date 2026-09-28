# Jornada do evento — auditoria e decisões

Registrado em **28/09/2026**, antes do código, na branch
`feature/altar-jornada-evento`. Cada decisão diz o que a motivou.

---

## O que a auditoria encontrou

### A página do evento (`src/pages/app/events/[id]/page.tsx`)

De cima para baixo: cabeçalho → cliente → **Ações Rápidas** (9 links de peso
igual) → **Saúde do Evento** → "Pronto para mostrar?" → Contrato → Análise de
Croqui → Checklists → Pasta do evento → Resumo operacional → Equipe → Agenda.

- Só três dos nove links dizem alguma coisa (Proposta, Ficha técnica, Acervo).
  Os outros são texto fixo: "Galeria de Fotos" não diz se há foto.
- A Saúde fica abaixo dos nove links, e o número dela (7 critérios de peso
  igual, `lib/saudeDoEvento.ts`) mede **cadastro completo**, não andamento.
  Não existe "fase atual" nem "próximo passo" em lugar nenhum.
- O contrato aparece em três lugares: a seção Contrato, a Pasta do evento (dois
  uploaders para a mesma tabela) e a Saúde.

### O que dá para saber de cada etapa — e o que NÃO dá

| Etapa | Dado que existe | "Concluído" honesto | O que não se sabe |
|---|---|---|---|
| Briefing | `briefings` (1 por evento) | convidados **e** conceito preenchidos — os mesmos sinais que Saúde e Prontidão já usam | se a cliente validou |
| Comercial | `budgetItems`, `proposals.status` | proposta **aceita** | vínculo proposta ↔ versão do orçamento |
| Contrato | `contracts` (cliente = `kind` contract, sem fornecedor) | **anexado** | enviado, assinado — não há campo |
| Inspirações | `eventPhotos.projectScope = "referencia"` | ≥ 1 referência | se a cliente aprovou |
| Fornecedores | `eventSuppliers.status` | todos contratados/confirmados/finalizados | se a cobertura está completa |
| Ficha técnica | `assemblyItems.receita` | todo item com materiais | se as quantidades estão certas |
| Acervo | `collectionReservations` | reservado sem déficit | — |
| Projeto visual | `prontidaoDoEvento` | "Pronto para mostrar" | se foi apresentado |
| Croqui | `layoutRenders.originalSketchStorageId` | croqui enviado | a "Análise de Croqui" da página não grava nada |
| Planta premium | `layoutRenders.status = done` | planta gerada | se é a versão final |

### Operação — quatro trilhas que não conversam

`assemblyItems.operationalStatus` (pendente → separado → carregado → conferido
→ retornou, sem quantidade), PDFs de carregamento e montagem, checklist
pré/pós em texto livre, e `saiu`/`voltou` das reservas de acervo. Não há
desmontagem, nem conferência de retorno com quantidade, nem autor.

### Acervo

Modelo **por quantidade** (sem peça numerada). Já havia `emManutencao`
(28/09) descontando da disponibilidade e o histórico imutável em
`collectionAdjustments`. `responsibleId` existe no histórico e as mutations
aceitam — mas a tela nunca envia. Nenhuma foto liga a item de acervo.
Registrar uma quebra no celular: 6–7 toques em alvos de 36 px.

---

## Decisões

### D1 — A jornada é DERIVADA, não gravada

Nenhum campo "etapa atual" no evento. A jornada é calculada dos dados que já
existem (`lib/jornadaDoEvento.ts`, pura) — como a Saúde e a Prontidão. Um
estágio gravado divergiria no primeiro orçamento apagado.

### D2 — Ordem recomendada ≠ dependência real

A jornada ORIENTA, não trava: toda etapa abre a qualquer momento. "Você está
aqui" é a primeira etapa não concluída na ordem recomendada. Dependência real
existe onde o sistema não funciona sem a anterior — hoje, só **planta premium
precisa de croqui**, e é a única que a tela marca como "depende de".

### D3 — Orçamento e Proposta: uma etapa, duas estruturas

Etapa "Comercial" lê as duas tabelas; nenhuma é fundida. Orçamento é uso
interno, proposta é o documento da cliente — a diferença é produto.

### D4 — Contrato diz "anexado", nunca "assinado"

Não há campo de assinatura, e inventar seria a tela afirmando o que não sabe.
Pendências da leitura por IA (`contractPendings`) deixam a etapa "em
andamento".

### D5 — Saúde: o número continua o mesmo, ganha significado

O percentual segue `saudeDoEvento` (7 critérios, sem mudança de regra — não
se inventa percentual). O que muda: sobe na página e ganha **fase atual**,
**próximo passo** e **precisa de atenção**, vindos da jornada e dos alertas
que já existem.

### D6 — Condições do acervo são CONTADORES, "pronto" é derivado

Como `emManutencao`: `emLimpeza`, `indisponivel` e `emConferencia`,
opcionais, ausente = 0. **Reparo = `emManutencao`** — não se cria um segundo
estado de reparo. `pronto = total − condições` e nunca é gravado. Registro por
peça exigiria identidade de peça, que o modelo não tem (ver `qr-futuro.md`).

### D7 — Toda mudança de condição fica no histórico

Uma linha em `collectionAdjustments` (tipo `condicao`) com condição anterior
e nova, quantidade, motivo, evento, membro da equipe e foto opcional. Nada
sobrescreve sem rastro.

### D8 — Retorno em lote, numa transação

`conferirRetorno`: para cada reserva do evento, quantas voltaram e em que
condição (pronta / limpar / reparo / indisponível). A soma tem de fechar com o
que voltou, e o que não está pronto sai da disponibilidade na hora.

### D9 — QR code: documentado, não implementado

Exige identidade por peça, conjunto ou caixa — decisão de modelo que muda o
acervo inteiro. Fica a proposta em `qr-futuro.md`.
