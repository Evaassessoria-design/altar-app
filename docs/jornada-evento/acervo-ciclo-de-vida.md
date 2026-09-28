# Ciclo de vida do acervo

Regra: `convex/lib/condicaoDoAcervo.ts`. Gravação: `convex/acervo.ts`
(`moverCondicao`, `conferirRetorno`). Telas: `/acervo` (galpão) e
`OcorrenciaDeAcervoDialog`.

## Antes

- `quantidadeTotal` e, desde 28/09, `emManutencao`.
- Peça que voltou quebrada: ou continuava "disponível", ou saía do acervo como
  avaria. Não existia "precisa lavar".
- Ocorrência: 6–7 toques em alvos de 36 px, sem foto e sem autor.

## As condições

| Condição | Onde mora | O que é |
|---|---|---|
| **Pronto para uso** | **derivado**: total − as outras quatro | pode sair para evento |
| Precisa limpar | `collectionItems.emLimpeza` | lavar, passar, polir |
| Precisa de reparo | `collectionItems.emManutencao` | o campo que já existia — não há segundo "reparo" |
| Danificado / indisponível | `collectionItems.indisponivel` | não sai, e não tem conserto previsto |
| Em conferência | `collectionItems.emConferencia` | voltou, ainda não olhado |

Contadores por item porque o acervo é contado por **quantidade** (não há peça
numerada). Ausente = 0; nenhum backfill. "Pronto" nunca é gravado: um segundo
número para a mesma coisa divergiria na primeira peça que voltasse do conserto.

## Disponibilidade real

`disponibilidadeNaJanela(total, reservas, janela, evento, foraDeUso)`:

```
disponível = total
           − reservado por outros eventos na mesma janela (ou o que saiu, se mais)
           − peças de eventos encerrados que não voltaram
           − peças fora de uso (limpeza + reparo + indisponível + conferência)
```

O mesmo desconto vale para o pior dia da lista (`picoDeReservas`) e para o
bloco Pós-evento. Peça **indisponível não bloqueia a reserva** — decisão do
módulo desde o início: a decoradora resolve alugando ou comprando, e cortar a
reserva esconderia o problema. O **déficit aparece**.

## Ocorrência

`acervo.moverCondicao({ item, de, para, quantidade, motivo, eventId?,
responsibleId?, fotoStorageId? })` — `para` pode ser `"baixa"` (sem conserto:
sai do total e da condição de origem).

Travas: não move mais do que existe na origem; quantidade física válida para a
unidade; o conserto (fluxo antigo) só recebe peça pronta; baixa comum não deixa
o total abaixo do que está fora de uso.

## Histórico — nada é sobrescrito

Toda mudança grava em `collectionAdjustments` (tipo `condicao`): condição
anterior (`condicaoDe`), nova (`condicaoPara`), **quantas** (`quantidadeMovida`
— o `delta` explica o total e é zero numa mudança de condição), observação,
evento de procedência, membro da equipe (`responsibleId`) e foto
(`fotoStorageId`). O histórico devolve o nome de quem registrou e a URL da foto.

"Registrado por" é um **membro da equipe** (`teamMembers`), escolhido na tela:
o login é da empresa, não de cada pessoa do galpão.

## Visão do galpão

`/acervo`: por item, **N prontas** e as outras condições só quando existem;
filtros rápidos Tudo / Pronto / Limpeza / Reparo / Indisponível / Conferência
(sobre a lista inteira — `listItems` não pagina); botão **Ocorrência** de 44 px.

A ocorrência no celular: de onde a peça sai → para onde vai (botões ≥ 48 px) →
quantas (+/−, começa em 1) → o que aconteceu → foto pela câmera → quem
registrou. A prévia usa a mesma função do servidor.

## Testes

`convex/lib/condicaoDoAcervo.test.ts`, `convex/acervo.condicao.test.ts`,
`_components/jornada-e-galpao.test.tsx`.
