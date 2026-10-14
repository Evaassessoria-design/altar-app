# Checkpoint — evolução para a live de 14/10 (11/10/2026, 2ª rodada)

## Onde está

| O quê | Estado |
|---|---|
| Repositório | `Evaassessoria-design/altar-app`, PC da Eva |
| PROD frontend | `5810dbd` — CSS no ar `index-DwvYhOS9.css` (conferido em 11/10) |
| PROD backend (`mellow-goose-539`) | `5ec2c4c` |
| Candidato | `feature/evolucao-14-10` (a partir do `5810dbd`) — GitHub, **nada publicado** |
| `main` | `86dc253` — sem merge |
| Produção floral | `origin/feature/producao-floral` `fd7deae` — revisada, **não integrada** |

O candidato é **só frontend**: nenhuma função do Convex mudou desde `5ec2c4c`.

## O que o candidato traz

| Commit | O quê |
|---|---|
| `37a19cd` | Acrescentar parcelas: lista das já lançadas, total depois, aviso acima do contratado |
| `821dc5a` | Correção cancelada no meio avisa que não foi concluída |
| `eb35ba7` | Cada leva adicional com número próprio; diálogos sem rolagem lateral |
| `6b4f513` | Teste da jornada com relógio fixo |
| (docs) | este checkpoint e `docs/roteiro-live-2026-10-14.md` |

## 1. Parcelas adicionais — o que foi provado

**Defeito achado e corrigido.** Com o rótulo fixo "Parcela adicional", uma
**2ª leva adicional** com os mesmos valores e datas da 1ª voltava
`repetido: true` — nada era criado. Provado com teste antes da correção.

**Correção (menor possível, só tela):** `rotuloDaLeva` numera as levas
("Parcela adicional", depois "(leva 2)", "(leva 3)"…) a partir das descrições
existentes. O nome é fixado ao abrir o diálogo. O servidor, a chave e a regra
de assinatura não mudaram.

Testes no banco (`convex/pagamentos.evento.test.ts`, "levas sucessivas"):
- original + 1ª adicional + 2ª adicional idênticas → 3 + 3 + 3 criadas;
- clique repetido (dois envios simultâneos, mesma chave) → cria uma vez;
- resposta perdida → reenvio com a mesma chave não duplica e não vira leva 2;
- recusa antes de gravar (vencimento inválido) → nada fica pela metade; nova
  tentativa com a mesma chave cria;
- conta rival não acrescenta parcelas no evento da dona.

No navegador (DEV): duplo clique criou 3 (não 6); a 2ª leva idêntica saiu
como "(leva 2)" e foi criada; a prévia da 3ª mostra "(leva 3)".

### 3ª rodada (11/10): a numeração NÃO bastava — a chave é que protege

O nome da leva sozinho deixava um furo, provado em teste no banco: o servidor
grava, a resposta se perde, a decoradora **fecha e reabre** o diálogo. A chave
nascia a cada abertura e o nome era recalculado da lista (que já trazia a leva
gravada). Saía "(leva N+1)" com chave nova, e o servidor criava tudo de novo.

**Correção (só tela, servidor intacto):**
- A tentativa (chave, nome e prévia) é guardada **antes** de enviar, no
  `sessionStorage` da aba (com reserva em memória), e só é apagada quando a
  resposta confirma.
- Ao abrir o diálogo, ou ela é **descartada com aviso**, se a lista mostra que
  entrou ("A tentativa anterior foi gravada… Nada foi duplicado"), ou é
  **retomada** com a mesma chave, o mesmo nome e a mesma prévia.
- `situacaoDaLeva` (regra pura) compara a prévia com a lista ao vivo:
  "gravada" (não envia), "ocupada" (outra aba usou o nome: pede para reabrir)
  ou "livre".
- Com a resposta perdida a promessa pode nunca voltar: se a lista já mostra a
  leva, fechar o diálogo fica liberado.

