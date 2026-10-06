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

Restos no DEV: a conta de teste, o lead/evento "TESTE Upload Grande" e um
arquivo órfão de ~100 MB do teste adulterado.

## 6. Armazenamento e custo (Convex, preços públicos de 06/10/2026)

| Plano | Storage incluso | Excedente | Saída (download) inclusa | Excedente |
|---|---|---|---|---|
| Free / Starter | 1 GB | US$ 0,033/GB·mês | 1 GB/mês | US$ 0,132/GB |
| Professional | 100 GB | US$ 0,03/GB·mês | 50 GB/mês | US$ 0,12/GB |

Ordens de grandeza:

- **Guardar** é barato: 100 decoradoras × 20 documentos de 30 MB = ~60 GB.
  Cabe no Professional; no excedente, 100 GB a mais custam ~US$ 3/mês.
- **Baixar** pesa mais: cada abertura de um documento de 100 MB gasta 0,1 GB de
  saída. 500 aberturas/mês desses arquivos = 50 GB = a cota inteira do
  Professional; depois, ~US$ 6 a cada 50 GB.
- **Se a PROD estiver em Free/Starter**, 1 GB some com dez propostas de
  100 MB. **Confirmar o plano da PROD antes do release** — não foi consultado
  nem alterado nesta rodada.
- Órfãos (envio recusado ou interrompido depois do POST) ocupam storage pago
  sem aparecer em lugar nenhum. O inventário é o backlog `UPLOAD-ORFAO-02`.

## 7. Release para produção — pronto para aprovação, NÃO executado

O procedimento geral está em `docs/release-producao.md`. O que é específico
desta correção:

### 7.1 Decisão de escopo (humana)
A PROD roda código anterior a `a1b54db`. Esta branch nasceu da pre-live, que
está à frente da `main`. Há dois caminhos:

- **A. Release da pre-live + esta correção.** Leva junto tudo o que a pre-live
  acumulou (acervo, saúde, trava de autonomia da IA, roteiro da live). É o
  release que já estava previsto antes da live de 08/10.
- **B. Hotfix só de upload sobre a `main`.** Cherry-pick de `a1b54db` e do
  commit desta rodada. Menor, mas precisa ser montado e validado à parte.

### 7.2 Compatibilidade frontend antigo × backend novo (ordem da seção 2)
Nenhum argumento de função mudou nesta correção, nem o schema. O frontend que
está no ar (teto de 10 MB no hook) continua funcionando contra o backend novo,
que aceita até 100 MB. O inverso não vale: **o backend sobe ANTES** do
frontend, como manda o procedimento.

### 7.3 Passos
1. Aprovação do escopo (A ou B) e confirmação do plano Convex da PROD.
2. `npx convex function-spec --prod` × `--deployment mellow-goose-539` — prova de alvo.
3. `npx convex deploy --env-file <prod.env fora do repo> --dry-run -v` — tem de
   dizer "No indexes are deleted" e "Schema validation complete".
4. `npx convex deploy` com o SHA aprovado.
5. Fast-forward da `main` → CI verde → **promoção manual** no Vercel
   `altar-app-sg8v` (clique humano).
6. Provar o que está no ar (hash do CSS, seção 5 do procedimento).
7. Smoke test em `www.appaltar.com.br/funil` com **conta de teste**: anexar um
   DOCX de ~4 MB e um PDF de ~30 MB; conferir que a dica diz "Máximo de 100 MB".
8. Avisar a cliente.
