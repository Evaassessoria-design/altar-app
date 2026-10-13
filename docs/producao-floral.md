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

## Decisões de produto de 12/10 (branch `feature/producao-floral-ajustes`)

| Decisão | Como ficou |
| --- | --- |
| Resumo não soma itens diferentes | Chave = material (ou nome) + variedade + cor + natural/permanente + unidade. Rosa branca natural e rosa rosê permanente são duas linhas |
| Editar cor/origem não mexe em custo, margem, unidade, quantidade | `producaoFloral.setLinhasFlorais` faz patch só dos campos florais; quantidade só muda se a tela a mandar (a decoradora alterou); índice com nome/material diferente = CONFLITO, nada gravado |
| Papel do florista sem contato nem nota interna | A consulta não devolve mais o nome da cliente; `notes` (interna) não sai; campo novo `orientacaoFlorista` ("Orientações para o florista"), opcional |
| Fotos pelo ID | Resumo e legenda carregam `materialId`; a tela abre o material pelo `_id` |
| "Só orientação" não apaga a quantidade | O número fica guardado; desmarcar devolve |
| Ficha Técnica: por arranjo × total distribuído | `contaDaLinha`/`textoDaConta`: "5 haste × 20 = 100", "2 maço no total, distribuídos", "orientação, fora dos totais" — tela e PDF |
| Diálogos no celular | `max-h-[90dvh]`, grade de uma coluna abaixo de `sm` |

Defeito achado no caminho e corrigido: **salvar a receita na Ficha Técnica
apagava a parte floral** (o diálogo de lá remontava a linha só com material,
nome, unidade e quantidade). A linha agora carrega o resto e o devolve.

## Validação no DEV (13/10, `healthy-pika-907`, conta de teste)

Backend da branch enviado ao DEV com autorização (PROD não tocado). No evento
"TESTE Atalhos": dois itens criados pelo Questionário (um com nome longo, 20
unidades; outro com 4), receitas pela Ficha Técnica (5 hastes, 2 maços, 3 un;
12 hastes, 0,5 maço), parte floral pela Produção floral.

- Resumo: Rosa branca natural 100 · Rosa rosê permanente 48 · Eucalipto 2 + 2
  (cores diferentes) — nada somado indevidamente.
- "Só orientação": campo some; ao desmarcar volta 3 (gravado no banco).
- Salvar na Ficha Técnica sem mudar nada: cor, origem, distribuição e
  orientação continuaram.
- Ficha Técnica: "2 maço no total, distribuídos" e "orientação, fora dos
  totais" na tela e no diálogo.
- Foto da flor enviada pelo diálogo do material (aberto pelo id): aparece nos
  dois cartões da rosa, com o aviso "pode não ser a cor pedida".
- Referência do arranjo pela Galeria: sai no PDF com rótulo próprio.
- PDF conferido na tela (3 páginas): nome longo quebra antes de "20
  arranjos" e no aviso; frações e unidades certas; sem nome de cliente, sem
  nota interna, sem valor. Dois defeitos achados aqui e corrigidos: título do
  aviso que vazava a margem; nome do arquivo com acento ("anivers-rio").
- Celular (iframe de 390 px no PC, não aparelho real): página e diálogos sem
  rolagem lateral, altura em dvh.

## Limitações conhecidas

- O consolidado de COMPRA da Ficha Técnica continua por material + unidade
  (Rosa 148 hastes): é a pergunta "quanto comprar desse cadastro". Separar por
  cor/origem lá é decisão de produto à parte.
- A miniatura dentro do diálogo do material não atualiza na hora do envio
  (o cartão da ficha atualiza).
- A ficha com dezenas de composições não foi medida (quebra de página).
- Celular real não validado.