| Caso | Teste no banco | Navegador (DEV) |
|---|---|---|
| 1. 1ª e 2ª levas iguais | as duas criadas | "(leva 2)" criada |
| 2. Clique duplo | cria uma vez | 3 criadas, não 6 |
| 3. Grava e a resposta se perde | reenvio com a mesma chave → repetido | resposta do WebSocket descartada: leva gravada, aviso "já estão lançadas", Cancelar liberado |
| 4. Fechar e reabrir depois | lista mostra a leva → "gravada"; a mesma chave → repetido | aviso "A tentativa anterior foi gravada"; a leva aparece 1 vez; a próxima é a seguinte |
| 4b. O envio NÃO chegou e a página é recarregada | — | "Retomando…" com a mesma chave e os mesmos valores; criou 1 vez; o envio antigo, reenviado pelo Convex ao reconectar, voltou "já existiam — nada foi criado" |
| 5. Duas abas com a mesma lista | a 2ª, igual → "gravada" e o servidor barra pela assinatura; com outros valores → "ocupada", reabrir dá a leva seguinte | aba B: "já estão lançadas" (botão desligado); com outro valor: "Outra janela acrescentou…" (botão desligado); reabrir → próxima leva |

Achado do navegador: com uma mutation em voo, o próprio Convex mostra o
aviso "Sair do site?" ao recarregar.

**Limites que ficam:**
- Uma leva feita em **outro aparelho ou aba** depois de uma resposta perdida
  é indistinguível de uma leva nova intencional. O que protege é a lista
  "Já lançadas", visível antes do clique.
- Se a decoradora, ao retomar, mudar os valores, e a 1ª tentativa tiver
  entrado sem a lista ainda mostrar, o servidor responde "repetido" pela
  chave e nada é criado. Ela vê isso no aviso.

## 2. Correção de recebimento — validado no DEV (desktop)

| Caso | Resultado |
|---|---|
| Anular e registrar o valor certo | anulado riscado com motivo; novo ativo; status e saldo recalculados |
| Anular e cancelar o novo registro | aviso "Correção não concluída…"; parcela volta a Pendente; saldo de volta; nada diz "corrigido" |
| Falha e nova tentativa | valor acima do saldo barrado na tela (o saldo acompanha ao vivo, inclusive quando outra aba registra); diálogo fica aberto; nova tentativa com valor válido conclui |
| Aba do evento × Financeiro | mesmos status, recebido, saldo e histórico nas duas telas |

**Limitação:** não simulei falha de **rede** no navegador. Com o Convex, uma
mutation feita sem conexão fica na fila e é enviada ao reconectar; a recusa
do servidor só foi provocada nos testes.

**Achados de layout corrigidos (`eb35ba7`):**
- Detalhes da parcela com saldo: rodapé de três botões alargava o diálogo
  (rolagem lateral no desktop; botão cortado). Agora quebra linha.
  **Este defeito está em PROD** (`5810dbd`).
- Acrescentar parcelas no celular: a lista das já lançadas alargava o grid do
  diálogo (411 px de conteúdo em 339). Corrigido.

Medido: diálogos e página sem rolagem lateral em desktop e em 390 px
(**iframe de 390 px no navegador do PC, não aparelho real**).

Dados criados no DEV (conta de teste, evento "TESTE Atalhos"): duas levas
adicionais de R$ 200 (3×), recebimentos de R$ 50 (anulado), R$ 100 e R$ 20 na
"Parcela 1/1", e R$ 66,67 anulado na "Parcela adicional 1/3".

## 3. Teste dependente da data

`jornada.evento.test.ts > Marina & Gabriel semeada` — causa confirmada com o
relógio controlado: passa em 09/10, falha em 10/10 e 11/10. O herói tem data
fixa (`DEMO_WEDDING.event.date = 2026-10-10`); o resto do portfólio é
relativo a "agora"; `aconteceu = data <= hoje`.

Correção: relógio fixo 5 dias antes da data do herói (derivado da fixture),
mesmas verificações, e um caso novo prova o outro lado (no dia: Operação).

**Isso não atualiza nada no banco.** O evento da conta de demonstração
continua com 10/10.

### Proposta para o evento-herói na live de 14/10 (não executada)

Hoje o herói aparece como "já aconteceu": a Jornada mostra Operação, e o
alerta de déficit do acervo sumiu. Três saídas, da mais simples à mais completa:

1. **Usar outro evento no bloco 4.** Use um evento com data futura e deixe
   Marina & Gabriel para mostrar o retorno do acervo. Não mexe em dado nenhum.
