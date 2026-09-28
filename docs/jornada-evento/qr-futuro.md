# QR code no acervo — proposta, NÃO implementada

## Por que não agora

O acervo do ALTAR é contado por **quantidade**: "40 cadeiras", sem cadeira nº
17. QR code por peça exige **identidade por peça** — uma mudança de modelo que
atinge reserva, saída, retorno, condição e disponibilidade inteiros. Fazer às
pressas criaria duas verdades (a contagem e as peças) que divergiriam na
primeira quebra.

## O que já não bloqueia essa direção

- Condições como contadores por item: um QR de **item** (o "tipo" Mesa
  Toscana) já pode abrir a ocorrência hoje, sem mudar nada do modelo.
- O histórico (`collectionAdjustments`) já é o registro individual imutável —
  quem, quando, o quê, foto, evento.
- A ocorrência é uma tela única (`OcorrenciaDeAcervoDialog`) que recebe o item
  por props: abrir por QR é trocar a porta de entrada, não a tela.

## Proposta em três níveis

| Nível | Serve para | Identidade | Esforço |
|---|---|---|---|
| **1. QR do item** | mesa, cadeira, vaso — peças iguais | o `_id` de `collectionItems` já é suficiente | pequeno: rota `/acervo/item/:id` + QR impresso na prateleira |
| **2. QR de conjunto/caixa** | "caixa de castiçais 12 un", "kit mesa posta" | tabela nova `collectionLots` (item, quantidade, rótulo) | médio: reservar/separar/conferir por lote |
| **3. QR por peça** | peça cara e única (poltrona assinada, lustre) | tabela `collectionPieces` com número de série e condição própria | grande: a contagem do item vira soma das peças |

Recomendação: **nível 1 primeiro** — resolve "escanear → ver condição →
registrar ocorrência → foto → salvar" sem mudar o modelo. Os níveis 2 e 3 só
quando uma decoradora real pedir, e para os itens que pedirem (o modelo pode
conviver: item contado + algumas peças identificadas).

## Fluxo do nível 1

```
escanear QR na prateleira
→ /acervo/item/:id (tela de celular)
→ prontas / limpar / reparo / indisponível / conferência
→ "Registrar ocorrência" (a tela que já existe)
→ foto → salvar → histórico
```

Segurança: o QR carrega só o id; a tela exige login e `itemDoUsuario` já
recusa item de outra conta (`NOT_FOUND`).
