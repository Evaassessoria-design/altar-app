# A experiência visual do ALTAR

Como o produto representa, hoje, o trabalho de uma empresa de decoração — e
onde ele ainda só organiza em vez de mostrar.

Datado de 21/09/2026, conferido contra o código em `b94c891`.

---

## 0. Quem faz o quê

Seis lugares, seis papéis. **Nenhum compete com os outros** — e nenhum guarda o
que já é de outro.

| | O que é | O que NÃO é |
|---|---|---|
| **GALERIA** | A **biblioteca de imagens** do evento. Único lugar que sobe, classifica e apaga foto | Não é a visão do projeto |
| **PROJETO VISUAL** | A **visão criativa**: como o evento deve ficar, ambiente por ambiente. LÊ a galeria e os itens; não guarda nada | Não é galeria, não é caderno |
| **CADERNO DE MONTAGEM** | A **instrução de execução**, em papel, para o galpão | Não é moodboard |
| **FICHA TÉCNICA** | **Composição e materiais**: o que comprar e quanto | Não é visual |
| **LAYOUT / PLANTA** | A **organização espacial** | Não marca posição de ambiente (ainda) |
| **RESULTADO FINAL** | O **registro da execução** — fotos de `montagem`/`evento`/`desmontagem` | Não é inspiração |

A regra que mantém isso: **um dado, um dono.** A foto pertence à Galeria; o
Projeto Visual a exibe. Classificar na Galeria muda o Projeto no mesmo
instante, porque é o mesmo registro — não há cópia.

---

## 1. O sistema visual dos documentos

São **seis**, e até esta rodada eram **duas famílias**.

| Documento | Audiência | Arquivo gerado |
|---|---|---|
| Relatório do evento | **INTERNO** | `altar-relatorio-interno-*.pdf` |
| Orçamento | **INTERNO** | `altar-orcamento-interno-*.pdf` |
| Proposta comercial | **CLIENTE** | `proposta-<cliente>.pdf` |
| Ficha técnica | **EQUIPE** | `ficha-tecnica-*.pdf` |
| Caderno de montagem | **EQUIPE / CLIENTE / INTERNO** | `caderno-montagem-*-<audiência>.pdf` |
| Folha de carregamento | **EQUIPE** | `carregamento-*.pdf` |

### A regra

`brand.ts` a declara desde que nasceu:

> **O protagonismo é da empresa; o ALTAR assina discretamente no rodapé.**

Quatro documentos obedeciam. Os dois INTERNOS — os únicos que só ela vê —
faziam o contrário: o Relatório abria com uma faixa de 28mm escrita
*"ALTAR — Plataforma para Decoradores de Eventos"*, e o Orçamento imprimia o
nome da PESSOA (`currentUser.name`), não o do estúdio.

`lib/pdf-marca.ts` é a peça compartilhada: **cabeçalho e rodapé**, que é o que
os seis têm em comum de verdade. O miolo continua diferente por necessidade —
uma folha de carregamento não se parece com uma proposta, e não deve.
Abstrair o miolo seria construir um framework de documento para resolver um
problema de identidade.

### CLIENTE · EQUIPE · INTERNO

| | Como se comporta |
|---|---|
| **CLIENTE** | Editorial. Sem carimbo de sistema: um documento de venda com selo deixa de parecer dela. A fronteira é de TIPO (`PropostaParaCliente`), não de renderização |
| **EQUIPE** | Operacional. Miniatura, caixa de conferência, ambiente, quantidade. Sem dinheiro — preço na mão de quem carrega é vazamento |
| **INTERNO** | Denso, e **declarado**: aviso ao lado do tipo do documento, repetido em TODA página (quem imprime e separa folha não vê a capa) e no nome do arquivo (é o que aparece na lista de downloads na hora de anexar no WhatsApp) |

`documentos-da-marca.test.ts` cobra isso dos seis de uma vez.

---

## 2. Referência x resultado — o modelo já sabia

Esta é a distinção central do domínio, e **ela não precisou de tabela nova**.

`eventPhotos` tem **dois eixos independentes**, e é a combinação que responde:

