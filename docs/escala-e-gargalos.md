# Escala — o que aguenta, o que dói, e onde

Medido contra o código em `24/09/2026`. A decoradora piloto tem **cerca de 40
eventos**; os números de 80 e 300 são projeção da forma das consultas, não
medição em banco cheio.

---

## O que foi corrigido

Duas telas liam o banco **uma vez por evento**. As duas foram para leitura em
lote, e o custo delas deixou de crescer com o número de eventos.

| Consulta | Antes (40 eventos) | Depois | Onde |
|---|---|---|---|
| `health.listCards` | ~360 operações | **7** | tela de Eventos |
| `dashboard.getAttentionBoard` | ~160 operações | **6** | Dashboard |

O padrão nos dois casos era o mesmo: `eventos.map(async …)` com consultas
dentro. Há trava de leitura de fonte em `convex/eventos.escala.test.ts` que
falha se `ctx.db` voltar para dentro de qualquer um dos dois laços.

---

## O gargalo que permanece: `assemblyItems` na listagem

### O problema

`health.listCards` precisa saber, por evento, se existe **pelo menos um** item
de montagem — é o critério "Montagem planejada" da saúde.

Convex não tem contagem agregada nem projeção de colunas. Para responder
"quais eventos têm ≥ 1 item", a consulta lê **todas as linhas** de
`assemblyItems` da conta. E cada linha pode carregar `receita`, um array de
componentes com nome, unidade, quantidade, custo e margem.

### O impacto, em ordem de grandeza

Estimando ~1,5 KB por item com receita de dez linhas:

| Eventos | Itens (≈50/evento) | Leitura | Situação |
|---|---|---|---|
| 40 | 2.000 | ~3 MB | confortável |
| 80 | 4.000 | ~6 MB | **começa a doer** |
| 300 | 15.000 | ~22 MB | **estoura o limite de leitura da consulta** |

A 300 eventos a tela de Eventos não fica lenta: ela **falha**.

O número real depende de quanto a conta usa a Ficha Técnica — `receita` é
opcional, e item sem receita pesa uma fração disso. Uma conta com 300 eventos
e pouca ficha técnica passa; uma com ficha em tudo, não.

### A solução recomendada

Um contador denormalizado em `events`:

```ts
// events
/** Quantos itens de montagem este evento tem. Mantido na mesma mutation. */
itensDeMontagem: v.optional(v.number()),
```

Regra da casa que isto respeita e a que ele abre exceção: "estado derivável é
derivado, não gravado". A exceção se justifica porque o derivado aqui custa
uma leitura que não cabe na consulta — e o campo é **contagem**, não regra: se
ele divergir, a saúde erra um critério de sete, não quebra operação.

`AUSENTE` significa "nunca foi contado", e a leitura cai no comportamento
atual. É o que permite ligar isto sem backfill.

### A migração necessária

1. Campo opcional no schema (aditivo, sem risco).
2. Incrementar em `assemblyItems.create`/`createMany`, decrementar em `remove`,
   e zerar na cascata — **na mesma mutation**, sempre, senão os dois números
   divergem no primeiro erro.
3. `listCards` passa a ler o campo e a tratar `undefined` como "não contado",
   lendo daquele evento sob demanda.
4. Uma mutation interna de backfill, paginada com `ctx.scheduler`, para
   preencher as contas existentes.

### Quando executar

**Não antes da live.** O piloto está em 40 eventos e a tela responde bem; a
mudança toca criação e exclusão de item de montagem, que são caminhos usados
todos os dias.

Gatilho: **a primeira conta passar de 100 eventos**, ou a tela de Eventos
começar a demorar de forma perceptível. Antes disso, é complexidade comprada
adiantada.

---

## Interessados no ALTAR

| Volume | Situação |
|---|---|
| 100 | confortável |
| 500 | confortável — a listagem tem teto de 200 e **declara** quando há mais |
| 2.000 | a listagem continua bem; o funil da campanha varre até 5.000 e avisa quando para |

A importação tem teto de **1.000 linhas por arquivo**, e o corte é declarado
no preview e na confirmação. A deduplicação busca por índice, linha a linha:
o custo cresce com o **arquivo**, nunca com a base.

---

## Consultas sem teto que restam

Nenhuma delas é gargalo hoje, e todas crescem com dados da conta:

| Consulta | Lê | Risco |
|---|---|---|
| `financeiro.listTransactions` | todos os lançamentos | alto volume em conta antiga — a tela não pagina |
| `materials.list` | catálogo inteiro | centenas, não milhares |
| `purchases.listPanorama` | todas as compras | cresce com o histórico |
| `admin.listUsers` / `getStats` | todos os assinantes | é do painel ALTAR, e some com o crescimento do SaaS |

Todas seguem o mesmo caminho quando doerem: teto + `temMais` na resposta,
como a listagem de interessados já faz.

---

## Como medir de novo

A trava de escala vive em `convex/eventos.escala.test.ts`. Ela não mede tempo
— mede **forma**: nenhuma consulta dentro de laço por evento, e leitura por
dono onde deve. Tempo em teste é flaky; forma não é.
