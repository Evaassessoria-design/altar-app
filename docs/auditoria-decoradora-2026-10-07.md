# Auditoria da decoradora — checkpoint de 07/10/2026

Branch `feature/auditoria-decoradora`, a partir de `15465aa` (o que está em
PROD). Tudo validado no DEV `healthy-pika-907`. **Nada disto está em PROD.**

## Estado no fim da rodada

| O quê | Onde |
|---|---|
| PROD (backend + frontend) | `15465aa` — Financeiro geral. CSS `index-Bx_isAok.css` |
| `main` | `86dc253` — sem merge desta rodada |
| Esta branch | Dashboard com atalhos + 3 correções de formulário/celular |
| Cron do Escritório | desligado (`RODADA_AUTOMATICA_LIGADA = false`) |

**Pendente de amanhã, antes de tudo:** o teste completo de pagamentos e
comprovantes em PROD (planejar parcelas → receber parcial → anexar comprovante
depois → anular). Até 07/10 de manhã nenhuma chamada tinha chegado aos logs.

## O que entrou (com evidência)

1. **Atalhos do Dashboard** — cada indicador abre o recorte que forma o número:
   Próximos Eventos → `/eventos?filtro=upcoming`; Receita do Mês →
   `/financeiro?mes=AAAA-MM` (filtro na consulta); Itens Pendentes →
   `/eventos?recorte=checklist` (por evento, atalho para Carregamento/Conferência);
   Compras Pendentes → `/compras?aba=eventos&recorte=pendentes`; Por Status →
   `/eventos?status=…`; Eventos por Mês → `/eventos?mes=…` (barra e link).
   Testes: `convex/dashboard.atalhos.test.ts`, `src/lib/recorte-de-eventos.test.ts`.
2. **Defeitos corrigidos no Dashboard**: Receita do Mês contava parcela paga do
   mês seguinte (sem teto de data); checklist e compras paravam nos 5/10
   primeiros eventos; gráfico em preto (`hsl(var(--x))` com tokens oklch).
3. **Formulários que apagavam o que foi digitado quando falhavam**: lead,
   Novo/Editar evento, compra e membro da equipe. Agora ficam abertos e
   preenchidos, com a mensagem do servidor. Teste: `src/lib/funil-formulario.test.ts`.
4. **Celular**: 9 diálogos limitavam a altura em `vh` (o Salvar podia ficar
   atrás da barra do navegador); agora `dvh`. Teste: `src/lib/dialogo-altura.test.ts`.

## Propostas que dependem de decisão (não implementadas)

- **A — Excluir evento apaga reservas com peças na rua.** `events.remove`
  (cascata em `convex/lib/cascade.ts`) apaga as reservas mesmo com `saiu > 0`;
  as peças somem de "fora sem voltar" e voltam a contar como disponíveis.
  `liberarReserva` já recusa esse caso. Na mesma cascata vão as parcelas com
  recebimentos, que o Financeiro protege uma a uma. Proposta: recusar a
  exclusão do evento enquanto houver peça fora ou recebimento registrado,
  dizendo o que resolver antes (registrar retorno; cancelar o evento em vez
  de excluir). Mexe em exclusão de dados e no Acervo → precisa de aprovação.
- **A/B — "Receita do Mês" ignora recebimento parcial.** Dashboard e gráfico
  do Financeiro somam só parcela quitada, pelo vencimento; o card "Receitas"
  do Financeiro soma o que entrou. Em DEV: R$ 1.200 recebidos em outubro e o
  card mostra R$ 0,00. Proposta: o mês do dinheiro passa a ser o dos
  recebimentos (data do recebimento). É regra financeira → precisa de aprovação.
- **C — Ficha Técnica conta reserva com déficit como "providenciado"**
  (`convex/lib/fichaTecnica.ts`).
- **C — Propostas do lead não ganham o `eventId` na conversão**: não aparecem
  na pasta do evento; continuam no lead.
- **C — Campos do lead que não passam ao evento**: cidade, origem, responsável,
  próxima ação.
- **C — `pendenciasPosEvento` lê os 300 ajustes mais recentes** e devolve
  `historicoIncompleto`, que nenhuma tela nem o Assistente mostram.
- **C — Assistente: `executar` não reconfere acesso ativo** (só `delegar`).
- **Hipótese (confirmar com usuárias)**: "Eventos por Mês" mostra os 6 meses
  passados; a agenda da decoradora está nos próximos.
- **Hipótese**: no Dashboard, os dois blocos de primeiros passos empurram os
  números para baixo da dobra mesmo com a configuração concluída.
