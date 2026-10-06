# Release candidato de outubro/2026 — pre-live + Funil + Pagamentos

Preparado em 06/10/2026. **Nada publicado.** Este documento é o pedido de
aprovação: o que entra, o que foi verificado, o que falta decidir, a ordem e
a volta. O procedimento geral continua em `docs/release-producao.md`.

O commit exato do código está no fim deste documento (seção 9).

## 1. O que está no ar (inspeção só de leitura, 06/10/2026)

| Peça | No ar |
|---|---|
| Vercel `altar-app-sg8v` | Production = `50926a8` (hotfix de upload), `index-BjmNlhb2.css` |
| Convex PROD `mellow-goose-539` | 245 funções = código de `50926a8`; `function-spec` idêntico ao do deploy do hotfix |
| Crons em PROD | `generate daily notifications`, `conferir assinaturas no asaas`, `varredura da central de comunicacoes` |

## 2. O candidato — escopo completo

Branch `release/2026-10-candidato`. Em relação à produção são **43 commits**:
os 41 de `feature/pagamentos-evento@b6e64bd` (que inclui a pre-live inteira)
e os 2 desta preparação final (cron desligado + este documento).

| Área | O que muda para quem usa |
|---|---|
| Pre-live — Acervo | segunda-feira pós-evento (o que não voltou, conserto, impacto), condição das peças (limpeza, reparo, indisponível, conferência), conferência de retorno em lote, reservas e logística; "28 prontas" deixa de contar peças na fazenda |
| Pre-live — Evento | Saúde no topo, Jornada do Projeto e Operação; o galpão registra ocorrência |
| Pre-live — Assistente | volta a ver dinheiro vencido; o agente do acervo vê o que não voltou, reparo e disponibilidade |
| Pre-live — Escritório | centro de comando; queda da IA visível ao dono; **todas as funções do Escritório passam a exigir `requirePlatformOwner`** (antes: `requireAdmin`); **rodada automática diária DESLIGADA** neste release (seção 4) |
| Pre-live — Campanha | descadastro respeitado em todas as portas (`admin.definirDescadastro`, admin), prioridade explicada e próxima ação |
| Pre-live — Demo | `prepararConta` e pós-evento na demo — internas, travadas por `ALTAR_DEMO`, ausente em PROD |
| Pre-live — UX/Saúde | nenhum erro em inglês ou com nome interno; saúde não chama 85% de "quase lá" com contrato faltando |
| Upload 100 MB | **idêntico** ao que está no ar (arquivos de upload sem diferença com `50926a8`) |
| Funil | visão em quatro grupos, card que não vaza, "Abrir lead", seletor no celular |
| Pagamentos da cliente | aba do evento, valor contratado, recebimento parcial/múltiplo com histórico e anulação, planejamento com prévia, fuso do negócio para dinheiro, lixeira travada em parcela com recebimentos |
| Ferramenta de release | `scripts/release/primeiro-uso.mjs` — critério da reversão (seção 8), só leitura |

**Fora:** `feature/office-core-whatsapp` (`0e59847`) e o Escritório da `main`
(`86dc253`) — conferido: nenhum dos dois é ancestral do candidato.

## 3. Verificações

| Verificação | Resultado |
|---|---|
| Testes, typechecks, lint, build | ver seção 9 |
| Schema × registros antigos | só campos **opcionais** novos e valores **acrescentados** a uniões; nenhuma tabela, índice ou campo obrigatório novo; nada removido |
| Funções | 0 removidas; 13 novas; 1 com argumento novo **opcional** (`admin.listLandingLeads`); nenhum retorno declarado mudou |
| Crons em execução | os **mesmos 3** da produção; o do Escritório não é registrado (teste `escritorio.rodada.test.ts`) |
| Autenticação | `auth.ts`, `auth.config.ts`, `http.ts`, `lib/identity.ts`, `lib/accessGuard.ts`, `lib/adminGuard.ts` **sem nenhuma diferença** |
| Permissões | Escritório só **endurece** (admin → platformOwner); Campanhas iguais à produção |
| `platformOwner` | nenhum código atribui sozinho; a única escrita é `internal.admin.grantPlatformOwnerByEmail`, já em PROD, manual, por e-mail |
| Variáveis de ambiente | nenhuma nova lida pelo código; PROD sem `ALTAR_DEMO` (só nomes listados, sem valores) |
| Dependências | `package.json`, lockfile, `convex.json`, `vite.config.ts` iguais |
| Recebimentos e histórico | 31 testes de banco + validação pela interface no DEV |
| Fuso da empresa | testado em 23:59, 00:00 e 21:30 de Brasília, virada de mês e ano, Manaus |
| Dry-run contra os dados de PROD | **não executado** nesta preparação (pedido: só leitura). É o passo 2 da publicação. |

