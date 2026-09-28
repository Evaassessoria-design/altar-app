# Saúde do evento

## Antes

- Abaixo das nove "Ações Rápidas".
- Um percentual e sete critérios, e uma lista "O que falta".
- Nenhuma fase, nenhum próximo passo.

## O percentual não mudou — de propósito

`convex/lib/saudeDoEvento.ts`: sete critérios de **peso igual**, `ok / 7`.

| Critério | Verdadeiro quando |
|---|---|
| Evento | nome, data, local e cliente preenchidos |
| Contrato | contrato da cliente anexado (sem fornecedor) |
| Financeiro | ≥ 1 lançamento |
| Fornecedores | ≥ 1 fornecedor no evento |
| Montagem | ≥ 1 item de montagem |
| Responsável | ≥ 1 pessoa na escala (`eventTeam`) |
| Briefing | número de convidados preenchido |

Mudar a regra seria mudar o número de todo evento que a decoradora já conhece
— sem ganho, porque o que faltava não era outro número, era dizer **o que fazer**.
Anotado para rever depois: o critério "Responsável" lê a escala, não o campo
`responsibleId` do evento.

## Depois

No topo da página, logo após o cabeçalho e o cliente:

- **Saúde** — o mesmo percentual;
- **Fase atual** — Projeto, Operação ou Tudo em dia;
- **Próximo passo** — a etapa, com o link e o detalhe em números;
- **Precisa de atenção** — o que só a jornada sabe (reserva sem peça, retorno
  não conferido) primeiro, depois os avisos da Saúde, sem repetir, até 6;
- **Como a saúde é calculada** — os sete critérios, recolhidos.

## A regra da fase

`resumoDaJornada`:

1. o evento já aconteceu (data ≤ hoje, ou em andamento/realizado) → **Operação**,
   mesmo com etapa de projeto aberta — na segunda-feira pós-evento o retorno
   importa mais que a planta premium;
2. há etapa de projeto pendente → **Projeto**, próximo passo = "você está aqui";
3. há etapa operacional pendente → **Operação**;
4. senão → **Tudo em dia**.
