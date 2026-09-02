# Ficha Técnica — auditoria arquitetural

> **Este documento não implementa nada.** É o levantamento pedido antes de
> decidir se a Ficha Técnica vira funcionalidade, e em que forma. Nenhum
> schema, nenhuma query e nenhuma tela foram alterados por causa dele.
>
> Escrito ao final do MASTER #5, com o código na branch
> `claude/altar-project-analysis-ah81bt`.

---

## 1. O que "Ficha Técnica" quer dizer numa empresa de decoração

No vocabulário do setor, a ficha técnica é a **descrição executável de uma
peça ou composição**: o que ela é, do que é feita, quantas pessoas e quanto
tempo para montar, o que precisa no local (energia, altura de pé-direito,
piso), quanto pesa, quanto ocupa no caminhão, e quanto custa produzir.

Ela responde a três perguntas diferentes, e **é aqui que mora o risco do
projeto**:

| Pergunta | Quem faz | Quando |
|---|---|---|
| "Quanto cobro por este arco?" | comercial | antes da venda |
| "O que preciso levar e quantas pessoas para montá-lo?" | operação | véspera |
| "Já montei isto antes? Como ficou?" | criação | na proposta seguinte |

Uma tabela só que tente responder às três vira um formulário longo que
ninguém preenche. **A decisão arquitetural principal não é onde guardar — é
quais das três perguntas o ALTAR vai responder.**

---

## 2. O que o ALTAR já tem hoje (levantamento, não opinião)

### 2.1 `assemblyItems` — o item de montagem
Arquivo: `convex/schema.ts`, tabela `assemblyItems`.

Já carrega quase toda a identidade de uma peça:

```
area            → o ambiente (cerimônia, mesa do bolo, lounge…)
name            → a composição ("Arco de oliveiras", "Mesa posta")
model, quantity, unit
supplierId / supplierName
ambiente, notes
referencePhotoStorageId    → o que foi aprovado
contractedPhotoStorageId   → o que foi de fato contratado
projectScope               → incluso | referencia | nao_incluso
operationalStatus          → pendente → separado → carregado → conferido → retornou
visibility                 → interno | cliente | equipe
createdAt, updatedAt
```

`src/lib/decoration-project.ts` já documenta, no topo do arquivo, por que o
Projeto de Decoração **não** criou tabela nova: `assemblyItems` já é o modelo
de composição, e um segundo cadastro divergiria do primeiro na primeira
semana. A mesma lógica se aplica aqui e é o argumento mais forte deste
documento.

**O que falta para virar ficha técnica:** tudo o que é *especificação* e não
*ocorrência* — tempo de montagem, equipe necessária, peso, volume,
requisitos do local, custo de produção.

### 2.2 `suppliers` — o precedente de catálogo central
Arquivo: `convex/schema.ts`, tabela `suppliers`, mais `convex/supplierCatalog.ts`
(normalização em `convex/lib/supplierIdentity.ts`).

Este é **o precedente mais importante para a Ficha Técnica**, porque o
problema resolvido lá é exatamente o mesmo: uma entidade que se repete entre
eventos e que antes era redigitada em cada um.

A solução adotada, e que funcionou:

1. tabela nova só para o que **se repete** (`suppliers`);
2. o que é da **relação com um evento** ficou onde estava (`eventSuppliers`);
3. vínculo opcional (`supplierId`), então nada precisou de backfill;
4. o nome continua denormalizado no evento — **sobrevive à exclusão do
   fornecedor** e preserva o histórico;
5. `searchName` normalizado para busca e deduplicação.

Uma Ficha Técnica seguiria esse desenho letra por letra.

### 2.3 O que já lê os itens de montagem
Antes de mexer na estrutura, esta é a lista do que quebraria:

| Consumidor | Arquivo |
|---|---|
| Caderno de Montagem (tela) | `src/pages/app/events/[id]/_components/assembly-items-section.tsx` |
| Projeto de Decoração | `src/lib/decoration-project.ts` |
| Folha de Carregamento | `src/lib/loading-sheet.ts` |
| PDF de montagem | `src/lib/generate-assembly-pdf.ts` |
| PDF de carregamento | `src/lib/generate-loading-pdf.ts` |
| Saúde do evento (critério "Montagem planejada") | `convex/health.ts` |
| Cascata de exclusão (duas fotos por item) | `convex/lib/cascade.ts` |

São sete consumidores. **Qualquer campo obrigatório novo em `assemblyItems`
atinge os sete.** Campo opcional não atinge nenhum — é a regra que este
projeto vem seguindo desde o MASTER #3 e não há motivo para abrir exceção.

---

## 3. Os três desenhos possíveis

### Opção A — Campos novos em `assemblyItems`
Acrescentar `montagemMinutos`, `pessoasNecessarias`, `pesoKg`, `volumeM3`,
`requisitos` diretamente no item.

- **A favor:** zero tabela nova, zero vínculo, nada quebra. Uma tarde de
  trabalho.
