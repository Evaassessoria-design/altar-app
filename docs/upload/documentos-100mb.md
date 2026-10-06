# Documentos de até 100 MB — causa, correção, validação e release

Rodada de 06/10/2026. Escrito em `fix/documentos-100mb` (base pre-live
`f6f240f`) e levado para produção como **hotfix** na branch
`release/hotfix-upload-100mb`, criada sobre o commit que está no ar
(`4292056`) só com `a1b54db` e esta correção. Nada do Acervo, da Jornada ou
do Escritório entra no hotfix — ver seção 7.

---

## 1. O relato

Uma cliente anexou uma proposta em `appaltar.com.br/funil` e leu:

> Tamanho do arquivo: acima do limite de 1.000.000. Confira os zeros.

## 2. A causa, e os três números que apareceram na conversa

| Número | O que é | Onde mora |
|---|---|---|
| **1.000.000 bytes (0,95 MiB)** | **O defeito.** `leadDocuments.save` validava o tamanho do arquivo com `exigirQuantidadeGravavel`, cujo teto `QUANTIDADE_MAXIMA = 1_000_000` foi escrito para quantidade física ("um milhão de vasos é erro de digitação"). Em bytes, virou teto de upload. A tela dizia 20 MB, o hook 10 MB, e o backend recusava — depois de o arquivo já ter subido. | `convex/lib/numeroGravavel.ts:33` |
| **20 MB** | A correção de 01/10 (`a1b54db`): fonte única em `convex/lib/arquivos.ts`, mesmo predicado `cabeNoTeto` na tela, no hook e no backend. Está na pre-live, **não em produção** — por isso a cliente ainda vê a mensagem antiga. | `TAMANHO_MAXIMO_DOCUMENTO` |
| **100 MB** | Esta rodada. Decisão de produto de 06/10. | a mesma constante |

## 3. O que o serviço permite de verdade

Conferido na documentação do Convex em 06/10/2026:

- **URL de upload** (`generateUploadUrl` + POST) — o caminho que o ALTAR já
  usava: *"The file size is not limited, but upload POST request has a 2
  minute timeout."* A URL expira em 1 hora.
- **HTTP action**: corpo limitado a 20 MB. O ALTAR não usa este caminho para
  arquivo, e não deve passar a usar.
- Documento do banco: 1 MiB — irrelevante aqui, o arquivo vai para o storage e
  o banco guarda só o `storageId`.

**O limite real do transporte é o PRAZO, não o tamanho.** 100 MB em 2 minutos
exige cerca de 7 Mbit/s de subida sustentada. Neste PC (rede cabeada) 100 MB
subiram em ~21 s. Num 4G fraco de galpão, não sobem — e a tela agora diz isso
(ver 4.3).

## 4. O que foi corrigido

### 4.1 O teto — `convex/lib/arquivos.ts`
`TAMANHO_MAXIMO_DOCUMENTO = 100 * MB` (104.857.600 bytes). A dica da tela, o
hook, a tela do funil e o backend leem a mesma constante. Imagem continua em
15 MB.

### 4.2 O servidor mede o arquivo GUARDADO — `convex/lib/arquivoGuardado.ts`
Defeito que a investigação achou além do relato: o teto existia **só na tela**.

| Porta | Antes | Agora |
|---|---|---|
| `leadDocuments.save` (funil) | conferia `fileSize` declarado pelo navegador | confere o tamanho na tabela `_storage`; grava o tamanho real |
| `contracts.saveContract` (pasta do evento) | **nenhuma conferência** | confere `_storage`, **antes** de substituir o documento do mesmo tipo |
| `financeiro.anexarComprovante` | **nenhuma conferência** | confere `_storage` |

A conferência vem sempre DEPOIS da posse (`requireLeadOwner`,
`requireEventOwner`, `meuLancamento`): dado de outra conta continua
respondendo `NOT_FOUND`, e o erro de tamanho não vira oráculo.

O arquivo recusado **não é apagado** — `_storage` não tem dono, e apagar por
`storageId` vindo do navegador apagaria o de outra empresa. Ver
`arquivo-orfao.md`, backlog `UPLOAD-ORFAO-01`, que agora pesa mais: um órfão
pode ter 100 MB.