| Eixo | Campo | Valores |
|---|---|---|
| **Quando** a foto foi feita | `category` | antes · montagem · evento · desmontagem |
| **O que ela significa** | `projectScope` | incluso · referencia · nao_incluso |
| **De que parte** do evento | `ambiente` | texto livre |

- *"é assim que queremos"* → `projectScope: "referencia"`
- *"está contratado"* → `projectScope: "incluso"`
- *"foi assim que ficou"* → `category: "evento"`

E em `assemblyItems` a mesma distinção existe por item, com dois campos
separados: `referencePhotoStorageId` e `contractedPhotoStorageId`.

### O defeito que estava no meio

`updatePhoto` **aceitava** `projectScope` e `ambiente` e os **descartava** na
gravação — o patch só carregava `caption` e `category`. A tela mandava,
recebia "salvo!" em verde, e nada acontecia. `savePhoto` nem aceitava os dois.

Ou seja: o schema documentava a distinção em oito linhas, `scopeMeta` desenhava
o selo, `AVISO_REFERENCIA` escrevia o aviso — e nada chegava ao banco. Em
`assemblyItems` a mesma regra sempre funcionou. Só nas FOTOS era jogada fora.

### E agora elas aparecem onde ela pensa

Até esta rodada a classificação existia e **não ia a lugar nenhum**: o Projeto
mostrava só as duas fotos presas ao item de montagem
(`referencePhotoUrl` / `contractedPhotoUrl`), nunca as setenta da galeria.

`lib/projeto-visual.ts` faz a junção **pelo rótulo do ambiente** — não há id
ligando foto e item, e inventar um exigiria cadastro de ambiente. A comparação
normaliza acento, caixa e espaço; o texto original nunca é reescrito.

Cada ambiente mostra **prateleiras separadas e rotuladas** — Contratado,
Inspiração, Como ficou e Ficou de fora — nunca na mesma fileira. Prateleira
vazia não aparece: a tela mostra o que existe.

**A fase manda mais que o escopo.** Uma foto tirada em `montagem`, `evento` ou
`desmontagem` é EXECUÇÃO, qualquer que fosse a classificação anterior: foi
feita depois da decisão, então registra o que aconteceu. E foto **sem
classificação não é promovida a referência** — o padrão de um envio recente
viraria decisão estética sem ninguém dizer.

---

## 3. Ambiente — a entidade que não foi criada

`ambiente` **já existia** em `eventPhotos` e em `assemblyItems`. Não havia
tabela a criar; faltava gravar e oferecer.

**É texto livre, e isso é decisão de domínio, não preguiça.** "Mesa do bolo"
numa empresa é "mesa de doces" na outra, e um evento traz "capela" que nenhuma
lista fechada previu. Os ambientes já usados viram sugestão (`<datalist>`) e
botões de filtro — o vocabulário nasce do uso dela, não de uma enumeração.

O filtro vive na CONSULTA e ignora caixa, acento e espaço: "mesa do bolo" e
"Mesa do Bolo" são o mesmo lugar para quem procura. A comparação é
`chaveDoAmbiente`, em `convex/lib/ambiente.ts` — a MESMA dos dois lados da
rede, porque o servidor comparava com `trim().toLowerCase()` e devolvia menos
fotos do que o bloco do projeto mostrava.

### `area` e `ambiente` são coisas diferentes

Este é o ponto que causou o defeito mais caro da rodada, e vale escrito:

| | O que é | Quem escreve |
|---|---|---|
| `area` | A **categoria** do briefing (`ceremony`, `cake`). Nasce da seção do Questionário onde o item foi cadastrado — `assembly-items-section.tsx` filtra por `i.area === area` | Ninguém. É estrutura |
| `ambiente` | O **nome do espaço** ("Jardim das oliveiras") | A decoradora, à mão |
| `eventPhotos.ambiente` | O mesmo nome, na foto | A decoradora, à mão |

**A regra canônica** (`resolverAmbiente`, em `src/lib/decoration-project.ts`):

1. deu nome ao espaço → **o nome dela manda**;
2. não deu → a **categoria traduzida** é o rótulo;
3. nem um nem outro → "Sem ambiente", e o item **continua aparecendo**.

A normalização é só para COMPARAR. O rótulo exibido é sempre o texto digitado.