- **Contra:** a especificação é **por ocorrência**, não por peça. A
  decoradora redigita "arco de oliveiras: 90 min, 2 pessoas" em cada
  casamento. É exatamente o problema que o catálogo de fornecedores existiu
  para resolver — e a ficha ficaria refém do evento: apagou o evento,
  apagou a ficha.
- **Veredito:** resolve a pergunta da operação, não resolve as outras duas.
  Serve como primeiro passo, nunca como destino.

### Opção B — Tabela `fichasTecnicas` + vínculo opcional (recomendada)
Espelho exato do que foi feito com `suppliers`:

```
fichasTecnicas: {
  userId, nome, searchName, categoria?,
  montagemMinutos?, pessoasNecessarias?,
  pesoKg?, volumeM3?, requisitos?,
  custoProducao?, fotoStorageId?, notes?,
  updatedAt?
}
assemblyItems.fichaId?: Id<"fichasTecnicas">   // opcional, sem backfill
```

- **A favor:** cadastra uma vez, usa em todo evento; o item continua
  guardando o que valeu *naquele* evento (histórico preservado, igual ao
  `supplierName` denormalizado); vínculo opcional não toca em nenhum dos sete
  consumidores; a Folha de Carregamento poderia enfim somar peso e volume
  reais em vez de contar caixas.
- **Contra:** é cadastro. Cadastro que ninguém preenche é pior do que não
  existir, e a decoradora já preenche briefing, checklist, compras,
  fornecedores e montagem.
- **Mitigação óbvia:** a ficha nasce **a partir de um item que já existe**
  ("salvar como ficha técnica"), nunca de um formulário em branco. Foi assim
  que o catálogo de fornecedores foi povoado.

### Opção C — Ficha como documento gerado
Não guardar especificação nenhuma: montar um PDF a partir do que já existe
(nome, foto, fornecedor, quantidade, ambiente).

- **A favor:** entrega valor sem cadastro nenhum e reaproveita
  `generate-assembly-pdf.ts`.
- **Contra:** não responde nenhuma das três perguntas — só reimprime o que a
  decoradora já vê na tela. É uma ficha com o nome de ficha e sem o conteúdo
  de ficha.

---

## 4. O que precisa ser resolvido ANTES de qualquer implementação

Estes pontos não são detalhes de implementação; são decisões que, se ficarem
para depois, viram retrabalho.

1. **Qual das três perguntas.** Sem escolher uma, a tabela vira um formulário
   longo. A recomendação técnica é começar pela **operação** (tempo, equipe,
   peso, volume): é a única cujos dados a decoradora já tem na cabeça e
   consegue preencher sem consultar planilha.

2. **Ficha é da peça ou da composição?** "Cadeira Tiffany" e "Mesa posta para
   10" são coisas de naturezas diferentes: a primeira é unitária e se
   multiplica; a segunda é um conjunto. Misturar as duas na mesma tabela
   obriga toda soma de peso e volume a saber a diferença. **Esta é a decisão
   com maior custo de reversão** — vale definir antes de escrever a primeira
   linha.

3. **Custo de produção conversa com o Bloco A?** `convex/lib/custoDoEvento.ts`
   estabeleceu que `transactions` é o livro e que a margem só é afirmada
   quando não há compra fora do livro. Um `custoProducao` estimado na ficha
   **não pode** entrar nessa conta: seria estimativa entrando como fato, e
   derrubaria a garantia que o Bloco A construiu. Se entrar, entra como
   número separado e rotulado como estimativa.

4. **Herança na hora do vínculo.** Vincular um item a uma ficha copia os
   valores para o item ou lê ao vivo? O catálogo de fornecedores respondeu
   isto: **denormaliza o essencial** (o nome sobrevive à exclusão) e lê o
   resto ao vivo. Sem essa decisão, apagar uma ficha apagaria a memória de
   quanto pesava o arco no casamento do ano passado.

5. **Exclusão.** Repetir a regra de `lib/cascade.ts`: apagar a ficha **limpa
   o vínculo**, nunca apaga o item; apagar o evento **nunca** apaga a ficha
   (ela é da empresa, como o catálogo de fornecedores).

---

## 5. Recomendação

**Opção B, restrita à pergunta da operação, e povoada a partir de itens que
já existem.** Ordem sugerida:

1. `fichasTecnicas` com campos operacionais, todos opcionais;
2. `assemblyItems.fichaId` opcional, sem backfill;
3. ação "salvar como ficha técnica" no item de montagem — o cadastro nasce
   de trabalho já feito;
4. só então: soma de peso e volume na Folha de Carregamento, que é o primeiro
   ganho que a decoradora sente sem precisar aprender tela nova.

O que **não** fazer agora: custo de produção (item 3 acima), ficha de
composição misturada com ficha de peça (item 2), e qualquer campo obrigatório
em `assemblyItems`.

---

## 6. Resumo em uma linha

A Ficha Técnica não precisa de arquitetura nova — precisa da **mesma**
arquitetura do catálogo de fornecedores, aplicada a peças em vez de empresas,
e restrita à única pergunta cujos dados a decoradora consegue preencher sem
abrir uma planilha.