### 4.3 A interface — `src/hooks/use-upload.ts`, `src/components/estado-do-envio.tsx`
- **Progresso real de subida** (XMLHttpRequest; `fetch` não informa progresso
  de envio): barra e "Enviando… 42%. Não feche esta janela."
- **A falha fica na tela** com **Tentar de novo** (mesmo arquivo, URL de upload
  nova) e **Descartar**. Antes era um toast que sumia levando a escolha.
- Recusa de conteúdo (tamanho, vazio) **não** oferece repetir — daria o mesmo não.
- **Mensagem certa por causa:** perto dos 2 minutos, "passou de 2 minutos…
  tente no Wi-Fi ou reduza o arquivo"; queda rápida, "verifique a conexão".
- **Envio duplicado:** trava por ref no hook E na tela (a da tela era estado do
  React, e dois toques no mesmo instante passavam — achado na validação real).

## 5. Validação

### 5.1 Testes automatizados (convex-test, sem rede)
- `convex/lib/arquivos.test.ts` — bordas byte a byte (100 MB exatos cabe,
  +1 não), recado, `motivoDaFalhaDoEnvio`.
- `convex/leadDocuments.upload.test.ts` — o DOCX de 3,9 MB nas três portas;
  blobs com tamanho REAL; cliente que declara 1 MB e guarda 100 MB + 1;
  arquivo que sumiu do storage; rival recebe `NOT_FOUND` antes da conferência.
- `convex/documentos-grandes.test.ts` — pasta do evento e comprovante nas
  bordas; **recusar o novo não apaga o contrato antigo**; documento de 36 MB
  do lead visível no evento depois de `convertToEvent`, invisível para a rival.
- `src/lib/upload-telas.test.ts` — as duas telas mostram progresso, guardam a
  falha, travam por ref e não oferecem repetir recusa de conteúdo.

### 5.2 Testes reais (DEV `healthy-pika-907`, pela interface, 06/10)
Conta de teste criada em `localhost:5173`; lead e evento de teste. Arquivos com
bytes aleatórios entregues ao `<input>` real da tela; SHA-256 conferido no
download.

| Caso | Resultado |
|---|---|
| DOCX 3,9 MB (o do relato) no funil | anexado; download íntegro (SHA-256 igual) |
| 50 KB no funil | anexado; íntegro |
| **100 MB exatos** no funil | anexado em ~21 s, progresso visível; download de 104.857.600 bytes íntegro |
| 100 MB + 1 byte no funil | recusado na tela, frase clara, **nenhum POST** |
| Queda de rede simulada no POST | falha fica na tela com "Tentar de novo"; repetir anexou; 2 cliques = 1 POST, 1 documento |
| Recarregar a página | os 4 documentos continuam, com tamanhos |
| Converter o lead em evento | os 4 aparecem em "Da negociação" na pasta do evento |
| PPTX 60 MB na pasta do evento, disparado 2× no mesmo instante | 1 POST, anexado em ~13 s, sem aviso falso |
| **Cliente adulterado**: 100 MB + 1 declarando 1 MB, na pasta do evento | o arquivo subiu (17 s) e o **servidor recusou** pelo tamanho real; o orçamento de 60 MB que já estava lá **não foi apagado** |

**Não validado de verdade:** o corte dos 2 minutos (exigiria rede lenta real
ou limitador de banda) — a frase está coberta só por teste de unidade; celular
(o login pelo celular no DEV não funciona: `SITE_URL` é `localhost:5173`).

Restos no DEV: a conta de teste, os leads/eventos "TESTE Upload Grande" e
"TESTE Hotfix", e dois arquivos órfãos de ~100 MB dos testes adulterados.

### 5.3 O artefato do hotfix (`release/hotfix-upload-100mb`), no DEV, 06/10

O hotfix foi publicado temporariamente no DEV (245 funções = exatamente as do
código do hotfix e as da PROD) e servido em `localhost:5173`. Mesma bateria
da 5.2, com resultado igual: DOCX 3,9 MB, 100 MB exatos (~18 s), 100 MB + 1
recusado sem POST, 50 KB, downloads com SHA-256 igual, persistência após
recarregar, queda de rede + "Tentar de novo" (2 cliques = 1 envio), conversão
em evento com os 4 documentos visíveis, PPTX de 60 MB na pasta do evento
disparado 2× (1 POST), e cliente adulterado recusado pelo servidor sem apagar
o orçamento anterior.