A **categoria não some**: vira `categoria` no grupo e aparece quando
acrescenta ("Entrada · Mobiliário"). Some quando seria eco, e some quando o
bloco reúne categorias diferentes — "Salão de vidro" tem item de Festa e de
Bolo, e escolher uma seria mentira.

A **ordem** é a da categoria, não a do alfabeto: "Jardim das oliveiras" ocupa
o lugar que Cerimônia ocupava. Sem isso, dar nome bonito ao espaço jogaria o
bloco para o fim da folha e a equipe carregaria o caminhão fora de ordem.

Não desceu para `convex/lib/` inteira porque depende de `BRIEFING_AREAS`, que
mora no front. Só a normalização desceu.

---

## 4. Layout

O que existe: `/eventos/:id/planta` — croqui enviado, interpretado e
transformado em planta 2D (`layoutRenders`), com contagem de elementos
preservada. A planta **já entra no Caderno de montagem** como seção própria,
em até 1400px de largura.

**O que falta não é ferramenta, é ligação.** A planta é uma imagem; os
ambientes são texto. Nada liga "mesa do bolo" na planta a "mesa do bolo" nas
fotos e nos itens de montagem. A decoradora vê a planta inteira ou o ambiente
inteiro, nunca um dentro do outro.

Ligar os dois exigiria coordenadas por ambiente — o começo de um editor. **Não
foi feito, e não deve ser feito agora** (ver §8).

O que mudou: a planta agora aparece **dentro do Projeto Visual**, como seção
própria, com link para a tela dela. Só visualização — sem arrastar, sem marcar,
sem coordenada.

---

## 5. Caderno de montagem

Já é mais visual do que parece:

- **contratada tem precedência sobre referência**, e quando só há referência
  ela vai **rotulada como referência** — sem isso a equipe monta a inspiração
  em vez do contratado;