2. **Mudar a data pela tela, na conta de demonstração.** Editar o evento para
   uma data depois da live (ex.: 24/10/2026). É rápido. Mas a janela da
   reserva do acervo (09–11/10) e a "Parcela final" (05/10) continuam com as
   datas velhas, e o déficit de guardanapos só volta se a reserva acompanhar.
   Conferir antes do ensaio.
3. **Fixture com datas à frente + `internal.demo.resetar`.** Mover a data do
   herói, a janela de reserva (`demoData.ts:481`), o lead (`:543`) e as
   datas ligadas (`:408`, `:428`), revisar os testes que usam `2026-10-10`, e
   rodar o reset no deployment da demonstração. O reset só roda com
   `ALTAR_DEMO=1` e sem sinal de produção, e **apaga o que foi subido à
   mão** (fotos, contrato: `docs/checklist-demo-manual.md`). Exige sua
   autorização, o alvo confirmado e refazer os uploads.

Recomendo a **1** para 14/10 (risco zero) e a **3** depois da live, com calma.

## 4. Produção floral — revisão (`fd7deae`, sem integrar)

**Veredito: não está pronta para merge.**

- **Compatibilidade:** `git merge-tree` com o candidato sai limpo; os arquivos
  não se cruzam. O schema só acrescenta campos opcionais.
- **Testes:** 26 casos da floral + 7 de tela; 681/681 nos arquivos de
  ficha, receita, materiais, paywall e isolamento; `tsc` ok.
- **Teste de fronteira quebrado pela branch:** `dialogo-altura.test.ts`
  (`max-h-[90vh]` em `instrucoes-dialog.tsx:106` e `linhas-florais-dialog.tsx:152`).

| Ponto | Situação |
|---|---|
| Receita × total distribuído | conta certa (regra única `necessidadeDoComponente`) |
| Resumo do florista | **soma flor natural com permanente** e cores diferentes ("Rosa 148 hastes") |
| Ficha Técnica | **não foi adaptada ao distribuído**: mostra "20 × 2 = 2" e "2 maços" sob "POR UNIDADE" |
| Frações e unidades | ok: 0,5 aceito; unidades diferentes não se somam |
| Salvar cor/origem | **recopia custo, margem e unidade do catálogo** (via `setReceita`) |
| "Só orientação" | grava quantidade 0; ao desmarcar, a original se perdeu |
| Foto da flor × referência | separadas e rotuladas; **o botão de foto acha o material pelo nome**, não pelo id |
| Isolamento / arquivos | ok (`getOwnedEvent`, NOT_FOUND, paywall no upload) |
| Testes que faltam | foto da Galeria de outro evento; `materialId` de outra conta |
| PDF sem dado financeiro | preço/custo/margem não saem; **o nome da cliente e as notas internas saem** |

**Decisões suas:** nome da cliente e notas internas no papel do florista?
Salvar cor/origem pode recopiar custo e margem? Natural e permanente da
mesma flor somam no resumo?

## 4ª rodada (12–13/10): dois candidatos separados

| Candidato | Branch | SHA final | Muda backend? |
|---|---|---|---|
| Pagamentos | `feature/evolucao-14-10` | o commit que traz esta seção (`git log -1`); código de produto = `a39539c`; depois só testes (`487544d`) e docs | não |
| Produção floral corrigida | `feature/producao-floral-ajustes` | `ad73c756e66032fbcd68bcb7d225796916fff722` | **sim** (schema aditivo + funções) |

A floral NÃO está nesta branch: ela é outra branch, a partir do `5810dbd`.
`git merge-tree` dos dois candidatos sai limpo (sem conflito).

**DEV (`healthy-pika-907`)** recebeu em 13/10 o backend da floral corrigida
(com autorização). O candidato de pagamentos não muda backend e funciona com
ele. **PROD não foi tocado.** O CLI avisou que a conta passou dos limites do
plano Free do Convex.

### Proposta de integração e publicação

1. **Antes da live (14/10)** — só o candidato de pagamentos, se você aprovar
   a conferência dele: publicar **só o frontend** (`docs/release-producao.md`),
   conferir o CSS no site. Backend de PROD fica no `5ec2c4c`.
2. **Floral fica para depois da live.** Ela exige deploy de backend em PROD
   (schema novo + funções), e o roteiro não depende dela.
