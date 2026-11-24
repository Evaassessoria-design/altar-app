# O que melhorar no ALTAR — proposta de novembro

> **Estado em 24/11, fim do dia:** P1, P2 e P3 foram **implementados e
> aprovados** (commits `80a9490`, `81ea795`, `6d089ea`) — ver a seção 6 no fim,
> que registra o que de fato entrou, inclusive um defeito de telefone que
> apareceu no caminho. O resto do documento continua sendo proposta.

Escrito para decidir, não para implementar: **nada aqui foi começado.** Cada
item diz o que a decoradora sente, qual é a evidência no código, o tamanho e o
risco. A ordem recomendada está no fim.

O critério é um só: **a decoradora precisa perceber no mesmo dia, sem aprender
nada novo.** O que é funcionalidade nova, ou o que o próprio mapa do produto
manda não construir antes do beta (`docs/estado-do-produto.md`), está na seção
"grandes" com a decisão que falta — não como tarefa.

---

## 1. Os bloqueios — o que dá e o que não dá para resolver daqui

| Bloqueio | Resolvível aqui? |
| --- | --- |
| Publicar no DEV | **Não.** Rede limitada sem host liberado (CONNECT 403) e sem credencial. Caminho: ver abaixo |
| Homologar os 7 roteiros no navegador | **Não.** Precisa do login dela num navegador de verdade |
| `npx convex codegen` e a conferência do `api.d.ts` | **Já estava resolvido** — ver abaixo |
| Celular de verdade, 320–430 px | **Não.** Toda auditoria até aqui foi por leitura de código |

### `api.d.ts` — este item pode sair da lista

A preocupação registrada era: o arquivo recebeu duas linhas à mão e, desde
então, três funções públicas foram removidas. Conferi: **o risco já está
coberto por teste.** `src/lib/api-gerada.test.ts` refaz a conta do codegen nos
dois sentidos — módulo do backend que ficou fora do `api.d.ts`, e entrada
declarada sem arquivo correspondente — e também confere o mapa `fullApi`, que é
o que de fato expõe o módulo. Assinatura de função não precisa de trava: ela
vem da tipagem dos módulos reais, e `npx tsc -p convex/tsconfig.json` já roda
em toda rodada.

Rodar o codegen no notebook continua valendo como confirmação. Deixou de ser
risco.

### Como publicar no DEV, em ordem de preferência

1. **Remote Control** (recomendado). No app do Claude no computador dela:
   Configurações → Claude Code → Remote Control, e compartilhar a pasta do
   `altar-app`. A partir daí **eu** rodo a publicação na máquina dela, com as
   credenciais que já estão lá: nenhum segredo se move, nada é digitado em
   conversa, e o alvo é conferido antes de cada comando.
2. **Ela mesma roda**, dois comandos, trinta segundos — a sequência está em
   `docs/homologacao-dev.md` e `docs/release-producao.md`. Zero manuseio de
   credencial.
3. **Abrir a rede deste contêiner** (`api.convex.dev`, `provision.convex.dev`,
   `healthy-pika-907.convex.cloud`). É possível, com aprovação dela — e **não
   recomendo**: sem credencial a rede aberta não publica nada, e a credencial
   possível aqui seria um login de conta inteira dentro de um contêiner
   descartável, que alcança PROD. Troca um bloqueio conhecido por um risco
   desnecessário.

---

## 2. Pequenas — um dia de trabalho cada, risco baixo, nada novo para aprender

### P1. Uma barra de etapas dentro do evento

**Hoje**: o evento tem 14 telas internas. Só duas (`ficha-tecnica` e `projeto`)
levam às irmãs; as outras doze só sabem voltar para a capa do evento. O caminho
real é *evento → tela → voltar → evento → tela*. Num dia em que ela passa por
briefing, ficha, compras, pagamentos e reuniões, são **cerca de dez cliques e
cinco carregamentos a mais** só para andar.

**Proposta**: uma faixa fina no topo de cada tela do evento, com a etapa atual,
a anterior e a seguinte. Sem dado novo: `DEFINICAO`, em
`convex/lib/jornadaDoEvento.ts`, já guarda rótulo e rota das onze etapas — é a
mesma fonte que desenha a Jornada na capa. As telas de trabalho (reuniões,
pagamentos, checklist, produção floral) entram como atalhos ao lado.

**Risco**: baixo. É navegação, não dado. **Ganho percebido**: alto, todos os dias.

### P2. O aviso de primeiros passos se recolhe sozinho

**Hoje**: com o essencial pronto o cartão diz "Configuração concluída" e pede
um clique em **Dispensar** — um clique a mais, uma vez, para cada conta nova.
A decisão que travava isso era "concluir sozinho é escrita sem ação do
usuário".

**Proposta**: não escrever nada. Concluído é **estado derivável** — se os
passos estão cumpridos, o cartão simplesmente não aparece. É a regra do
repositório ("estado derivável é derivado, não gravado") aplicada ao caso que a
inventou.