- **agrupado por AMBIENTE**, pela regra canônica (§3): a seção é o lugar onde
  se monta, e a categoria vai no título quando acrescenta ("Montagem · Entrada
  · Mobiliário"). Antes as seções eram as áreas do briefing, e a equipe chegava
  no sítio com um caderno dividido por assunto de reunião;
- o par "Ambiente: ..." **saiu das linhas** quando vira eco do título;
- caixa de conferência por item;
- planta do evento como seção;
- fornecedor e observação **somem** na audiência `cliente`.

**A miniatura tem 22mm.** É o tamanho de um selo postal. A FASE 8 pede
"[FOTO DE REFERÊNCIA GRANDE]", e o trade-off é real: um caderno de 60 itens
com foto grande vira um documento de 60 páginas para levar ao galpão. É
**decisão de produto**, não defeito — ver §8.

---

## 6. Imagens e custo — RESOLVIDO na maior parte

| | Situação |
|---|---|
| Teto de upload | 15 MB por imagem (`lib/upload.ts`) |
| Redução no upload | **existe** — versão leve de 1400 px, JPEG 0,72 (`lib/imagem-reduzida.ts`) |
| Redução no PDF | existe: canvas → JPEG 0,7, 320 px (miniatura) e 1400 px (planta) |
| Falha de imagem | nunca derruba o documento nem o envio: devolve `null` |
| Lazy loading | a grade da galeria e as prateleiras têm |
| Storage órfão | a cascata apaga os DOIS arquivos (`preview-da-foto.test.ts`) |

### Como funciona

A redução acontece **no navegador, no momento do envio**. Não é técnica nova
aqui: o Caderno de Montagem já reduz imagem exatamente assim desde que passou
a levar foto. `imagem-reduzida.ts` é aquela ideia, movida para o envio e
escrita uma vez só.

`eventPhotos.previewStorageId` é **opcional e aditivo**. Foto antiga não tem, e
cai no original — é o fallback, e é por ele que **não existe backfill**.

**O original nunca é tocado.** Sobe inteiro, primeiro, sempre. Se a geração
falhar, a foto é salva exatamente como antes desta rodada.

### Um tamanho, não dois

Medido antes de decidir:

| Superfície | CSS | Tela em DPR 3 |
|---|---|---|
| Grade da Galeria | 138 px | ~414 px |
| Prateleira do Projeto | 77–120 px | ~360 px |
| Capa no telefone | até 430 px | ~1290 px |
| Capa no computador | 720 px | ~1440 px (DPR 2) |

1400 px atende o maior com nitidez. Dois arquivos economizariam banda na grade
e custariam **um terceiro upload por foto**, no pior momento possível: ela
subindo trinta fotos do sítio, no 4G. **Upload é o gargalo dela; download é o
nosso.**

Se a grade um dia provar-se lenta, cabe acrescentar uma miniatura sem mexer em
nada: o campo é opcional e a regra de exibição é uma função só.

### Quem ainda baixa o original

O **visualizador em tela cheia**, e é deliberado: uma imagem por vez, ampliada
com intenção, para decidir um detalhe. O download também entrega o arquivo que
ela enviou. Há teste que falha se alguém "otimizar" isso.

### O que a redução NÃO resolve

- **Fotos já enviadas** continuam pesando o que pesam. Não há backfill, e
  fazê-lo exigiria reprocessar no servidor — a infraestrutura que esta solução
  existe para evitar.
- **HEIC vindo do app Arquivos do iPhone** no Android: o navegador não
  decodifica, a versão leve não é gerada, e a foto sobe só com o original.
  Pela câmera ou pelo álbum, o iOS costuma entregar JPEG e funciona. **Não
  prometemos o que o navegador não oferece.**
- **O storage cresce ~2%**: cada foto nova passa a ter um derivado de ~250 KB
  ao lado de um original de vários MB. É o preço, e é barato.

### Arquivos órfãos — risco medido e ACEITO para o beta

Uma foto envolve agora três coisas: original, versão leve e a linha. Se o
`savePhoto` falhar depois dos uploads, ou se ela fechar a aba no meio, os
arquivos ficam no storage sem linha que os referencie.

**O risco é limitado por desenho:** o `savePhoto` roda DENTRO do laço, uma vez
por foto. Fechar a aba ao subir trinta fotos deixa órfãos de **uma** foto — a
que estava em voo —, não de trinta. O teto é **dois arquivos por foto
interrompida**.

**Não há coleta automática, e não deve haver agora.** Limpar do lado do
cliente exigiria uma mutation que apaga por `storageId`, e essa mutation é um
buraco pior que o órfão: um id de arquivo vindo do navegador não prova posse
de nada, e quem descobrisse o id de outra conta apagaria o arquivo dela. A
coleta correta é do lado do servidor, varrendo o que não tem referência — e
isso é worker, não correção de fluxo.

**Decisão:** aceito no beta, registrado aqui. Gatilho para rever: quando o
storage passar a ser uma linha visível no custo.

### Uma pendência encontrada nesta auditoria

`loadThumbnail`, nos PDFs, **não** passa `imageOrientation: "from-image"`. Se o
navegador não fizer isso por padrão, foto de retrato do iPhone sai **deitada no
Caderno de Montagem**. Não foi alterado nesta rodada — mexer na saída de um PDF
não era o escopo, e só o aparelho responde se o defeito é real. **Está no
checklist de amanhã.**

---

## 7. Mobile

Auditado **estaticamente**. Nenhum navegador foi aberto.

O que foi corrigido nesta rodada: o visualizador de fotos não fechava com
**Esc**, não andava com as **setas**, e seus três botões eram só ícone, sem
nome acessível, em alvos de 32px. É a tela mais usada no dia do evento.

O que **precisa ser visto no aparelho**: se a foto de referência é grande o
bastante para decidir uma montagem; se a fileira de filtros de ambiente rola
confortavelmente; e se o `<datalist>` do campo de ambiente abre bem no iOS —
o suporte varia, e se não abrir a sugestão simplesmente não aparece (o campo
continua funcionando como texto livre).

### As prateleiras do Projeto Visual — AUDITORIA ESTÁTICA, AGUARDA TESTE REAL

A prateleira é **grade responsiva**, não fileira horizontal: `grid-cols-3`
(`grid-cols-2` na prateleira em destaque), abrindo para 4 e 6 colunas em telas
maiores. Não há rolagem lateral, e portanto não há o risco clássico de ela
esconder conteúdo à direita sem indicar.

Contas em 320px, a tela mais estreita que vale considerar: `p-4` + `px-5`
deixam 248px úteis; três colunas com dois vãos de 8px dão ~77px por miniatura,
e a prateleira em destaque dá ~120px. **77px decide "que foto é essa", não
decide uma montagem** — para decidir, é a Galeria, e o caminho até ela agora é
direto.

| Ponto | Estado estático |
|---|---|
| Título de ambiente longo | `break-words` + `min-w-0`; nome sem espaço não estoura |
| 10 ambientes | 10 seções empilhadas — rolagem longa, sem índice |
| 70 fotos | teto de 6 por prateleira + aviso de peso acima de 40 |
| "+N na Galeria" | `flex-shrink-0`; o título quebra em duas linhas antes de espremer o link |
| Botões | alvos herdados do design system; nenhum alvo novo menor |
| Planta | `w-full object-contain`, não estoura |
| Sem foto | caixa "sem imagem" do mesmo tamanho, não quebra a grade |

**Nada disto foi aberto em telefone.** São contas de CSS, e contas de CSS não
substituem o polegar de ninguém.

### A capa e o conceito — AUDITORIA ESTÁTICA, AGUARDA TESTE REAL

A capa é `aspect-[3/2]` no telefone e `aspect-[2/1]` a partir de `md`. Com o
`p-4` da página, a altura fica:

| Largura | Conteúdo | Altura da capa |
|---|---|---|
| 320 px | 288 px | **192 px** |
| 375 px | 343 px | 229 px |
| 390 px | 358 px | 239 px |
| 430 px | 398 px | 265 px |
| ≥768 px | 720 px (2:1) | 360 px |

192 px num telefone de 320 é cerca de um terço da tela: a imagem abre o
evento sem empurrar o nome para fora da dobra.

| Ponto | Estado estático |
|---|---|
| Nome longo do evento | `break-words`; nome sem espaço não estoura |
| Local comprido | `break-words` na mesma linha de data e tipo |
| Capa chegando depois | espaço **reservado** assim que o evento diz que há capa |
| Ponteiro para foto apagada | nenhuma caixa cinza: cai na capa tipográfica |
| Conceito | serifa, `leading-relaxed`, `max-w-prose`, borda à esquerda |
| Atmosfera muito longa | **risco residual**: o texto é dela e não é cortado |

O último ponto é uma escolha, não um descuido: `line-clamp` esconderia o que
ela escreveu. Se virar parede de texto na prática, a correção é um "ver mais"
— e isso se decide vendo, não prevendo.

---

## 8. Decisões adiadas

Nenhuma é técnica. Todas mudam o produto.

1. **Foto grande no Caderno.** Dense (hoje) × uma ficha visual por ambiente.
   A segunda é melhor para entender em segundos e pior para carregar no
   galpão. Provavelmente as duas deveriam existir, como as audiências já são
   três — e isso é uma escolha, não uma correção.
2. **Ambiente como entidade.** Hoje é texto repetido em duas tabelas. Virar
   entidade daria a página que a FASE 7 desenha (referências + layout +
   composição + materiais + fornecedores + fotos finais, num lugar só) e
   custaria migração, vínculo e tela. **O texto livre resolve o beta.**
3. **Ligar planta e ambiente.** Exige coordenadas — o começo de um editor.
4. **Moodboard.** As peças existem (referências por ambiente, paleta da
   empresa em `brandColor`). Falta a tela. Paleta **não** deve ser extraída da
   imagem por IA: seria cor inventada apresentada como decisão dela.
5. **Redução de imagem no upload.** Ver §6.

6. ~~**Foto de capa do projeto.**~~ **FEITA** — o jeito de ESCOLHER passou a
   existir, na Galeria, e a tela continua sem escolher sozinha. Ver §9.

7. **Moodboard como tela própria.** As prateleiras do Projeto Visual já são um
   moodboard organizado por ambiente. O que falta — e que é decisão — é poder
   SELECIONAR quais fotos entram numa composição de apresentação. Sem isso, um
   moodboard só poderia usar "as primeiras seis", que é a mesma regra inventada
   da capa. **Nenhuma extração automática de paleta**: seria cor inventada
   apresentada como decisão dela.

### A limitação do agrupamento — RESOLVIDA

A rodada anterior deixou registrado que itens agrupavam por `area` e fotos por
`ambiente`, e que o mesmo lugar físico virava dois blocos. Foi corrigido nesta
rodada, e **nas quatro superfícies de uma vez** — que era a condição para
mexer: `agruparPorAmbiente` é compartilhada, e alinhar uma tela só faria o
mesmo evento se organizar de dois jeitos.

O que mudou no demo, que é o casamento inteiro em miniatura:

| ANTES | DEPOIS |
|---|---|
| Cerimônia (3) | **Jardim das oliveiras** (4) |
| Festa (4) | **Salão de vidro** (6) |
| Mobiliário (3) | **Entrada** · Mobiliário (1) |
| Flores (1) | **Lounge do jardim** · Mobiliário (2) |
| Bolo e Doces (1) | Flores (1) |
| Iluminação (2) | |

Os spots do jardim estavam em "Iluminação" e a mesa do bolo tinha seção
própria, embora esteja dentro do salão. A equipe chegava no sítio com um
caderno dividido por assunto de reunião, não por lugar de montagem.

---

## 9. Foto de capa — IMPLEMENTADA

A análise desta seção previa `v.optional(v.id("eventPhotos"))` no evento. Foi
exatamente isso, e vale registrar por quê e como.

### Como funciona

`events.coverPhotoId` — um ponteiro opcional para a linha da galeria. **Mesma
forma de `events.responsibleId`**, que já apontava para `teamMembers`:
`v.union(v.id(...), v.null())` no `update`, helper de posse antes de gravar,
`null` para limpar.

Não é `storageId` e não é cópia. O arquivo continua sendo um só, a capa herda
ambiente, legenda e classificação da foto, e apagar a foto tem como limpar a
capa — coisas que um `storageId` não permitiria.

`requireEventPhoto` faz **três** perguntas: a foto existe, é da conta, **e é
deste evento**. A terceira não é zelo: sem ela, a capa de Marina & Gabriel
poderia ser uma foto do casamento da Joana. Os dois eventos são da mesma
decoradora, nenhuma regra de posse é violada, e ainda assim é a foto errada no
documento errado.

### A escolha mora na Galeria

É onde ela olha foto por foto. No Projeto Visual, escolher transformaria em
editor justamente a tela que ela vira para a cliente.

Definir, trocar, remover e **ver qual é** (selo na grade). Ação imediata, fora
do "Salvar" da legenda: um botão que grava em duas tabelas deixa metade salva
quando a outra metade falha.

### Quando a foto é removida

`gallery.deletePhoto` **limpa a capa antes de apagar**. A tela degrada para a
capa tipográfica de qualquer jeito — mas ponteiro quebrado no banco é dívida
calada: quem ler o campo amanhã não sabe se a capa foi removida ou se o dado
se perdeu. A exclusão do evento inteiro continua na cascata de sempre.

### Sem capa

A abertura continua **tipográfica**, e isso não é plano B: "a primeira foto"
seria regra inventada em silêncio. Nada é escolhido automaticamente, não há
IA, e o demo — que não sobe imagem nenhuma — abre bem.

### O risco que ficou

A capa é o **arquivo original**, que pode ter 15 MB, e está acima da dobra.
Não há miniatura no envio (§6), e construir esse sistema nesta rodada dobraria
o escopo. O que foi feito: espaço reservado assim que o evento diz que existe
capa (a tela não pula na cara de quem olha) e `decoding="async"`.

**O que NÃO foi feito e continua valendo:** gerar versão reduzida no upload.
É o mesmo gatilho do §6, e a capa o antecipa — ela é a primeira imagem que
uma noiva vê num 4G de fazenda.

---

## 9b. O conceito do evento — IMPLEMENTADO, sem campo novo

Três campos que **já existiam** no grupo "Conceito do Evento" do Questionário
e não apareciam em lugar nenhum do projeto:

| Campo | Vira | Audiência |
|---|---|---|
| `decorStyle` | "Jardim contemporâneo" | `ALL` |
| `colorPalette` | "Verde oliva e branco" | `ALL` |
| `atmosphereDescription` | o parágrafo | `ALL` |

Ela descrevia o casamento numa tela e abria a outra sem ele.

**Quem escolhe os campos é `src/lib/conceito-do-evento.ts`**, e ele constrói o
objeto campo a campo — não existe `...briefing` ali, e a ausência é a regra.
`getBriefing` devolve a linha inteira, com contato do espaço, seguro e
pagamento dentro, e esta é a tela que ela vira para a noiva. A fronteira mora
na transformação, como em `paraOCliente`, não numa tela que esconde.

**Nenhuma paleta é inferida.** "Verde oliva e branco" continua sendo o texto
dela. Virar amostra de cor exigiria adivinhar que verde é esse — cor inventada
apresentada como decisão dela. Há teste que falha se um hexadecimal aparecer
no módulo ou na seção.

**Campo vazio não aparece. Os três vazios e a seção some** — evento novo não
tem conceito escrito, e isso não é defeito.

O quarto campo do grupo, **`referenceImages`** ("Imagens de Referência
(URLs)"), ficou de fora de propósito: é uma caixa de texto anterior à Galeria,
e trazê-la criaria um segundo lugar para guardar referência — o defeito que a
rodada do ambiente acabou de tirar daqui. **Continua pendente de decisão**
(§8): aposentar ou assumir que é o campo de link externo.

---

## 9c. O que continua NÃO implementado

Para não restar dúvida depois desta rodada:

- **Biblioteca de inspirações** — não existe. Nenhuma tabela, nenhuma tela.
  A especificação está no relatório da rodada de design, não no código.
- **PDF do Projeto Visual** — não existe. Continua faltando `visibility` em
  `eventPhotos` (§10).
- **Moodboard, paleta automática, extração de cor, IA sobre imagem** — nada
  disso foi construído.
- **Redesenho dos PDFs** — nenhum dos seis foi tocado nesta rodada.

---

## 10. Um PDF visual para a cliente — o que já dá, e o que não tem audiência

**Nada foi implementado.** A pergunta é se a informação existe e se ela é
segura.

**Dá para montar hoje, com segurança:**

| Dado | De onde | Audiência |
|---|---|---|
| Nome do evento, data, local | `events` | já vai em documento de cliente |
| Ambiente (rótulo) | `resolverAmbiente` | é o nome que ELA deu |
| Referências | `eventPhotos` com `projectScope: "referencia"` | precisa de aviso explícito |
| Contratado | `eventPhotos` com `projectScope: "incluso"` | seguro |
| Resultado final | fotos de `montagem`/`evento`/`desmontagem` | seguro |
| Layout | `layoutRenders.outputStorageId` | é a planta que ela já mostra |

**O que NÃO tem audiência segura — e é o motivo de isto não ser um "é só
gerar":**

1. **`eventPhotos` não tem `visibility`.** `assemblyItems` tem, e o Caderno a
   respeita campo a campo (`audiencia-do-caderno.ts`). A foto não tem nada
   equivalente: `projectScope` diz o que a imagem É no projeto, não para quem
   ela pode aparecer. Uma foto interna ("o estrago da chuva", "o fornecedor
   entregou errado") não tem como se declarar interna.
2. **`caption` é texto livre que ela escreve para si mesma.** "refazer, ficou
   torto" é legenda legítima na galeria e impublicável num documento da
   cliente.
3. **`nao_incluso` é explosivo.** Mandar "ficou de fora" para a cliente é
   conversa comercial, não documento.
4. **Item de montagem carrega `supplierName`, `notes` e `receita`** — os três
   são internos, e a `receita` é o custo. Se o PDF visual mostrar itens além de
   fotos, ele atravessa a mesma fronteira da proposta comercial.

**Conclusão honesta:** um PDF visual só de FOTOS `incluso` + fotos de execução
+ planta + cabeçalho do evento é seguro hoje. Qualquer coisa além disso pede
ou um `visibility` em `eventPhotos`, ou a mesma disciplina de
`paraOCliente`: **uma função que CONSTRÓI o objeto campo a campo**, e não uma
tela que esconde. A fronteira mora na transformação, não na renderização — é a
regra que `convex/lib/propostaComercial.ts` já sustenta.

---

## 11. O que NÃO entra agora

IA generativa de decoração, Pinterest/Instagram API, busca automática de
inspiração, editor 3D, realidade aumentada, reconhecimento de flores,
orçamento por fotografia e marketplace. Podem estar no roadmap; **nenhum no
beta**.