3. **Depois da live**: integrar `feature/producao-floral-ajustes` em
   `feature/evolucao-14-10` (merge sem conflito), rodar a bateria, validar no
   DEV o conjunto, e publicar na ordem de `docs/release-producao.md`: backend
   PROD (aditivo, sem backfill) → frontend → CSS.
4. `main` só depois de PROD conferido.

### Evento alternativo para a live

O herói Marina & Gabriel (10/10) está como "já aconteceu". Sem mexer na DEMO:
usar **Casamento Sofia & Tomás** (semente + 21 dias; confirmado; R$ 118 mil;
acervo com 30 castiçais "vai faltar"; compras e checklist; segunda parcela
vencida). Fallback: **Bodas de Prata — Célia & Amaro** (semente + 38 dias).
Conferir na conta de demonstração, antes do ensaio, que a data mostrada é
depois de 14/10 — a semente conta os dias a partir de quando rodou.

### Teste dependente de data — o segundo

`demo.acervo.test.ts > o herói continua coberto nos castiçais` começou a
falhar depois de 11/10 (fim da janela de acervo do herói). Confirmado com o
relógio em 05/10 (passa) e 13/10 (falha). Mesmo tratamento da jornada:
relógio fixo derivado da fixture (`487544d`, também na floral). Outros
testes citam `2026-10-10` e passam hoje — podem envelhecer do mesmo jeito.

### Verificações desta rodada

- PROD conferido em 13/10: CSS `index-DwvYhOS9` (= `5810dbd`), sem mudança.

## Verificações (11/10, depois da última mudança de código)

- `pnpm test`: **5.987/5.987** (3ª rodada). Na 1ª execução, 3 testes de
  `event-form-dialog.test.tsx` estouraram 5 s com a máquina carregada; o
  arquivo sozinho passa 10/10 e a suíte repetida passou inteira.
- `tsc` do app e do Convex: ok. Lint: 0 erros, 8 avisos antigos.
- Build: ok, CSS `index-BCAFzw3P.css`. É o CSS esperado no site se este SHA
  for publicado; refazer o build no SHA final para conferir.

## Próximos passos

1. Você confere o candidato no DEV: Acrescentar parcelas duas vezes com os
   mesmos valores; Corrigir → Cancelar; detalhes de uma parcela com saldo no
   desktop e no celular.
2. Você escolhe a saída do evento-herói (recomendo a 1 para 14/10).
3. Se aprovar, autoriza a publicação **só do frontend**
   (`docs/release-producao.md`) e confere o CSS no site.
4. Ensaio com `docs/roteiro-live-2026-10-14.md`.
5. Floral depois da live: corrigir as pendências acima e responder às três
   decisões.

## 5ª rodada (13/10): publicação aguardando o clique, ensaio e decisões

- **Publicação de pagamentos autorizada** (só frontend, `94df752`). Candidato:
  `https://vercel.com/casando-assessoria/altar-app-sg8v/EaD83e9AJyLiLjszCVC3gbKBk2Q9`
  (preview `altar-app-sg8v-jh445dpen…`, CSS `index-BCAFzw3P`). Production
  atual = `5810dbd`, `altar-app-sg8v-453b2vsyt-casando-assessoria.vercel.app`
  (CSS `index-DwvYhOS9`, JS `index-CMEgTZdv`) — é o caminho de volta.
  **Ainda não promovido** em 13/10.
- **CI do GitHub vermelho desde `1669295`** (inclusive em `5ec2c4c` e
  `5810dbd`, que estão em PROD): `dialogo-altura.test.ts` faz `git grep` num
  commit antigo e o checkout do CI não traz histórico. Próxima rodada:
  `fetch-depth: 0` no `actions/checkout`.
- **DEMO (`insightful-goldfish-950`) não tem o backend de Pagamentos**
  (funções de parcelas e recebimentos ausentes; conferido por
  `function-spec`). Datas reais lidas no banco: semente de 28/09; Sofia &
  Tomás 19/10; Marina & Gabriel 10/10. O roteiro de 14/10 foi refeito para o
  site oficial com a conta de demonstração.
- **Divergência do DEV:** `healthy-pika-907` tem o backend da floral
  (`setLinhasFlorais`, `fichaDoFlorista`); esta branch não tem
  `convex/producaoFloral.ts` nem os campos florais no schema. **Não rodar
  `convex dev` a partir de `feature/evolucao-14-10`**: tiraria as funções da
  floral e tentaria um schema sem os campos que os dados do DEV já usam. Rodar
  só da branch da floral ou da integração das duas.
