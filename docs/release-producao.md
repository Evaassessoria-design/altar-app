# Release para produção — o mapa e o procedimento

Levantado e executado na release de **28/09/2026** (`4292056`). Antes disso,
nada no repositório dizia como o ALTAR chega ao ar, e a release parou uma vez
inteira só para redescobrir: três projetos Vercel ligados ao mesmo repositório,
o site oficial servindo um commit de uma branch antiga, e um merge na `main`
que não publicava nada visível. Este documento existe para que isso não
precise ser descoberto de novo.

---

## 1. O mapa

```
GitHub  main ──(push)──► Vercel altar-app-sg8v ──(PROMOÇÃO MANUAL)──► www.appaltar.com.br
                                                                        │
                                                                        ▼
                         npx convex deploy (MANUAL, separado) ──► Convex PROD mellow-goose-539
```

| Peça | Valor |
|---|---|
| Domínio oficial | `https://www.appaltar.com.br` (`appaltar.com.br` redireciona para ele) |
| Projeto Vercel oficial | **`altar-app-sg8v`**, time `casando-assessoria` |
| Branch que se promove | `main` |
| Convex PROD | **`mellow-goose-539`** (`https://mellow-goose-539.convex.cloud`) |
| Convex DEV | `healthy-pika-907` — nunca é alvo de release |

### Os outros projetos Vercel NÃO são produção

`altar-app`, `altar-app-rtyl` e `altar-app-gold` estão ligados ao mesmo
repositório e constroem a cada push. Nenhum tem `appaltar.com.br`. O
`altar-app-rtyl` chega a marcar o push da `main` como "Production" — mas no
domínio `*.vercel.app` dele, não no oficial. Um "Production ✓" no GitHub vindo
de um desses NÃO significa que o site mudou.

### O que um push na `main` faz — e o que NÃO faz

- **No `altar-app-sg8v` gera Preview, não Production.** Desde 02/09/2026 todo
  deploy desse projeto é Preview, inclusive os da `main` (17/09 e 28/09). O
  domínio só troca por **promoção manual** no painel.
- **Não publica o Convex.** O build do Vercel não roda `convex deploy`: em
  28/09 o Convex PROD ainda estava com as funções do commit `a184412`, e não
  com as da `main` que o Vercel tinha construído em 17/09.

As duas coisas são **passos manuais, separados, e a ordem entre eles importa.**

---

## 2. A ordem, e por que é esta

1. **Conferir compatibilidade: frontend no ar × backend novo.** Entre o passo 3
   e o passo 6, o site oficial continua com o frontend ANTIGO falando com o
   backend NOVO. Toda função que ele chama precisa continuar existindo, com
   argumentos que aceitem o que ele manda, e o schema novo precisa aceitar todo
   documento antigo. Se não for compatível, esta ordem não serve — pare e
   desenhe a transição.
2. **Conferir variáveis de ambiente de PROD** (só os NOMES — `env list` imprime
   valores; corte-os antes de exibir). Módulo novo que dependa de variável
   ausente precisa falhar FECHADO (503, padrão seguro, envio desligado).
3. **Convex PROD** — dry-run, depois o deploy (seção 3).
4. **Fast-forward da `main`** para o SHA aprovado, push normal:
   `git push origin <sha>:refs/heads/main`. Fast-forward é o que garante que a
   `main` é EXATAMENTE o SHA validado; merge pela interface criaria outro.
5. **CI da `main`** até `success`.
6. **Promoção no Vercel** (seção 4) — o único clique humano.
7. **Provar o que está no ar** (seção 5), smoke test, logs.

Convex antes do frontend porque o frontend novo chama funções que só existem
no backend novo, e o contrário (frontend antigo × backend novo) é o que o
passo 1 comprova. Convex antes da `main` porque o push da `main` publica o
frontend novo nos projetos secundários, que também apontam para PROD.

---

## 3. Convex PROD — o comando

`npx convex deploy` NÃO aceita `--deployment`: ele vai para a "produção padrão
do projeto" e, com `CONVEX_DEPLOYMENT=dev:...` no `.env.local`, pede uma
confirmação interativa. Nomeie o alvo explicitamente com um arquivo FORA do
repositório:

```bash
printf 'CONVEX_DEPLOYMENT=prod:mellow-goose-539\n' > /caminho/fora/do/repo/prod.env

# 1. Prova de alvo, só leitura: o --prod tem de ser o mellow-goose-539
npx convex function-spec --prod > a.json
npx convex function-spec --deployment mellow-goose-539 > b.json
cmp a.json b.json

# 2. Dry-run: valida o schema contra os DADOS REAIS e lista o que muda
npx convex deploy --env-file /caminho/fora/do/repo/prod.env --dry-run -v
#    tem de dizer: "No indexes are deleted by this push" e "Schema validation complete"

# 3. O deploy, com o SHA no log de auditoria do Convex
npx convex deploy --env-file /caminho/fora/do/repo/prod.env \
  --message "release <sha> (<branch>)"
```

A saída tem de mostrar `[Production] ... mellow-goose-539`. Se aparecer
`healthy-pika-907`, pare.

Depois, conferir que publicado = código:

```bash
npx convex function-spec --deployment mellow-goose-539   # comparar com o código
```

---

## 4. Vercel — a promoção (clique humano)

1. `https://vercel.com/casando-assessoria/altar-app-sg8v/deployments`
2. **Antes de tudo, copiar a URL do deployment marcado Production/Current.** É o
   caminho de volta.
3. Abrir o deployment da `main` com o SHA aprovado: **Status Ready, Branch
   `main`, Commit `<sha>`**. Se houver dois do mesmo SHA (um da branch de
   integração, outro da `main`), promover o da **`main`**.
