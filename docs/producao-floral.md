# Produção floral — a ficha que vai para o florista

A decoradora já descrevia os arranjos no ALTAR (Questionário → itens de
montagem) e já dizia do que cada um é feito (Ficha Técnica → receita). O que
ela ainda fazia por WhatsApp era a outra metade: **formato, altura, montagem,
substituição permitida, cuidado, horário e cor** — por composição, toda semana,
no papel.

`/eventos/:id/producao-floral` fecha essa metade, e o PDF é o papel.

## O que NÃO foi criado de novo

Esta rodada não cadastrou nada duas vezes. O que já existia e foi reaproveitado:

| Já existia | O que faz | Reaproveitado como |
| --- | --- | --- |
| `assemblyItems` | "20 arranjos baixos na mesa dos convidados" | a composição floral — nome, ambiente, quantidade |
| `assemblyItems.receita` | a receita do item (snapshot) | as flores e folhagens de cada arranjo |
| `lib/fichaTecnica.ts` | `necessidadeDoComponente`, `quantidadeTexto` | **a única multiplicação** do sistema |
| `agruparPorAmbiente` | cerimônia, bolo, mesas, bar e os livres | os ambientes da ficha |
| `materials.fotoStorageId` | uma foto por insumo, de todos os eventos | a **foto da flor** |
| `MaterialDialog` | corrigir material, enviar/remover foto | o envio da foto, sem segunda tela |
| `lib/fotoDoItem.ts` | precedência Galeria × arquivo próprio | a **referência do arranjo** |
| `pdf-delivery`, `brand`, `imagem-para-pdf` | entrega, identidade, imagem no PDF | o documento |

Campos novos no schema: `componenteDaReceita` ganhou `cor`, `variedade`,
`origem`, `distribuicao` e `apenasOrientacao`; `assemblyItems` ganhou `floral`;
`materials` ganhou `variedade`. **Todos opcionais, nenhum backfill** — item
antigo continua lendo igual.

## As quatro regras que a ficha protege

1. **Por arranjo ≠ total distribuído.** `5 rosas` numa linha significa 5 em
   CADA arranjo; `2 maços` com `distribuicao: "total"` significa 2 no conjunto
   inteiro. Multiplicar o segundo por 20 compraria 40 maços. A distinção vive em
   `necessidadeDoComponente` — o único lugar do sistema que multiplica — e
   `distribuicao` ausente significa **por arranjo**, que é o que toda receita
   já gravada quer dizer.
2. **Fração com unidade explícita.** Meio maço é `0,5 maco`, e continua maço. A
   ficha nunca converte maço em haste nem soma unidades diferentes: a chave do
   resumo leva a unidade, igual ao consolidado da Ficha Técnica.
3. **Informação sem quantidade é orientação.** Uma linha marcada
   `apenasOrientacao` ("folhagem a gosto do florista") aparece na ficha como
   instrução e fica **fora de todos os totais**. Número inventado aqui viraria
   compra inventada depois.
4. **Papel de fornecedor não carrega dinheiro.** `producaoFloral.fichaDoFlorista`
   monta a resposta campo a campo e nem lê `purchaseItems`. O PDF tem trava de
   código: `custoReferencia`, `margemPercentual`, `currency` e `R$` não podem
   aparecer no arquivo.

## As duas fotos, que são coisas diferentes

- **Foto da flor** — "é esta flor que estou chamando de lisianthus". Mora no
  catálogo (`materials.fotoStorageId`), uma por insumo, **um envio para todos os
  eventos da conta**. Opcional: a receita salva sem ela.
- **Referência do arranjo** — "é assim que o arranjo deve ficar". Mora no item,
  vem da Galeria do evento.

No PDF são duas opções independentes, e a legenda da flor avisa, com letra,
quando a foto **pode não ser da cor pedida** — a foto é da flor, e a cor é
decisão de cada projeto. Nenhuma imagem é buscada na internet.

## O que a ficha não faz

Não cria compra, não movimenta estoque, não reserva acervo e não envia nada a
ninguém. O resumo de materiais é papel: providenciar continua em Compras e em
Acervo, pelas telas que já existem.

## Onde está cada coisa

| Arquivo | Papel |
| --- | --- |
| `convex/lib/producaoFloral.ts` | as regras puras (quantidades, resumo, checklist, legenda) |
| `convex/producaoFloral.ts` | `fichaDoFlorista`, `floresDaFicha`, `setInstrucoes` |
| `convex/lib/fichaTecnica.ts` | a multiplicação, agora ciente de `distribuicao` |
| `src/pages/app/events/[id]/producao-floral/` | a tela e os dois diálogos |
| `src/lib/generate-ficha-floral-pdf.ts` | o documento |
| `convex/producaoFloral.test.ts` | contas, isolamento entre contas, trava do PDF |
| `src/pages/app/events/[id]/producao-floral/tela.test.tsx` | a tela renderizada |

## O que ainda não foi validado

Os testes rodam em memória (`convex-test`) e em jsdom. **Não houve validação com
backend Convex real nem no navegador**: a rede deste ambiente recusa
`*.convex.dev` (403 no túnel), então nenhum deployment pôde subir. O que falta
conferir com servidor de verdade:

- gravar instruções e ver o PDF sair com as fotos reais (as imagens entram por
  `fetch` + `createImageBitmap`, que só existem no navegador);
- a ficha de um evento com dezenas de composições, para medir a quebra de página;
- a tela em 390 px de largura real (a trava `mobile-controls` prova que nenhum
  controle some abaixo de `sm`, mas não substitui olhar).
