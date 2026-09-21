# CHECKLIST DE HOMOLOGAÇÃO DE AMANHÃ

**Para fazer no notebook, uma vez, na ordem.** Vinte passos. O primeiro bloco
(1–7) é o que só o notebook consegue fazer; o resto é olhar o produto como uma
decoradora olharia.

> **Antes de começar, uma frase:** o alvo é **`healthy-pika-907` (DEV)**.
> `mellow-goose-539` é PRODUÇÃO e não entra nesta lista em nenhum passo.

---

## Bloco A — trazer o código e fechar a pendência do codegen (1–7)

**1. Trazer o que foi revisado, sem merge acidental.**
```bash
git checkout integration/altar-release-2026-09-18
git pull --ff-only origin integration/altar-release-2026-09-18
```
`--ff-only` é o ponto: se o comando recusar, alguém divergiu e isso precisa ser
resolvido olhando, não com um merge automático.

**2. Confirmar o deployment ANTES de qualquer coisa que escreva.**
```bash
npx convex env list        # ou abra o painel
```
Tem de ser **`healthy-pika-907`**. Se aparecer `mellow-goose-539`, pare aqui.

**3. Rodar o codegen — a pendência que veio da rodada anterior.**
```bash
npx convex codegen
```
Este comando não roda no ambiente do agente (sem `CONVEX_DEPLOYMENT`), e por
isso `convex/_generated/api.d.ts` recebeu **duas linhas escritas à mão** para
registrar o módulo `propostas`.

**4. Conferir o que o codegen mudou.**
```bash
git diff --stat convex/_generated/
git diff convex/_generated/api.d.ts
```
- **Sem diferença** → a edição manual estava certa. Siga.
- **Com diferença** → **o gerador tem razão.** Aceite o arquivo dele e commite
  só isso, com uma mensagem que diga que é saída de codegen.

> Também é aqui que se descobre se o codegen quer REMOVER alguma coisa. Foram
> **três** funções públicas apagadas por não terem chamador:
> `supplierCatalog.get`, `propostas.doLead` e `asaas.getCustomerPortalUrl`
> (esta última também não tinha guarda). O arquivo gerado deve acompanhar as
> três.

**5. Revalidar, se o passo 4 mudou alguma coisa.**
```bash
pnpm test && npx tsc -p tsconfig.app.json --noEmit \
  && npx tsc -p convex/tsconfig.json --noEmit && pnpm lint && pnpm build
```
Se o passo 4 não mudou nada, esta validação já foi feita e está verde.

**6. Publicar no DEV.**
```bash
npx convex dev --once
```

**7. Confirmar que subiu onde devia.** Painel do Convex → `healthy-pika-907` →
Functions. `propostas` tem de aparecer; `supplierCatalog.get` e
`propostas.doLead`, não.

---

## Bloco B — o produto, olhado como ela olharia (8–19)

**8. Abrir o frontend.**
```bash
pnpm dev
```

**9. Semear o demo — só se o ambiente aceitar.** No painel do Convex, rode
primeiro `internal.demo.checkEnvironment` e leia `proximoPasso`. Só rode
`internal.demo.seed` se ele disser que está pronto. As três travas
(`ALTAR_DEMO=1`, recusa em banco com sinal de produção, idempotência) fazem o
trabalho, mas a leitura vem antes.

**10. Login.** Entrar, sair e entrar de novo. Confirmar que o redirecionamento
cai no painel e que o menu aparece inteiro.

**11. Início.** O painel de atenção responde "o que eu faço hoje?" — eventos
próximos, dinheiro vencido, funil. Conferir que nenhum número aparece como
`NaN`, `R$ 0,00` sem motivo ou "em -3 dias".

**11b. A conta NOVA, antes do seed.** Se der para entrar numa conta sem nenhum
evento, o painel tem de dizer **"Seu primeiro evento ainda não existe"** com o
caminho — nunca o ✓ verde de "nada pedindo atenção", que contradizia o aviso de
primeiros passos logo acima.

**12. Catálogo (`/catalogo`).** Buscar um material; buscar uma composição **pelo
nome de um material dela**; filtrar por categoria; abrir "ver arquivados".
Abrir um material e digitar `1.500,00` no custo → tem de **gravar 1500**, não
apagar o campo (era o defeito). Digitar `abc` → tem de recusar com recado, sem
salvar.

**12b. Acervo (`/acervo`) — o caminho de volta.** Arquivar uma peça, conferir
que ela some da lista, marcar **"Ver arquivados"**, achá-la e **reativar**. Era
porta de uma mão só até esta rodada, e o botão fica encostado em "Ajustar
estoque", que é o que ela usa o tempo todo.

**13. Fornecedor 360 (`/fornecedores/:id`).** Abrir pelo nome no catálogo.
Conferir eventos, total de compras e a frase que diz **o que o total não é**.
Abrir um fornecedor sem nenhuma compra e conferir que a tela não inventa zero.

