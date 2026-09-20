# ALTAR Buffet — o que já serve e o que falta

Este documento responde a uma pergunta de engenharia, não de vendas: **quanto
do ALTAR atual um buffet usaria sem mudança?**

A resposta curta é *mais do que parece*. O ALTAR foi construído como sistema de
operação de evento, não como sistema de flor. O que é realmente específico de
decoração é um trecho só — mas é o trecho mais valioso, e é justamente ele que
precisa de um equivalente.

Datado de 20/09/2026, conferido contra o código em `e05863b`. Nada aqui é
implementação: é mapa.

> **Nada de ALTAR Buffet foi construído nesta rodada**, por instrução. Este
> arquivo existe para que a decisão de construir seja tomada com o tamanho
> certo na mão.

---

## O que a arquitetura já garante

Três coisas já estão no lugar, e nenhuma delas é pequena:

1. **A vertical já existe e vem do ambiente.** `convex/lib/central/vertical.ts`
   define `["altar_decor", "altar_buffet"]`, resolve a partir de
   `ALTAR_VERTICAL` e cai no padrão quando a variável falta. A Central já
   carimba `vertical` em toda entidade e a usa como **primeiro componente de
   todo índice de listagem** — inclusive no índice de busca. O comentário do
   módulo explica por que isso foi feito antes de precisar: sem o campo, seria
   preciso reescrever todos os índices e fazer backfill.
2. **Deployments separados, por decisão.** Decor e Buffet vivem em projetos
   Convex distintos. Não há multiempresa a resolver antes.
3. **O produto já não se descreve como sistema de casamento.**
   `src/lib/produto-generico.test.ts` trava isso por leitura de código: nenhum
   placeholder cita casamento sem citar outro tipo de evento, e o cliente é
   "cliente", não "casal". O trabalho de generalização da linguagem já foi
   feito.

---

## 1. REUTILIZA DIRETO

Serve a um buffet sem tocar em uma linha. São módulos sobre **operação de
evento**, não sobre decoração.

| Módulo | Evidência | Por que serve igual |
|---|---|---|
| **Eventos** | `convex/events.ts`, `src/lib/event-types.ts` | Cadastro, data, local, cliente, status. Os seis tipos de evento já cobrem a agenda de um buffet. |
| **Funil** | `convex/funil.ts`, sete estágios | Um buffet negocia igual: contato, visita, proposta, negociação, fechado. |
| **Documentos do lead** | `convex/leadDocuments.ts` | Proposta, contrato, comprovante — antes de existir evento. |
| **Equipe e escala** | `convex/team.ts` | Função, horário, contato por evento. Um buffet escala garçom e cozinha exatamente assim. |
| **Fornecedores** | `convex/supplierCatalog.ts`, `suppliers.ts` | Catálogo por empresa, dossiê por evento, alinhamentos datados. |
| **Compras** | `convex/purchases.ts` | Categoria, fornecedor, responsável, prazo, panorama da semana, vínculo com o caixa. |
| **Financeiro** | `convex/financeiro.ts` | Livro-caixa, contas a receber e a pagar, orçado × real. |
| **Agenda e dashboard** | `convex/agenda.ts`, `dashboard.ts`, `health.ts` | "O que precisa de mim hoje" independe do que se entrega. |
| **Galeria e contratos** | `convex/gallery.ts`, `contracts.ts` | Fotos por fase e a Pasta do Evento com cinco tipos de documento. |
| **Assinatura e paywall** | `convex/asaas*.ts`, `lib/access.ts` | Cobrança é do SaaS, não da vertical. |
| **Central de Comunicações** | `convex/communications*.ts` | Já é multicanal E multivertical por construção. |
| **Admin** | `convex/admin.ts` | Operação do SaaS. |
| **Leitura e validação de dinheiro** | `convex/lib/dinheiro.ts`, `src/lib/valor-digitado.ts` | "1.500,00" é mil e quinhentos em qualquer vertical, e `NaN` estraga a soma de qualquer uma. A regra não sabe o que está sendo vendido. |
| **Audiência dos documentos** | `src/lib/audiencia-do-caderno.ts`, `briefing-areas.ts` | Interno / equipe / cliente, e agora campo a campo: fornecedor e observação interna não vão no documento do cliente. Um buffet tem exatamente a mesma separação. |
| **Primeiros passos** | `src/lib/primeiros-passos.ts` | Configurar o estúdio e criar o primeiro evento é o começo de qualquer vertical. |
| **Ações destrutivas e estados vazios** | `src/lib/acoes-destrutivas.test.ts`, `estados-vazios.test.ts` | São travas de comportamento, não de conteúdo: a próxima tela nasce com elas seja de flor ou de cozinha. |

**Dependências**: nenhuma. **Risco**: baixo.

---

## 2. REUTILIZA COM ADAPTAÇÃO

Funciona, mas diz a coisa errada para um buffet. São mudanças de **vocabulário
e de escopo**, não de arquitetura.

### Escopo financeiro — a inversão que importa mais