## 4. Decisões já tomadas nesta preparação

- **Rodada automática do Escritório: desligada.** Uma chave só,
  `RODADA_AUTOMATICA_LIGADA = false` (`convex/lib/escritorio/rodadaAutomatica.ts`),
  controla o agendamento (`convex/crons.ts`), a frase da tela do Escritório e
  o aviso do relatório — nenhuma tela promete rodada diária. O ciclo manual
  ("Rodar agora") continua, só para `platformOwner`.
- **Escritório exclusivo para `platformOwner`. Ninguém recebe o papel
  automaticamente.** Hoje ninguém o tem em PROD, então depois do release
  ninguém — nem admin — acessa os controles do Escritório até a concessão
  manual. Conceder é alteração de dado em PROD e fica fora deste release.

## 5. O que ainda pede sua decisão

1. **Aprovar o pacote da pre-live inteiro**, e não só Funil e Pagamentos.
2. **Aceitar a estratégia de reversão da seção 8**, que NÃO inclui voltar o
   backend depois do primeiro uso real.

## 6. O que pode ficar para depois

- Teste em PROD do upload com **documento válido** grande e do teto de 100 MB
  (hoje comprovado só envio > 1 MB, com um `.exe`).
- Plano e cota do Convex (storage PROD em 0,408 GB em 06/10).
- Formato livre nos documentos do Funil (o `.exe` entrou) — decisão de produto.
- O valor total lido do contrato por IA ainda não preenche o valor contratado.
- Conceder `platformOwner` a quem deve operar o Escritório.
- Merge na `main` depois do release, com aprovação (a `main` tem o Escritório
  `86dc253`, que não está no ar).

## 7. Ordem de publicação e testes depois de publicar

**Backend primeiro.** O frontend que está no ar funciona com o backend novo
(nenhuma função removida, argumentos compatíveis). O inverso quebra: o
frontend novo chama funções que o backend antigo não tem.

```bash
# 0. Cópia limpa do candidato, fora da pasta de trabalho
git fetch origin && git worktree add ../altar-candidato <SHA da seção 9>
cd ../altar-candidato   # node_modules próprio: npx pnpm install --frozen-lockfile
printf 'CONVEX_DEPLOYMENT=prod:mellow-goose-539\n' > ../prod.env

# 1. Linha de base, só leitura: TUDO ZERO antes de publicar
node scripts/release/primeiro-uso.mjs mellow-goose-539

# 2. Prova de alvo (só leitura)
npx convex function-spec --env-file ../prod.env > ../a.json
npx convex function-spec --deployment mellow-goose-539 > ../b.json
cmp ../a.json ../b.json

# 3. Dry-run — SEM -v (o -v imprime os VALORES das variáveis de ambiente)
npx convex deploy --env-file ../prod.env --dry-run
#    tem de dizer "No indexes are deleted" e "Schema validation complete".
#    "Change the server's version for Node.js actions" aparece também com o
#    código que já está no ar — não vem deste release.

# 4. Backend
npx convex deploy --env-file ../prod.env --message "release <SHA> (release/2026-10-candidato)"

# 5. Conferir: 258 funções, as do candidato
npx convex function-spec --deployment mellow-goose-539
```

6. **Vercel (clique humano)**: copiar a URL do Production atual (é a volta
   do frontend); promover o Preview de `release/2026-10-candidato` no SHA da
   seção 9; esperar Ready.
7. **Prova do frontend**: o CSS de `www.appaltar.com.br` tem de ser o da seção 9.

