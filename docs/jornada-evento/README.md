# Jornada do evento e ciclo do acervo

Branch `feature/altar-jornada-evento`, 28/09/2026. Não mergeada, não publicada.

A pergunta que a página do evento passa a responder de relance: **em que etapa
o projeto está, o que vem depois, e o que acontece com as peças até voltarem ao
galpão.**

| Documento | Assunto |
|---|---|
| [`decisoes.md`](decisoes.md) | auditoria e as nove decisões, escritas antes do código |
| [`jornada.md`](jornada.md) | as dez etapas, a regra de cada status, ordem × dependência |
| [`saude-evento.md`](saude-evento.md) | o percentual (igual) e o que ele ganhou (fase, próximo passo, atenção) |
| [`acervo-ciclo-de-vida.md`](acervo-ciclo-de-vida.md) | condições das peças, disponibilidade real, ocorrência, histórico |
| [`retorno.md`](retorno.md) | a conferência de retorno em lote |
| [`qr-futuro.md`](qr-futuro.md) | proposta de QR code — **não implementado** |

---

## Implementado agora

- **Página do evento**: Saúde no topo (com fase, próximo passo e atenção) →
  Jornada do Projeto (10 etapas com status) → Operação (10 etapas, do galpão ao
  galpão). Substitui as "Ações Rápidas" sem perder nenhum destino.
- **Jornada derivada**: `convex/lib/jornadaDoEvento.ts` (pura) e
  `health.getEventJourney` (uma query).
- **Condições do acervo**: pronto (derivado), limpeza, reparo, indisponível,
  conferência — `convex/lib/condicaoDoAcervo.ts`.
- **Ocorrência** com histórico, quem registrou e foto: `acervo.moverCondicao`,
  tela de celular `OcorrenciaDeAcervoDialog`.
- **Conferência de retorno em lote**: `acervo.conferirRetorno` e a seção na
  tela do acervo do evento.
- **Visão do galpão** no `/acervo`: prontas por item, filtros por condição,
  botão de ocorrência.
- **Disponibilidade real**: toda condição fora de uso sai da conta.
- **Assistente**: reparo por nome, disponíveis por item, o que voltou com
  problema por evento.

## Preparado para o futuro (não implementado)

- **QR code** por peça, conjunto, lote ou caixa ([`qr-futuro.md`](qr-futuro.md)).
- **Montagem e desmontagem** como etapas registradas — hoje aparecem como
  "sem registro".
- **Contrato enviado / assinado** — o modelo só sabe "anexado".
- **"O que preciso separar para o próximo evento?"** no Assistente — pede uma
  fonte por evento.
- **Cobertura de fornecedores** por tipo de evento (quais categorias faltam).
- **Categorias de foto por finalidade** (inspiração, ocorrência…) — hoje a
  galeria tem fase (`category`) e escopo (`projectScope`); inspiração usa
  `projectScope = "referencia"`, sem schema novo.