**Risco**: baixo. **Ganho**: pequeno, mas é a primeira impressão da conta nova.

### P3. O botão de WhatsApp onde ela cobra

**Hoje**: o atalho de WhatsApp existe no funil, na capa do evento e nos
fornecedores do evento. Falta exatamente nos dois lugares onde ela cobra todo
dia: a **pendência da reunião** ("a noiva manda a lista até sexta") e a
**parcela vencida**.

**Proposta**: o mesmo atalho que já existe, com o texto montado a partir do que
está na tela. Ela lê, corrige se quiser e manda — do telefone dela. **Isto não
abre a porta de envio automático**: `communicationsOutbox` continua fechado, e
nada aqui chama `fetch`.

**Risco**: baixo. **Ganho**: alto — é o trabalho que ela faz de manhã.

### P4. As três telas que ainda podem estourar no celular

**Hoje**: varri o repositório — a higiene de celular está boa (as travas
`dialogo-altura` e `mobile-controls` cobrem o resto). Sobraram **três tabelas**
(painel admin e o diálogo do caderno de montagem) e **três grades de 3+ colunas
sem variante responsiva**. Tabela em tela de 360 px corta coluna sem avisar.

**Risco**: baixo. **Ganho**: pequeno, mas é o tipo de defeito que ela encontra
na frente da cliente.

### P5. A primeira abertura no 4G

**Hoje**: o pedaço principal tem **837 kB** (249 kB comprimido). As rotas já
são carregadas sob demanda, e o 3D, os PDFs e os gráficos já estão em pedaços
próprios — o que sobrou é biblioteca compartilhada. Dívida conhecida, com
gatilho declarado: a primeira abertura no celular, no 4G do sítio.

**Risco**: médio (mexer em build quebra de formas que teste não pega).
**Ganho**: alto no primeiro acesso, nulo depois. Recomendo medir antes.

---

## 3. Médias — valem uma rodada própria

### M1. A entrega num lugar só *(maior ganho percebido da lista)*

**Hoje**: o ALTAR gera **nove PDFs** com a identidade da empresa, e cada um
mora atrás da sua tela. Para fechar a sexta-feira — mandar o projeto para a
cliente, a ficha para o florista, a folha para o galpão, o caderno para a
equipe — ela visita seis ou sete telas, aperta seis ou sete botões, e depois
monta a mensagem de WhatsApp na mão.

**Proposta**: a seção **"Pronto para mostrar?"**, que já existe na capa do
evento e já responde o que está pronto e o que falta, passa a **entregar**: ao
lado de cada linha pronta, o botão que gera aquele documento; e um texto de
WhatsApp pronto para a cliente e outro para a equipe. Nada de tela nova e nada
de PDF novo — é a seção que já faz a pergunta passando a dar a resposta. Pela
regra do repositório, estender o que existe em vez de criar um segundo
gerenciador de entregas.

**Risco**: baixo-médio (sete consultas já existem e só rodam com a seção
aberta). **Ganho**: alto, e é o que mais parece "o sistema trabalha para mim".

### M2. Uma busca que acha qualquer coisa

**Hoje**: existe busca em seis telas — eventos, acervo, catálogo, fornecedores,
central, admin — cada uma na sua. "Onde está aquele vaso de vidro?" exige
escolher a tela certa antes de procurar.

**Proposta**: uma caixa só, no topo, que encontra evento, cliente, fornecedor,
peça do acervo e material do catálogo. Consulta paginada por tipo (a regra da
casa: filtro entra na consulta, varredura global pagina).

**Risco**: médio. **Ganho**: alto para quem tem 40 eventos e 300 materiais;
quase nulo para quem tem 3.

### M3. Montar um evento a partir de outro

**Hoje**: não existe duplicar evento. A biblioteca de composições aplica **uma
receita** por vez, e é por onde ela reaproveita hoje.

**Proposta**: aplicar o **conjunto** de composições de um evento em outro — "o
projeto da Marina, na data da Carol". Explicitamente **não** copiar contrato,
pagamento, foto, documento nem reunião: o que se repete é o projeto, não o
cliente. A fronteira precisa estar escrita antes de uma linha de código.

**Risco**: médio (toca `assemblyItems` e receita). **Ganho**: alto para quem
repete estilo — e quase toda decoradora repete.

### M4. Anexo por reunião

A ata assinada, a foto do guardanapo escolhido. Pede upload com guarda de
acesso e **cascata na exclusão** — arquivo órfão é classe de defeito que este
repositório já pagou. Médio, não pequeno. Hoje os anexos vivem na Pasta do
Evento, que funciona.

### M5. Peças do Acervo na biblioteca do Layout

Pede **medida** no Acervo primeiro (largura e profundidade). Sem isso, a cadeira
do galpão entra na planta com tamanho padrão e a planta passa a mentir sobre o
espaço — que é o problema que o Layout existe para resolver.

---

## 4. Grandes — cada uma espera uma decisão, não código

Todas estão em `docs/estado-do-produto.md`, na lista do que **não construir
antes de cinco contas reais rodarem 30 dias**. A recomendação se mantém.