Diferença observada em relação à versão da pre-live: **nenhuma no
comportamento de upload** (o código de upload é idêntico ao de `808e3c2`). O
resto da tela é o de produção — sem Acervo novo, Jornada ou Escritório.

Ruído registrado: um download de 100 MB pelo `curl` deste PC caiu com
`SEC_E_DECRYPT_FAILURE` (erro de TLS do Windows) e veio truncado com HTTP 200;
repetido, veio íntegro. O servidor anunciava o `Content-Length` correto.

Depois da validação, o DEV voltou ao código da pre-live com a correção
(`808e3c2`), que é onde estava.

## 6. Armazenamento e custo

### 6.1 Uso atual da PROD (consulta inline somente leitura, 06/10/2026)

| | |
|---|---|
| Arquivos no storage | 302 |
| Total | **0,408 GB** (417,5 MB) |
| Maior arquivo | 97,7 MB (origem não investigada) |
| Acima de 1.000.000 bytes | 92 (galeria, pasta do evento e outros fluxos sem a trava antiga) |
| Acima de 20 MB | 1 |

**Plano e tráfego de saída: não consultados.** O CLI do Convex não mostra
cobrança, e o painel pede login — que é humano. Onde ver:
`dashboard.convex.dev` → time `evadelbiancoassessoria` → Settings → Usage /
Billing.

### 6.2 Preços públicos (06/10/2026)

| Plano | Storage incluso | Excedente | Saída inclusa | Excedente |
|---|---|---|---|---|
| Free / Starter | 1 GB | US$ 0,033/GB·mês | 1 GB/mês | US$ 0,132/GB |
| Professional | 100 GB | US$ 0,03/GB·mês | 50 GB/mês | US$ 0,12/GB |

### 6.3 A margem

- **Se for Free/Starter:** sobram ~0,59 GB de storage — **cinco ou seis
  documentos de 100 MB** —, e cada abertura de um deles gasta 0,1 GB do 1 GB
  de saída do mês. No Free não há excedente pago (o que acontece ao passar do limite não foi
  verificado); no Starter, o excedente é cobrado.
  **Neste cenário o limite de 100 MB é arriscado e o release deve esperar a
  decisão de plano.**
- **Se for Professional:** 0,4 de 100 GB usados; a saída (50 GB/mês) é o que
  aperta primeiro — 500 aberturas de arquivos de 100 MB por mês.
- Órfãos (envio recusado ou interrompido depois do POST) ocupam storage pago
  sem aparecer na tela — backlog `UPLOAD-ORFAO-02`.

## 7. Release para produção — PRONTO PARA APROVAÇÃO, NÃO EXECUTADO

### 7.1 O que está no ar (identificado em 06/10/2026)

**`4292056`** (`fix(demo): a auditoria do cron achou um órfão no reset`), no
frontend E no backend:

- **Registro de deployment:** o último `Production – altar-app-sg8v` na API de
  deployments do GitHub é `4292056` (28/09, 03:06 UTC).
- **Frontend:** `www.appaltar.com.br` serve `index-qCI8R7Tz.css`; o build local
  de `4292056` com as variáveis de PROD gera o mesmo nome; o de `86dc253`
  gera `index-CmnAXRUH.css`. (O cabeçalho `Last-Modified` diz 30/09 — o
  conteúdo é o de `4292056`.)
- **Backend:** as 245 funções públicas de `mellow-goose-539` são exatamente as
  do código de `4292056`. `86dc253` teria `escritorio.comando`; a pre-live,
  mais 8.

A `main` (`86dc253`) **não** é o que está no ar.

### 7.2 O candidato

Branch `release/hotfix-upload-100mb`, sobre `4292056`:

1. `a1b54db` reaplicado — o teto de 0,95 MiB vira a fonte única.
2. `808e3c2` reaplicado — 100 MB, servidor medindo o arquivo guardado,
   progresso e repetição. Sem o roteiro da live (pre-live).
