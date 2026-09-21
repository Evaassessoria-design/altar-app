# Se uma empresa pedir os próprios dados de volta

**Este documento é um MAPA, não um plano.** Ele responde uma pergunta técnica —
*o que conseguimos entregar hoje?* — e não propõe implementação. Exportação
geral é decisão de produto, e é cara o bastante para não ser começada por
suposição.

Datado de 21/09/2026, conferido contra o código em `d9d3cc9`.

---

## A resposta curta

> **"Uso o ALTAR há 12 meses e quero uma cópia dos meus dados."**
>
> Hoje: **os PDFs, evento por evento, gerados à mão por ela.** Mais nada.
>
> Não existe exportação de base — nem CSV, nem JSON, nem ZIP de arquivos. O
> que existe é o caminho inverso: **apagar tudo**, que só o administrador
> executa.

Isso não é um esquecimento pequeno. É a diferença entre "os dados são dela" e
"os dados estão com a gente" — e é a primeira pergunta de cliente grande e de
quem lê LGPD.

---

## O que existe de verdade

### Já exportável (por ela, sozinha)

Seis geradores de PDF, todos por EVENTO, todos disparados por um clique dela:

| Documento | Cobre |
|---|---|
| Relatório do evento | briefing, compras, valores, equipe — **interno** |
| Orçamento | receitas, custos, lucro, margem — **interno** |
| Proposta comercial | escopo e investimento — **da cliente dela** |
| Ficha Técnica | consolidado de materiais |
| Caderno de montagem | itens por ambiente, nas três audiências |
| Folha de carregamento | o que sai e o que volta do galpão |

**O limite é estrutural:** um PDF por evento. Com 40 eventos em 12 meses, são
240 cliques — e PDF é papel, não dado. Ninguém importa um PDF em outro sistema.

### Possível com ferramenta interna (hoje, sem código novo)

O painel do Convex exporta tabela a tabela. Serve para atender um pedido
pontual **com operação manual do Matheus**, e tem dois problemas que não se
resolvem por lá:

1. exporta a tabela INTEIRA, de todas as contas — é preciso filtrar por
   `userId` na mão, e um erro aqui entrega dado de uma decoradora para outra;
2. não traz arquivo nenhum: as fotos, os contratos e as logos ficam para trás.

### Exige implementação

Tudo o mais. E a parte difícil **já está escrita**, o que muda a estimativa:

`deleteUserDataCascade` (`convex/lib/cascade.ts`) já percorre, a partir de um
`userId`, **as 23 tabelas que pertencem a uma decoradora** e os arquivos delas.
Uma exportação é essa mesma travessia com `collect` no lugar de `delete`. O
inventário — que é o que costuma dar errado, porque uma tabela esquecida só
aparece meses depois — já existe e já é testado (`cascade.test.ts`).

### Risco de vínculo / arquivo externo

**É aqui que mora o problema que não é de código.**

Todo arquivo do ALTAR vive no storage do Convex e é entregue por
`ctx.storage.getUrl` — são **10 chamadas** no backend. Essa URL é um endereço
temporário do Convex, não um arquivo que ela tenha. Consequências:

- um "export" que devolvesse links entregaria **ponteiros**, não cópias: se a
  conta for apagada depois, os links morrem e o que ela guardou vira nada;
- uma exportação honesta precisa **baixar cada arquivo e empacotar**, o que
  não se faz numa `mutation` (o Convex não permite requisição externa ali) —
  é trabalho de `action`, com tempo e memória a considerar;
- o volume não é teórico: fotos de evento são o maior peso do produto.

---

## O mapa, categoria por categoria

| | Onde mora | Exportável hoje | Observação |
|---|---|---|---|
| **Clientes** | `leads` | **não** | Nome, telefone, orçamento, estágio, histórico de contato |
| **Eventos** | `events`, `briefings`, `checklistItems` | PDF por evento | Briefing tem 61 campos; nenhum sai em dado estruturado |
| **Propostas** | `proposals` | PDF por proposta | Inclui a versão congelada do que foi enviado |
| **Fornecedores** | `suppliers`, `eventSuppliers` | **não** | Catálogo da empresa + vínculo por evento. Logo é arquivo |
| **Acervo** | `collectionItems`, `collectionAdjustments`, `collectionReservations` | **não** | O histórico de ajustes é auditoria — é o que prova o inventário |
| **Materiais e composições** | `materials`, `compositions` | **não** | É o conhecimento acumulado do estúdio. O que ela mais perderia |
| **Montagem** | `assemblyItems` | PDF (caderno, ficha) | Receitas são snapshots embutidos, então saem junto na linha |
| **Compras** | `purchaseItems` | PDF (relatório) | Vínculo com ficha e financeiro só existe por id |
| **Financeiro** | `transactions`, `budgetItems` | PDF (orçamento) | **12 meses de livro-caixa sem nenhuma saída em planilha** |
| **Equipe** | `teamMembers`, `eventTeam` | **não** | Nome, papel, telefone |
| **Documentos** | `contracts`, `leadDocuments` | **não** | Arquivos no storage |
| **Imagens** | `eventPhotos`, `layoutRenders` | **não** | Arquivos no storage. Maior volume |

**23 tabelas com `userId`. 8 referenciam arquivo no storage.**

---

## O que NÃO se conclui daqui

- **Não é um pedido de implementação.** Exportar bem é caro: empacotar
  arquivo, paginar tabela grande, e decidir formato (CSV por tabela? JSON
  único? ZIP com as duas coisas?) — e formato é decisão de produto.
- **Não é uma leitura jurídica.** O que a LGPD exige em prazo, forma e escopo
  não se responde lendo schema. Este documento serve para essa conversa
  acontecer com o mapa na mão, não para substituí-la.
- **Não diz que o ALTAR está irregular.** Diz o que ele consegue entregar hoje
  se alguém pedir.

---

## O menor caminho honesto, se a decisão vier

Em ordem de retorno sobre esforço, e **sem nenhum deles implementado**:

1. **Financeiro em CSV.** É o pedido mais provável (contador), a tabela é
   plana, não tem arquivo e cabe numa query já existente. Resolve sozinho boa
   parte da ansiedade de "meus números estão presos aí".
2. **Clientes e fornecedores em CSV.** Mesma forma, mesmo custo. São as
   agendas dela.
3. **Catálogo e composições em JSON.** É o conhecimento do estúdio, e a
   estrutura aninhada (receita dentro de composição) pede JSON, não planilha.
4. **Arquivos em ZIP.** O mais caro e o último: exige `action`, download de
   cada arquivo, e uma decisão sobre eventos com centenas de fotos.

Uma exportação parcial e honesta ("aqui está o seu financeiro em planilha")
vale mais do que uma total e adiada.

---

## Uma assimetria que vale registrar

Hoje o ALTAR sabe **apagar** todos os dados de uma decoradora — com cascata
testada, arquivos incluídos — e **não sabe devolvê-los**. As duas operações
percorrem exatamente o mesmo caminho.

Não é argumento para construir agora. É o tipo de coisa que é melhor saber
antes de alguém perguntar.
