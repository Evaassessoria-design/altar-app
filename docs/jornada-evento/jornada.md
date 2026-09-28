# A jornada do projeto

Regra: `convex/lib/jornadaDoEvento.ts` (`jornadaDoEvento`, pura).
Leitura: `health.getEventJourney`. Tela: `_components/jornada-do-projeto.tsx`.

## Derivada, nunca gravada

Não há campo "etapa atual" no evento. Cada etapa lê o que a própria tela dela
já grava. Um estágio gravado divergiria no primeiro orçamento apagado.

## As dez etapas e o que cada status quer dizer

| # | Etapa | Concluído quando | Em andamento quando | Destino |
|---|---|---|---|---|
| 1 | Briefing | convidados **e** conceito preenchidos | o briefing existe, falta um dos dois | `/briefing` |
| 2 | Orçamento e proposta | alguma proposta **aceita** | orçamento sem proposta; proposta rascunho, enviada ou recusada | `/orcamento` (+ atalho da proposta) |
| 3 | Contrato | contrato da cliente **anexado**, sem pendência da leitura | anexado com pendências | a seção Contrato (`#contrato`) |
| 4 | Inspirações | ≥ 1 foto marcada como **referência** | — | `/fotos` |
| 5 | Fornecedores | todos contratados, confirmados ou finalizados | algum ainda não | `/fornecedores` |
| 6 | Ficha técnica | todo item de montagem com materiais | alguns com materiais | `/ficha-tecnica` |
| 7 | Acervo | reservas sem déficit | alguma reserva sem peça suficiente | `/acervo` |
| 8 | Projeto visual | "Pronto para mostrar" | algum ponto pronto | `/projeto` |
| 9 | Croqui | croqui enviado | — | `/planta` |
| 10 | Planta premium | planta gerada | gerando | `/planta` |

**O que a jornada NÃO afirma:** contrato *assinado* (não há campo), proposta
*recebida* pela cliente (o envio é registrado à mão), briefing *validado* pela
cliente, cobertura *completa* de fornecedores.

## Ordem recomendada × dependência real

- **"Você está aqui"** = a primeira etapa não concluída na ordem acima.
- **"Próximo"** = a seguinte não concluída.
- **Toda etapa abre a qualquer momento.** Quem desenha o projeto visual antes do
  contrato pode; a etapa aparece feita e o ponteiro continua na ordem.
- **Dependência real** existe só onde o sistema não funciona sem a anterior:
  a planta premium é gerada a partir do croqui. A tela diz isso em texto; não
  bloqueia.

## A operação

`operacaoDoEvento`: separação → carregamento → conferência no local →
montagem → evento → desmontagem → retorno → conferência de retorno → limpeza e
reparo → disponível de novo.

| Etapa | Lida de |
|---|---|
| Separação, carregamento, conferência no local | `assemblyItems.operationalStatus` |
| Montagem, desmontagem | **sem registro** — o ALTAR não acompanha; não se deduz da data |
| Evento | data ≤ hoje, ou status em andamento/realizado |
| Retorno | `collectionReservations.saiu/voltou` |
| Conferência de retorno | `collectionReservations.conferidoEm` |
| Limpeza e reparo, disponível | condições dos itens deste evento + o que a conferência mandou para fora de uso |

"Sem registro" não prende o ponteiro da operação.

## Testes

`convex/lib/jornadaDoEvento.test.ts` (regra), `convex/jornada.evento.test.ts`
(query, com a demo semeada e outra conta), `_components/jornada-e-galpao.test.tsx`
(tela).