3. Teste da demo com relógio fixo (`demo.telas.test.ts`) — só teste.
4. Este documento.

Nada de schema, rotas HTTP, crons ou autenticação muda em relação a `4292056`.

### 7.3 Compatibilidade, e por isso a ordem

| Combinação | Resultado |
|---|---|
| frontend antigo × **backend novo** | **funciona.** Nenhum argumento mudou. O hook antigo limita a 10 MB e o backend novo aceita até 100 MB — a cliente já é destravada para arquivos até 10 MB. |
| frontend novo × backend antigo | **quebra.** A tela aceita 100 MB e o backend antigo recusa acima de 1.000.000 bytes, depois do upload. |

**Backend primeiro, frontend depois.** Nunca o contrário.

### 7.4 Passos exatos

Pré-requisitos humanos: (a) aprovar este candidato; (b) confirmar o plano
Convex da PROD (6.3).

```bash
# 0. Checkout limpo do candidato, fora da pasta de trabalho
git fetch origin
git worktree add ../altar-release origin/release/hotfix-upload-100mb
cd ../altar-release && npx pnpm install --frozen-lockfile   # cópia própria, sem junção
printf 'CONVEX_DEPLOYMENT=prod:mellow-goose-539\n' > ../prod.env

# 1. Prova de alvo (só leitura)
npx convex function-spec --prod > ../a.json
npx convex function-spec --deployment mellow-goose-539 > ../b.json
cmp ../a.json ../b.json

# 2. Dry-run: tem de dizer "No indexes are deleted" e "Schema validation complete"
npx convex deploy --env-file ../prod.env --dry-run -v

# 3. Backend
npx convex deploy --env-file ../prod.env \
  --message "hotfix upload 100MB <SHA do candidato> (release/hotfix-upload-100mb)"
#    a saída tem de mostrar [Production] ... mellow-goose-539

# 4. Prova: as funções publicadas = as do candidato (245, as mesmas de hoje)
npx convex function-spec --deployment mellow-goose-539 > ../c.json
```

5. **Vercel (clique humano)** — `https://vercel.com/casando-assessoria/altar-app-sg8v/deployments`:
   1. Copiar a URL do deployment **Production / Current** atual (é o de
      `4292056`) — é o caminho de volta.
   2. Abrir o deployment **Preview** da branch `release/hotfix-upload-100mb`
      com o SHA do candidato, Status **Ready**.
   3. **⋯ → Promote**. O diálogo tem de listar `www.appaltar.com.br`. O aviso
      de reconstrução com variáveis de Production é esperado.
   4. Esperar **Ready**.
6. **Prova do frontend:**
   `curl -s https://www.appaltar.com.br/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.css'`
   tem de devolver **`index-BjmNlhb2.css`**.
7. **Smoke test** em `www.appaltar.com.br/funil` com conta de **teste**: DOCX
   de ~4 MB e PDF de ~30 MB num lead; a dica diz "Máximo de 100 MB"; abrir os
   dois. Excluir os dois depois.
8. Avisar a cliente.

### 7.5 A `main` depois do release

O hotfix não descende da `main`: a `main` (`86dc253`) já tem o Escritório,
que não está no ar. Para a `main` não ficar atrás da produção, **depois** do
release: merge de `release/hotfix-upload-100mb` na `main`, com aprovação. A
pre-live já contém `a1b54db`; levar `808e3c2` e o teste da demo para lá é
um merge de `fix/documentos-100mb` — outra decisão.

### 7.6 Reversão

- **Frontend:** no Vercel, promover de volta o deployment copiado no passo
  5.1. Prova: o CSS volta a `index-qCI8R7Tz.css`.
- **Backend:** de um checkout de `4292056`, `npx convex deploy --env-file
  ../prod.env --message "rollback para 4292056"`. Seguro: o schema não mudou.
  Documentos de até 100 MB gravados nesse meio-tempo continuam abríveis — o
  backend antigo não confere tamanho na leitura —, mas novos envios acima de
  1.000.000 bytes no funil voltam a ser recusados.
- **Ordem da reversão:** frontend primeiro, backend depois — o inverso da
  publicação, pela mesma tabela 7.3.