- **Evidência**: `convex/lib/financeScope.ts` e `lib/escopoDecoradora.ts`
- **O que dizem hoje**: "Buffet, locação do espaço, fotografia, vídeo, DJ,
  banda, bar, assessoria e celebrante são fornecedores do CASAL — a decoradora
  não os paga e não os recebe. Lançá-los aqui produziria uma margem inventada."
- **Por que inverte**: para um buffet, **o buffet é a receita**. A regra que
  protege a margem da decoradora, aplicada a um buffet, jogaria fora o
  faturamento principal da empresa.
- **O que fazer**: o escopo precisa virar função da vertical. A regra em si
  está certa e bem escrita — o que falta é ela perguntar "qual vertical?" antes
  de decidir o que é custo próprio e o que é fornecedor do cliente.
- **Risco**: **médio-alto.** É a regra que governa margem. Um erro aqui produz
  número errado em tela de dinheiro.
- **Dependências**: decidir se Decor e Buffet compartilham código de escopo ou
  cada deployment carrega o seu.

### Categorias de fornecedor

- **Evidência**: `src/lib/supplier-categories.ts` — a lista já foi corrigida
  uma vez, de assessoria para decoração
- **Adaptação**: um buffet precisa de hortifrúti, proteína, bebidas,
  descartáveis, equipamento de cozinha, locação de louça. Lista diferente,
  mesmo mecanismo — a categoria já aceita texto livre além dos slugs fixos.
- **Risco**: baixo. **Dependências**: nenhuma.

### Briefing

- **Evidência**: `src/lib/briefing-areas.ts` — 61 campos em 8 áreas
- **Adaptação**: as áreas *Flores*, *Bolo e Doces*, *Iluminação* e *Mobiliário*
  não são de buffet. As de *Informações Gerais*, *Cerimônia*, *Festa* e
  *Operação* são. Um buffet precisa de cardápio, restrições alimentares,
  horário de serviço, número de pratos por convidado, estrutura de cozinha no
  local.
- **Nota**: a regra de audiência (`interno`/`equipe`/`cliente`) e a de "campo
  vazio não aparece" são genéricas e servem inteiras.
- **Risco**: baixo — é conteúdo, não estrutura. **Dependências**: nenhuma.

### Checklist e folha de carregamento

- **Evidência**: `convex/checklistItems`, `src/lib/generate-loading-pdf.ts`
- **Adaptação**: o mecanismo (item, quantidade, conferir antes e depois) serve.
  O vocabulário muda: um buffet carrega réchaud, louça, talher e insumo
  perecível — e o perecível tem regra própria que o ALTAR não conhece.
- **Risco**: baixo para o básico; ver §4 para o perecível.

---

## 3. ESPECÍFICO DE BUFFET — precisa ser construído

É aqui que está o trabalho de verdade. E a boa notícia é que o **formato** já
existe: a cadeia de produção da decoração tem um paralelo quase exato.

```
DECOR    material → composição → ficha técnica → consolidado → compra
BUFFET   insumo   → receita    → ficha técnica → consolidado → compra
```

`convex/lib/fichaTecnica.ts` já é genérico o bastante para isso: ele multiplica
quantidade de composição por quantidade por unidade, soma por material e
unidade, respeita margem de segurança e separa necessário de sugerido. Nada
disso é sobre flor.

### O que muda de verdade

| Conceito | Decor | Buffet | Impacto |
|---|---|---|---|
| Unidade de multiplicação | ambiente × peça | **convidado × prato** | A mesa posta do demo já é receita POR COUVERT — o padrão existe |
| Perecibilidade | flor murcha em dias | **insumo estraga em horas** | Não existe no modelo |
| Rendimento | 1 arranjo = 1 arranjo | **1 kg rende N porções** | Não existe: falta fator de rendimento |
| Retorno ao acervo | vaso volta | **comida não volta** | `tipo: consumivel` já cobre |
| Segurança | — | **alergênico, ficha técnica sanitária** | Não existe, e é obrigação legal |
| Pico de demanda | acervo por janela | **cozinha por horário** | `picoDeReservas` é análogo, e já corta o que ficou no passado |

### Itens

| Item | Situação | Risco | Depende de |
|---|---|---|---|
| Cardápio como entidade | **NÃO EXISTE** — mas a biblioteca de receitas está mais perto | médio | decidir se é `compositions` com outro rótulo ou tabela própria |
| Rendimento (kg → porções) | **NÃO EXISTE** | médio | é um campo na receita, não uma arquitetura |
| Restrição alimentar e alergênico | **NÃO EXISTE** | **alto** — é risco à saúde, não recurso | decisão de produto |
| Ficha técnica sanitária | **NÃO EXISTE** | alto | legislação, fora do que o código sabe |
| Escala de cozinha por horário | **NÃO EXISTE** | baixo | `eventTeam` já tem `scheduledTime` |
| Custo por convidado | **NÃO EXISTE** | baixo | é divisão sobre o que `custoDoEvento` já calcula |

---

## 4. NÃO EXISTE E NÃO DEVE SER COPIADO

Coisas que parecem reaproveitáveis e não são:

- **Acervo** (`convex/acervo.ts`). O acervo é o que **volta para o galpão**.
  Insumo de buffet não volta. Copiar a reserva para comida produziria um
  controle de estoque perecível travestido de acervo — e estoque perecível tem
  validade, lote e temperatura, que o modelo não tem. Um buffet precisa de
  estoque, mas não *deste* estoque.
- **Planta Premium** (`convex/aiVisual.ts`). Croqui vira planta de decoração.
  Um buffet quer mapa de serviço e disposição de ilhas — problema diferente.
- **Caderno de montagem** como está. O documento é bom; o conteúdo é de
  decoração. Vira "ordem de serviço da cozinha", com a mesma engenharia de
  audiência.

---

## 5. Ordem recomendada

Do que destrava mais por menos, e sem nada que dependa de decisão não tomada.

1. **Vocabulário e categorias** — lista de fornecedores, rótulos e textos da
   vertical. Baixo risco, e é o que faz um buffet reconhecer o produto como
   dele na primeira tela. *Depende de: nada.*
2. **Briefing do buffet** — trocar as quatro áreas de decoração por cardápio,
   serviço, restrições e cozinha. É conteúdo em `briefing-areas.ts`.
   *Depende de: 1.*
3. **Escopo financeiro por vertical** — a inversão da §2. Precisa vir **antes**
   de qualquer número de margem aparecer para um buffet, senão o produto mente
   na tela mais sensível que tem. *Depende de: decisão de produto.*
4. **Receita com rendimento** — um campo na linha da receita (`1 kg rende 8
   porções`) e o consolidado já multiplica certo. *Depende de: 2.*
5. **Cardápio reaproveitável** — provavelmente `compositions` com outro rótulo,
   não tabela nova. O ciclo da biblioteca fechou nesta rodada (guardar do
   trabalho já feito, recusar o nome repetido, renomear, arquivar e ver onde
   foi usada), então o que falta é o rótulo e o rendimento, não o mecanismo.
   *Depende de: 4.*
6. **Alergênicos e restrições** — última porque é a de maior risco e a que
   menos tolera improviso. *Depende de: decisão de produto e, provavelmente, de
   quem entenda de legislação sanitária.*

---

## 6. As três decisões antes da primeira linha de código

1. **Deployment separado ou vertical no mesmo banco?** A arquitetura hoje
   assume separado, e a coluna `vertical` existe para o dia em que não for. As
   duas respostas são defensáveis; a diferença é grande demais para ser
   decidida por quem estiver implementando.
2. **O escopo financeiro é compartilhado ou próprio de cada vertical?** É a
   regra que governa margem.
3. **Alergênico entra ou fica de fora?** Se entrar, o ALTAR passa a carregar
   informação cuja falha machuca alguém. Isso muda o padrão de teste, o de
   revisão e possivelmente o contrato.

---

## 7. Estimativa honesta

Sem contar as decisões acima, que não são trabalho de código:

- **§1 e a parte de vocabulário da §2**: um buffet já operaria o dia a dia —
  eventos, funil, fornecedores, equipe, compras, financeiro, documentos.
- **§3 inteira**: é o que separa "um buffet consegue usar" de "um buffet vai
  querer pagar". A cadeia de produção é o diferencial do ALTAR, e sem o
  equivalente dela o ALTAR Buffet é um CRM comum.

A conclusão prática: **a fundação está pronta e o diferencial não está.** Não é
um segundo sistema; é um trecho — o mais valioso — construído de novo com o
mesmo formato.


---

## 8. O que mudou neste mapa desde a primeira versão

A rodada "primeiros clientes reais" não construiu nada de Buffet — por
instrução — mas mexeu em peças que este mapa classifica, e três delas mudaram
de tamanho:

- **Dinheiro virou regra pura e testada.** `convex/lib/dinheiro.ts` e
  `src/lib/valor-digitado.ts` nasceram de um defeito do Decor ("1.500,00"
  entrava como 1,50 em cinco telas), e são **REUTILIZA DIRETO**: um buffet
  digita dinheiro do mesmo jeito, e um `NaN` estraga a soma dele igual.
- **A audiência dos documentos ficou mais fina.** Deixou de ser só "este item
  aparece?" e passou a ser também "este CAMPO aparece?" — fornecedor e
  observação interna não vão no documento da cliente. A §2 já dizia que a
  engenharia de audiência serve inteira; ela agora serve com mais precisão, e é
  o que a "ordem de serviço da cozinha" da §4 vai herdar.
- **A biblioteca de composições fechou o ciclo.** Guardar a partir do trabalho
  já feito, recusar o nome repetido, renomear, arquivar e ver onde a receita já
  foi usada. Para o Buffet isso importa porque o cardápio é o mesmo mecanismo:
  o que falta ali é o **rendimento** (1 kg rende N porções) e o rótulo, não a
  estrutura.

E uma que **não** mudou, de propósito: **`financeScope` continua como estava.**
A inversão descrita na §2 é a decisão de produto mais cara deste mapa, e mexer
nela sem a decisão produziria margem errada na tela mais sensível do produto.