4. Menu **⋯** → **Promote**. O diálogo tem de listar `www.appaltar.com.br`.
   Aviso de que será reconstruído com as variáveis de Production é esperado
   (é Preview sendo promovido) — confirmar.
5. Esperar o novo Production ficar **Ready**.

---

## 5. Provar o que está no ar

O Vercel não publica o SHA no site. O que prova é o **hash do CSS**, que só
depende do código-fonte:

```bash
curl -s https://www.appaltar.com.br/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.css'

git checkout <sha>
VITE_CONVEX_URL=https://mellow-goose-539.convex.cloud \
VITE_CONVEX_SITE_URL=https://mellow-goose-539.convex.site \
  npx vite build --outDir /fora/do/repo/build --emptyOutDir
# o index-*.css gerado tem de ter o MESMO nome
```

E o bundle tem de apontar para PROD:

```bash
curl -s https://www.appaltar.com.br/assets/index-<hash>.js \
  | grep -oE '[a-z]+-[a-z]+-[0-9]+\.convex\.(cloud|site)' | sort -u
# mellow-goose-539 (happy-otter-123 é texto de exemplo da biblioteca, ignorar)
```

O hash do **JS** difere do build local — o ambiente de build do Vercel entra
nele. Não é sinal de problema; o CSS e a lista de chunks é que comparam.

---

## 6. Rollback

- **Frontend:** no `altar-app-sg8v`, promover de volta o deployment anotado no
  passo 4.2. Instantâneo e sem risco de dado.
- **Convex:** preferir **corrigir para frente**. Voltar o código antigo só é
  seguro se o schema antigo aceitar o banco de agora: tabela nova que já
  recebeu documento pode impedir o deploy do schema antigo. Isso NÃO foi
  testado; se precisar, rode primeiro o `--dry-run` do commit antigo e leia.
- **Por que o frontend quase sempre basta:** o passo 2.1 exige que o frontend
  anterior funcione com o backend novo. Voltando só o frontend, o site volta a
  ser o que era.

---

## 7. Checklist

- [ ] HEAD aprovado, árvore limpa, CI do SHA `success`
- [ ] `origin/main` é ancestral do SHA (fast-forward possível)
- [ ] Compatibilidade frontend no ar × backend novo: funções, argumentos, schema
- [ ] Nomes das variáveis de PROD conferidos; o que falta falha fechado
- [ ] Cron novo: o que ele escreve em PROD?
- [ ] `function-spec --prod` idêntico ao de `mellow-goose-539`
- [ ] Dry-run: sem índice apagado, schema validado
- [ ] `convex deploy` com `--message "release <sha>"`
- [ ] Publicado = código
- [ ] `git push origin <sha>:refs/heads/main` (sem `--force`)
- [ ] CI da `main` `success`
- [ ] URL do Production atual do `sg8v` anotada **antes** de promover
- [ ] Promote do deployment da `main`, SHA conferido na tela
- [ ] CSS no ar = CSS do build local do SHA; bundle aponta para `mellow-goose-539`
- [ ] Smoke test (seção 8)
- [ ] `npx convex logs --deployment mellow-goose-539 --history 1000 --success --jsonl`
      — zero erro desde o deploy
- [ ] Nenhuma função de envio, `demo:*` ou Asaas de escrita nos logs

## 8. Smoke test — só leitura

Landing · `/login` · `/dashboard` · `/eventos` · um evento existente e as
subtelas (`orcamento`, `fotos`, `projeto`, `ficha-tecnica`, `fornecedores`) ·
`/agenda` · `/fornecedores` · `/equipe` · `/acervo` · `/catalogo` · `/compras` ·
`/financeiro` (o card "A receber" tem de fechar com a lista) · `/funil` ·
`/propostas` · `/campanha` · `/assistente` · `/escritorio` · `/admin` ·
`/central` (tem de dizer "Envio externo DESLIGADO") · `/configuracoes`.

Console sem erro em todas. Não clicar em nada que envie, cobre ou apague. No
`/campanha`, "Rodar agora" só grava rascunho interno — ainda assim, não é
passo de homologação.

---

## 9. Registro de releases

### 28/09/2026 — `4292056`

| | Antes | Depois |
|---|---|---|
| `main` | `9467718` | `4292056` (fast-forward) |
| Frontend oficial | `b94c29a`, de `claude/altar-project-analysis-ah81bt`, promovido à mão em 09/09 | `4292056`, da `main`, deployment `2PJUjjWyBCq1ZNWLYMnU4S9uWMqh` |
| Convex PROD | funções de `a184412` | `4292056` (245 funções públicas, idênticas ao código) |

- Schema: aditivo — 16 tabelas, 29 campos (todos opcionais), 14 índices;
  nenhuma remoção, nenhum estreitamento. Sem migração.
- Variáveis ausentes em PROD, todas falhando fechado:
  `ALTAR_CENTRAL_ENVIO_HABILITADO` (envio desligado),
  `ALTAR_OFFICE_API_TOKEN` e `ALTAR_OFFICE_CENTRAL_TOKEN` (pontes respondem
  503), `ALTAR_WHATSAPP_PROVIDER` e `ALTAR_VERTICAL` (padrão; o webhook recusa
  enquanto o canal não está configurado).
- Cron novo `adminApprovals.varreduraDiaria` (04:30 BRT): só expira aprovação
  pendente da tabela nova — vazia em PROD.
- **Pendente de decisão humana:** nenhuma conta tem `platformOwner` em PROD
  (campo novo, sem backfill), então `/escritorio` redireciona todo mundo. É a
  trava funcionando. Para conceder, no painel do Convex de PROD:
  `internal.admin.grantPlatformOwnerByEmail { "email": "<conta do dono>" }`.