| | A decisão que falta |
| --- | --- |
| **Segunda pessoa na conta** | O schema quase suporta. O impedimento é outro: papel que restringe leitura de **arquivo** é incompatível com o storage atual — a URL do Convex é pública para quem a tem e não dá para revogar. Decidir: aceitar que arquivo é visível a quem recebe o link, ou trocar o jeito de entregar arquivo |
| **Aceite da proposta com valor jurídico** | Hoje "aceita" é ela registrando o que ouviu, e a tela diz isso. Assinatura muda contrato, responsabilidade e provavelmente traz fornecedor externo |
| **Google Agenda de verdade** | A tela parou de prometer. Ligar é OAuth, sincronização e conflito de agenda — projeto, não ajuste |
| **Aviso no celular com o app fechado** | Hoje o sino só existe com o ALTAR aberto. Notificação de verdade num PWA é service worker, permissão e infraestrutura de envio |
| **Envio externo pela Central** | Porta fechada por construção. Exige número comercial integrado **e** acerto da IA medido em volume real |

---

## 5. A ordem que eu recomendo

1. **P1 + P2 + P3** numa rodada só — navegação, primeira impressão e a cobrança
   do dia. É o pacote que ela sente amanhã, e é barato.
2. **M1, a entrega num lugar só.** Maior ganho percebido por esforço de toda a
   lista, e não cria nada: reaproveita nove geradores que já existem.
3. **P4 e P5** quando houver um celular de verdade na mão, junto com a
   homologação que já está pendente.
4. **M2 e M3** conforme as primeiras contas crescerem — as duas só doem com
   volume, e o volume ainda não existe.
5. **As grandes, depois do beta.** O mapa do produto já diz isso, e o motivo
   continua valendo: cinco contas novas não pedem campo configurável, pedem que
   o que existe não erre.


---

## 6. O que foi feito depois desta proposta (24/11)

### P1 — a barra de telas do evento · `80a9490`

Mora no shell do aplicativo, decide sozinha se aparece pelo endereço, e **não
aparece na capa** (que já desenha a Jornada inteira). Nenhuma consulta: é só
caminho, então aparece antes de o conteúdo da tela chegar.

A lista ficou em `src/lib/telas-do-evento.ts`, fora do componente, e
`telas-do-evento.test.ts` confere três sentidos: toda rota `/eventos/:id/*` do
`App.tsx` tem pastilha, toda pastilha tem rota, e **toda etapa da Jornada com
tela própria tem pastilha**. O terceiro é o que pegaria o defeito desta
integração — o Layout nasceu com rota, tela pronta e nenhum caminho até ela.

### P2 — o cartão de primeiros passos · `81ea795`

Com o essencial pronto, não aparece. Nada foi gravado: concluído é derivável.
O X continua dispensando enquanto ainda falta algo. Quem apagar o único evento
(o de teste da demonstração) vê o cartão voltar — é a verdade.

### P3 — a cobrança no WhatsApp · `6d089ea`

Além dos dois atalhos novos (pendência de reunião no painel, parcela vencida),
apareceu um **defeito que já estava nas três telas antigas**: `wa.me/55${…}`
com telefone salvo como "+55 11 99999-9999" — jeito normal de colar da agenda
do celular — gerava `5555119999999999` e abria a conversa num número
inexistente, sem erro nem aviso. `src/lib/whatsapp.ts` passou a ser o único
lugar, e as três telas foram migradas.

Duas regras que valem registrar porque são sobre dinheiro e sobre confiança:

- a parcela cobra o **saldo**, nunca o valor cheio — cobrar R$ 2.500 de quem já
  pagou R$ 1.000 custa a confiança da cliente;
- o botão do painel **nomeia a destinatária** ("Cobrar Marina no WhatsApp"),
  porque a pendência pode ser do florista e um botão anônimo faria ela mandar
  para a pessoa errada.

Continua não sendo envio: abre o WhatsApp dela, com o texto escrito, para ler e
mandar com o dedo. `communicationsOutbox` segue fechado.

### Validação desta rodada

```
pnpm test                                  6.444 testes, 290 arquivos — passou
npx tsc -p tsconfig.app.json --noEmit      limpo
npx tsc -p convex/tsconfig.json --noEmit   limpo
pnpm lint                                  0 erros, 8 avisos (pré-existentes)
pnpm build                                 ok (pedaço principal: 837 → 841 kB)
```

### O que isto NÃO muda

Nenhum dos três depende de publicação para ser verdade no código, e nenhum foi
visto em tela: continuam **NÃO TESTADOS no navegador**, junto com o resto da
homologação. A barra do evento em especial pede olho no celular — ela rola na
horizontal, e é o tipo de coisa que leitura de código não aprova.

### Próximo da fila

**M1, a entrega num lugar só** — estender "Pronto para mostrar?" para entregar
os PDFs prontos e o texto de WhatsApp. Segue sendo o maior ganho percebido por
esforço da lista.