- **Decisão de produto para a próxima rodada (floral):** o consolidado de
  COMPRAS da Ficha Técnica também deve distinguir cor e natural/permanente,
  preservando unidades e variedades relevantes (hoje: Rosa 148 hastes somando
  natural e permanente). Floral preservada em `ad73c75`, sem integrar.
- **Cota do Convex:** aviso do CLI "Your projects are above the Free plan
  limits…"; consumo não lido (painel pede login). Conferir em
  `https://dashboard.convex.dev/t/evadelbiancoassessoria/settings/usage`.

## 6ª rodada (13/10, tarde): live na conta oficial, cota e CI

**Identificação dos SHAs — não confundir:**

| O quê | SHA | Observação |
|---|---|---|
| Candidato de pagamentos (aprovado, aguardando promoção) | `94df7520f84e7eb09b2314f2b01503db5eca0a7c` | Deployment Ready: `https://vercel.com/casando-assessoria/altar-app-sg8v/EaD83e9AJyLiLjszCVC3gbKBk2Q9`; CSS esperado `index-BCAFzw3P.css` |
| Correção do CI (só `.github/workflows/validacao.yml`) | `9e8f85ae607db9bd0c2e96e7b96f0d7b9ab9618a` | Não muda o app; não precisa ser publicada |
| Documentos da live | o commit que traz esta seção | Só `docs/` |

O que se promove no Vercel continua sendo o deployment do `94df752`. Os
commits seguintes não mudam o aplicativo (`git diff 94df752..HEAD -- src
convex public` sai vazio).

### Ambiente da live
Decidido: **site oficial, na conta própria**, com registros fictícios. A DEMO
fica fora (o evento alternativo Sofia & Tomás da 4ª rodada não vale mais).
Roteiro e checklist reescritos para os registros que existem na conta (lidos
em 13/10, sem alterar nada): lead e evento Matheus e Eva, proposta em
rascunho, Castiçais 14 e Vaso para Orquídea 20. O menu dessa conta mostra
Campanha e Painel Admin — o roteiro manda não clicar.

### Prontidão (por leitura, 13/10)
- Site: CSS `index-DwvYhOS9`, JS `index-CMEgTZdv` (= `5810dbd`), JS aponta
  para `mellow-goose-539.convex.cloud`/`.site`.
- Backend PROD: 324 funções; presentes `financeiro:pagamentosDoEvento`,
  `adicionarParcelas`, `registrarRecebimento`, `anularRecebimento`,
  `anexarComprovanteAoRecebimento`, `funil:convertToEvent`, `acervo:reservar`.
  Nenhuma da floral.

### Cota do Convex (painel, leitura)
Plano **Free**. Período **01/10–31/10/2026 (UTC)**. Excedido: **File Storage
1,14 GB / 1 GB** — 100% do projeto `altar-app`. O resto está dentro: Function
Calls 17K/1M; Database Storage 3,08 MB/512 MB; Database I/O 76,74 MB/1 GB;
**Data Egress 413 MB/1 GB** (o próximo a vigiar); Action Compute 0,013/20
GB-h; Deployments 4/40. O painel não mostra data de interrupção.

O salto foi em **06–07/10** (de ~380 MB para ~1,1 GB). Soma dos tamanhos em
`_storage` (CLI, só leitura):
- **DEV** `healthy-pika-907`: 20 arquivos, **565 MB**, quase todos de
  06/10 — os testes do teto de 100 MB (4 de 104,9 MB, 2 de 62,9 MB).
- **PROD** `mellow-goose-539`: 330 arquivos, **653 MB** (182 MB enviados em
  07/10).

Saída sem contratar plano: apagar os arquivos de teste do DEV (~565 MB) traz
o total para ~0,65 GB. **Não foi feito** — exige a sua autorização, porque é
exclusão permanente.

### CI
Causa confirmada: `src/lib/dialogo-altura.test.ts` faz `git grep` em
`b8a5cbe~1`; o `actions/checkout` padrão é raso (1 commit), o commit não
existe e a busca volta vazia (reproduzido com `git clone --depth 1`: 1 linha
de erro × 9 achados com histórico). Correção mínima: `fetch-depth: 0`. O
teste não foi tocado.