**Testes depois de publicar**

- Logs de PROD sem falhas na primeira hora
  (`npx convex logs --deployment mellow-goose-539 --history 100`).
- Com **conta de teste** e **evento de teste**: Funil abre na visão resumida;
  "Pagamentos da cliente" abre; definir valor contratado; planejar 2
  parcelas; registrar um recebimento parcial; anular; conferir que o
  Financeiro mostra "Parcial · falta R$ X" e trava a lixeira; o Dashboard
  mostra o vencido coerente com a aba.
- Upload: um PDF ou DOCX de 30 a 100 MB no lead de teste (anexar, abrir,
  recarregar) — fecha a pendência do hotfix.
- **Cron desligado**: no dia seguinte, depois das 07:30 de Brasília,
  `escritorioExecucoes` não ganhou nenhuma linha com `disparadoPor: "sistema"`.
- Escritório: uma conta admin sem `platformOwner` não abre os controles.

**Importante:** esses testes com conta de teste já são "uso real" para o
critério da seção 8 — depois deles, o verificador de primeiro uso deixa de
dar zero. Rode-os só depois de aceitar a estratégia de reversão.

## 8. Reversão — o que é seguro, o que não é, e o caminho de correção

### 8.1 O frontend volta a qualquer momento — e as regras ficam

Voltar o frontend = promover de novo o Production anterior (o de `50926a8`).
As regras novas moram no **backend**, que continua o novo:

| Regra | Com o frontend antigo + backend novo (provado no DEV, 06/10) |
|---|---|
| Recebimento parcial conta | Financeiro antigo mostrou Receitas R$ 2.200 / A receber R$ 7.800 — o backend novo calcula |
| Baixa manual em parcela com recebimentos | **recusada** pelo servidor; `isPaid` e `paidAt` intactos (lidos depois) |
| Exclusão de parcela com recebimentos | **recusada**; a parcela continua |
| Disponibilidade do acervo | calculada no backend novo (reparo/limpeza/conferência fora) |
| Escritório | continua só `platformOwner` |

O que piora com o frontend antigo: a aba "Pagamentos da cliente" some (não
dá para registrar recebimento até o frontend novo voltar), e as recusas
aparecem como erro genérico ou silêncio — o servidor protege, mas a tela
antiga não explica.

### 8.2 O backend NÃO volta depois do primeiro uso real

"O Convex aceita o schema" não é "a reversão é segura":

- `50926a8` **puro** é **recusado** pelo Convex assim que existe um registro
  com campo novo (provado no DEV: "Object contains extra field `contractedValue`").
- `release/reversao-2026-10` (`50926a8` + schema do candidato) é **aceita** —
  e é **insegura**: ignora recebimentos parciais, volta a permitir baixa e
  exclusão em parcela com recebimentos (desencontrando ou apagando o
  histórico), conta peças em reparo como disponíveis e deixa sem efeito o
  descadastro. **Não deve ser publicada** — a própria branch carrega esse
  aviso (`NAO-PUBLICAR-ESTA-BRANCH.md`).

### 8.3 A estratégia

```
Problema depois de publicar
│
├─ é de TELA? ─────────────► voltar o FRONTEND (8.1). Seguro sempre.
│
└─ é de BACKEND?
   │
   ├─ node scripts/release/primeiro-uso.mjs mellow-goose-539
   │
   ├─ tudo ZERO ───────────► ninguém usou as novidades: o 50926a8 PURO volta
   │                          (frontend primeiro, backend depois). Nada se perde.
   │
   └─ algum > 0 ───────────► NÃO voltar o backend. Voltar o frontend se a tela
                              atrapalhar, e CORRIGIR PARA A FRENTE:
                              branch a partir do SHA publicado → correção
                              mínima → bateria completa → dry-run → deploy.
```

O caminho de correção é sempre para a frente, a partir do código publicado,
porque é o único que conhece as regras dos registros que já existem. Um
backend "de reversão" que preservasse essas regras teria de reimplementar
exatamente o que o candidato já implementa.

## 9. O candidato exato

Ver o commit seguinte a este documento: ele registra o SHA do código, o
resultado da bateria e o CSS esperado.