**14. Proposta (`/propostas`).** Criar a partir de um lead do funil e a partir
de um evento. Conferir que **o tipo do evento aparece em português**
("Casamento", nunca `wedding`). Editar só o TEXTO — sem tocar em valor — e
tentar a prévia: tem de avisar que há alteração não salva, **acima dos botões,
antes do clique**. Salvar, ver a prévia, marcar como enviada, editar de novo e
conferir o aviso de divergência.

**14b. Números impossíveis, pelo console.** Com a sessão aberta, chamar
`api.funil.createLead` com `budget: NaN` e `api.acervo.registrarContagem` com
`quantidadeContada: NaN`. As duas têm de RECUSAR. É o teste que só o navegador
faz de verdade: a tela nunca deixaria chegar lá.

**15. PDF da proposta.** Gerar e **abrir o arquivo**. Procurar, com os olhos:
custo, margem, lucro, nome de fornecedor. Não pode haver nenhum. Comparar com o
PDF do Orçamento, que tem de dizer "USO INTERNO" em toda página e sair com
`altar-orcamento-interno-` no nome.

**16. Evento.** Abrir o casamento do demo. Conferir o tipo em português, a data
sem hora inventada, o telefone da equipe clicável, e a linha da Proposta ao
lado da do Orçamento — cada uma dizendo para quem é.

**17. Financeiro e Compras.** No Financeiro, filtrar por "Receitas" num mês sem
receita: tem de dizer **"nenhum lançamento neste filtro"** e oferecer "Ver
todos" — nunca "adicione o primeiro". Em Compras, apagar um item que tenha
lançamento no financeiro: tem de **perguntar antes** e avisar que a despesa sai
junto.

**16a. Classificar uma foto e achá-la depois.** Subir uma foto, abrir "Legenda
e classificação", marcar **Referência** e escrever o ambiente (ex.: "Mesa do
bolo"). Fechar, reabrir: a classificação tem de estar lá — era aceita e jogada
fora. Depois usar o filtro de ambiente e conferir que a foto aparece.

**16b. Galeria de fotos, no teclado.** Abrir uma foto no notebook: **Esc** tem
de fechar e as **setas** têm de andar entre as fotos. Era sobreposição feita à
mão, sem nada disso — e é a tela mais usada no dia do evento.

**17a. Os dois PDFs internos, abertos.** Gerar o **Relatório do evento** e o
**Orçamento**: os dois têm de abrir com o **nome do estúdio** (não "ALTAR",
não o nome da pessoa), na cor da empresa, com o aviso de USO INTERNO ao lado
do tipo do documento e repetido no rodapé de toda página. Conferir também a
Proposta: ela NÃO pode ter esse aviso.

**17b. A identidade oficial, com os olhos.** É o único jeito de conferir:
- **favicon** na aba, em 16px reais — o arco continua reconhecível?
- **link colado no WhatsApp** (mande para você mesmo): tem de aparecer a arte
  em 1200×630, não um retângulo cinza;
- o **selo a 28–32px** na barra lateral e no cabeçalho do celular, nos dois
  temas. O fundo bege faz parte da arte e vem junto.

**18. Celular e PWA.** Abrir em 320–430 px de verdade (ou no aparelho). Olhar:
o editor de proposta (os campos empilham?), a linha de compras (os dois botões
têm 44 px?) e o menu "Mais".

Depois **instalar como PWA nos dois sistemas** — e este é o ponto da rodada da
marca. **Remova o atalho antigo antes**, senão o iOS serve o ícone velho do
cache dele e a conferência não vale nada.
- no **iPhone**, o símbolo tem de ocupar boa parte do ícone depois que o iOS
  aplicar os cantos. Era ele que aparecia minúsculo: o arquivo antigo era um
  print de 860×1600;
- no **Android**, que recorta um círculo, a ponta da folha não pode ser
  cortada — é para isso que existe o `maskable` separado;
- a **tela de abertura** tem de ser do mesmo bege do ícone (`#E7D8C8`), sem
  piscar outra cor;
- o nome embaixo do ícone continua **"Altar"**.

**19. Um ambiente, uma verdade.** É o passo mais importante desta rodada,
porque é o único que não dá para provar em teste automático: o teste garante
que as quatro superfícies usam a MESMA função, mas só um par de olhos garante
que a organização faz sentido para quem monta.

1. Num evento, crie um item de montagem na área **Cerimônia** com o campo
   **Ambiente** preenchido como `Jardim das oliveiras`.
2. Na **Galeria**, envie uma foto e classifique-a com o ambiente
   `Jardim das oliveiras` — de preferência digitando com outra caixa
   (`jardim das OLIVEIRAS`), porque é assim que acontece de verdade.
3. Abra o **Projeto Visual**. Deve existir **UM** bloco, chamado
   `Jardim das oliveiras`, com o item E a foto dentro. Dois blocos = o defeito
   voltou.
4. Clique em **"+N na Galeria"** dentro desse bloco: a galeria tem de abrir
   **já filtrada** naquele ambiente (a URL mostra `?ambiente=...`), e a
   contagem tem de bater com a do bloco.
