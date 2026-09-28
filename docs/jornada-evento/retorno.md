# Retorno do evento — a conferência em lote

Mutation: `acervo.conferirRetorno`. Tela: a seção "Conferência de retorno" no
acervo do evento (`/eventos/:id/acervo`).

## O exemplo

```
Marina & Gabriel — Mesa Toscana
8 saíram · 8 voltaram
6 prontas · 1 limpar · 1 reparo

Disponível para o próximo evento: 6/8
```

Lavada, a de limpeza volta a pronta; reparada, a de reparo também — cada uma
por uma ocorrência (`moverCondicao`), e a disponibilidade acompanha.

## Como funciona

1. A seção aparece quando alguma reserva **saiu** (`saiu > 0`) e ainda não foi
   **conferida** (`conferidoEm` ausente). Some quando tudo foi conferido.
2. Por reserva: quantas voltaram (começa no que saiu), quantas precisam limpar,
   de reparo, ou estão indisponíveis. **Prontas nunca é digitado** — é o que
   voltou menos as condições.
3. Vai inteira ao servidor **numa transação**. Uma linha errada recusa tudo:
   conferência pela metade deixaria metade das peças sem condição.
4. Para cada condição, um movimento `pronto → condição` com a linha no
   histórico (motivo "Conferência de retorno", o evento, quem conferiu).
5. A reserva ganha `voltou` e `conferidoEm`.

## O que é recusado

- voltar mais do que saiu;
- condições somando mais do que voltou; quantidade negativa;
- reserva de outro evento ou de outra conta (`NOT_FOUND`);
- a mesma reserva duas vezes na mesma conferência;
- **conferir de novo** — contaria as peças duas vezes. Corrigir depois é uma
  ocorrência, que fica no histórico.

## Retorno parcial

Voltaram 6 de 8: as 2 que faltam continuam **fora** (a disponibilidade
desconta como peça que não voltou) até alguém registrar o retorno ou dar baixa.

## O que a jornada mostra

Retorno → "Todo o acervo voltou" / "N de M voltaram inteiras"; Conferência de
retorno → "Retorno conferido"; Limpeza e reparo → peças dos itens deste evento
ainda fora de uso; Disponível de novo → quando nada do que a conferência mandou
para fora de uso continua fora.