5. Abra o **Caderno de Montagem** (PDF). A seção deve se chamar
   `Montagem · Jardim das oliveiras` — e **não** `Montagem · Cerimônia`. O par
   "Ambiente: Jardim das oliveiras" **não** deve aparecer embaixo do item: é
   eco do título.
6. Abra a **Ficha Técnica**, aba **Ambientes**. Mesmo nome, mesmo bloco.
7. Gere a **Folha de Carregamento** (PDF). Mesmo nome, mesma ordem.
8. Confirme que a **ordem** dos blocos é coerente entre as quatro: o bloco do
   jardim ocupa o lugar que "Cerimônia" ocupava, não o fim da folha.

No **demo** isso já está semeado: `Salão de vidro` deve reunir mesas, cadeiras,
centro de mesa, mesa posta, varal de luz e a mesa do bolo — **seis itens** que
antes moravam em três seções diferentes (Festa, Iluminação e Bolo e Doces). `Entrada` e `Lounge do jardim` devem aparecer com
`Mobiliário` ao lado, em letra menor.

**Se alguma das quatro superfícies discordar das outras, anote qual e pare.**
É a única coisa desta rodada que vale interromper a homologação para registrar
em detalhe.

---

**20. A capa e o conceito do Projeto Visual.** É a rodada mais visual até
agora, e a que mais depende de olho.

1. Num evento com fotos, abra a **Galeria**, clique no lápis de uma foto e
   use **"Usar como capa"**. A foto deve ganhar o selo **Capa** na grade.
2. Abra o **Projeto Visual**: a foto abre a tela, com o nome do evento
   **abaixo** dela — nunca por cima.
3. Volte à Galeria e defina **outra** foto como capa. A anterior perde o selo:
   é uma capa por evento, sempre.
4. **Remover capa** na foto que é capa. O projeto volta à abertura
   tipográfica, sem buraco nem caixa cinza.
5. **Apague** a foto que é capa. O projeto volta ao título — e não pode
   aparecer imagem quebrada em lugar nenhum.
6. No **Questionário**, preencha "Estilo da Decoração", "Paleta de Cores" e
   "Atmosfera". No Projeto Visual eles aparecem logo abaixo do nome, em
   serifa. Apague os três: a seção inteira **some**.
7. Num evento **novo**, sem foto e sem briefing: a tela abre tipográfica e
   sem seção de conceito. Não pode haver espaço vazio pedindo imagem.
8. **No iPhone, com 4G de verdade**: quanto tempo a capa leva para aparecer?
   Ela é o arquivo ORIGINAL — não há miniatura no envio. Se demorar, anote o
   tempo: é o gatilho para a redução de imagem no upload.

---

**21. O peso das fotos — só o aparelho responde.** É o passo que precisa de
4G de verdade, não de Wi-Fi do escritório.

1. **Suba uma foto nova** pelo iPhone, pela câmera e pelo álbum. As duas
   precisam aparecer na grade. Se uma delas vier do app **Arquivos** em
   formato HEIC, ela ainda sobe — só não ganha versão leve.
2. **Confira a orientação**: foto tirada em RETRATO tem de aparecer em pé na
   grade, no Projeto Visual e na capa. Deitada = a redução ignorou o EXIF.
3. **Abra a foto em tela cheia.** Aqui é o original, de propósito: tem de
   estar nítido ao ampliar.
4. **Baixe a foto** pelo botão de download. O arquivo tem de ser o que você
   enviou — mesmo tamanho, mesma qualidade.
5. **Num evento com muitas fotos**, role a Galeria no 4G e cronometre. Antes
   desta rodada cada quadradinho baixava até 15 MB; agora, ~250 KB.
6. **Abra o Projeto Visual com capa definida** e cronometre até a capa
   aparecer. É o número que decide se 1400 px foi generoso ou insuficiente.
7. **Fotos ANTIGAS** (enviadas antes de hoje) continuam pesadas — não há
   backfill. Confirme que elas ainda aparecem normalmente; só não ficaram
   mais rápidas.
8. **Gere o Caderno de Montagem** de um evento com foto de retrato no item de
   montagem. **Se a foto sair deitada no PDF**, encontramos a pendência
   anotada em `docs/experiencia-visual.md §6` — anote e me diga.

---

**22. Central em modo simulado.** `ALTAR_CENTRAL_ENVIO_HABILITADO` tem de estar
**ausente ou diferente de `"true"`**. Aprovar uma mensagem e confirmar que ela
termina em `aprovada`, **nunca** em `executada`. Nada sai.

---

## 23. Relatório

Anotar, em uma linha cada: o que quebrou, o que pareceu confuso, e o que uma
decoradora perguntaria. O que não couber em uma linha vira tarefa, não
correção no calor da homologação.

---

## O que NÃO fazer em nenhum passo

- `convex deploy` contra `mellow-goose-539`;
- merge em `main`;
- ligar `ALTAR_CENTRAL_ENVIO_HABILITADO`;
- mexer em Asaas;
- converter lead em evento **no demo** durante uma demonstração ao vivo (altera
  os dados do roteiro — ver `docs/demo-comercial.md`);
- corrigir código no meio da homologação. Anote e siga.
