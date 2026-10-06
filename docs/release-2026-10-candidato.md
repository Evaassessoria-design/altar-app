# Release candidato de outubro/2026 — pre-live + Funil + Pagamentos

Preparado em 06/10/2026. **Nada publicado.** Este documento é o pedido de
aprovação: o que entra, o que foi verificado, o que falta decidir, a ordem e
a volta. O procedimento geral continua em `docs/release-producao.md`.

## 1. O que está no ar (inspeção só de leitura, 06/10/2026)

| Peça | No ar |
|---|---|
| Vercel `altar-app-sg8v` | Production = `50926a8` (hotfix de upload), `index-BjmNlhb2.css` |
| Convex PROD `mellow-goose-539` | 245 funções = código de `50926a8`; `function-spec` idêntico ao do deploy do hotfix |

## 2. O candidato

Branch `release/2026-10-candidato` = `feature/pagamentos-evento@b6e64bd` + este
documento. Contém **41 commits que a produção não tem**:

| Área | O que muda para quem usa |
|---|---|
| Pre-live — Acervo | segunda-feira pós-evento (o que não voltou, conserto, impacto), condição das peças (limpeza, reparo, indisponível, conferência), conferência de retorno em lote, reservas e logística; "28 prontas" deixa de contar peças na fazenda |
| Pre-live — Evento | Saúde no topo, Jornada do Projeto e Operação; o galpão registra ocorrência |
| Pre-live — Assistente | volta a ver dinheiro vencido; o agente do acervo vê o que não voltou, reparo e disponibilidade |
| Pre-live — Escritório | **cron diário 07:30 (Brasília)** que roda o ciclo sozinho; centro de comando; queda da IA visível ao dono; **funções do Escritório passam de `requireAdmin` para `requirePlatformOwner`** |
| Pre-live — Campanha | descadastro respeitado em todas as portas (`admin.definirDescadastro`), prioridade explicada e próxima ação |
| Pre-live — Demo | `prepararConta` e pós-evento na demo (internas, travadas por `ALTAR_DEMO`, ausente em PROD) |
| Pre-live — UX/Saúde | nenhum erro em inglês ou com nome interno; saúde não chama 85% de "quase lá" com contrato faltando |
| Upload 100 MB | **idêntico** ao que está no ar (arquivos de upload sem diferença com `50926a8`) |
| Funil | visão em quatro grupos, card que não vaza, "Abrir lead", seletor no celular |
| Pagamentos da cliente | aba do evento, valor contratado, recebimento parcial/múltiplo com histórico e anulação, planejamento com prévia, fuso do negócio para dinheiro, lixeira travada em parcela com recebimentos |

**Fora:** `feature/office-core-whatsapp` (`0e59847`) e o Escritório da `main`
(`86dc253`) — conferido: nenhum dos dois é ancestral do candidato.

128 arquivos, +13.920 / −1.019 em relação a `50926a8`.

## 3. Verificações

| Verificação | Resultado |
|---|---|
| Testes, typechecks, lint, build | **5877/5877**; typechecks, lint (0 erros, 8 avisos de sempre) e build verdes |
| Schema × registros antigos | só campos **opcionais** novos e valores **acrescentados** a uniões; nenhuma tabela, índice ou campo obrigatório novo; nada removido |
| Funções | 0 removidas; 13 novas; 1 com argumento novo **opcional** (`admin.listLandingLeads`); nenhum retorno declarado mudou |
| Autenticação | `auth.ts`, `auth.config.ts`, `http.ts`, `lib/identity.ts`, `lib/accessGuard.ts`, `lib/adminGuard.ts` **sem nenhuma diferença** |
| Permissões | Escritório só **endurece** (admin → platformOwner); Campanhas iguais à produção |
| Variáveis de ambiente | nenhuma variável nova lida pelo código; PROD sem `ALTAR_DEMO` (só nomes listados, sem valores) |
| Dependências | `package.json`, lockfile, `convex.json`, `vite.config.ts` iguais |
| Recebimentos e histórico | 31 testes de banco + validação pela interface no DEV |
| Fuso da empresa | testado em 23:59, 00:00 e 21:30 de Brasília, virada de mês e ano, Manaus |
| Dry-run contra os dados de PROD | **não executado** nesta preparação (pedido: só leitura). É o passo 2 da publicação. |

## 4. O que impede a publicação (decisão sua)

1. **Aprovar o pacote da pre-live inteiro**, e não só Funil e Pagamentos.
2. **O cron do Escritório em PROD.** Todo dia às 07:30 ele lê os interessados
   reais da campanha `live-altar-2026-10-06` (enquanto ela estiver na janela)
   e, com a política não configurada, as capacidades verdes vêm **ligadas**:
   grava rascunhos em `campaignDrafts` e um registro em `escritorioExecucoes`.
   **Não envia nada** (envio é amarelo, desligado, e PROD não tem canal).
   Escolha: manter, ou desligar o cron nesta release (uma linha em
   `convex/crons.ts`, novo commit e nova bateria).
3. **Quem é dono da plataforma em PROD.** Com o endurecimento, nenhum admin
   acessa os controles do Escritório até `platformOwner` ser concedido — e
   conceder é alteração de dado em PROD, fora desta preparação.

## 5. O que pode ficar para depois

- Teste em PROD do upload com **documento válido** grande e do teto de 100 MB
  (hoje comprovado só envio > 1 MB, com um `.exe`).
- Plano e cota do Convex (storage PROD em 0,408 GB em 06/10).
- Formato livre nos documentos do Funil (o `.exe` entrou) — decisão de produto.
- O valor total lido do contrato por IA ainda não preenche o valor contratado.
- Merge na `main` depois do release, com aprovação (a `main` tem o Escritório
  `86dc253`, que não está no ar).

## 6. Ordem de publicação

**Backend primeiro.** O frontend que está no ar funciona com o backend novo
(nenhuma função removida, argumentos compatíveis). O inverso quebra: o
frontend novo chama funções que o backend antigo não tem.

```bash
# 0. Cópia limpa do candidato, fora da pasta de trabalho
git fetch origin && git worktree add ../altar-candidato origin/release/2026-10-candidato
cd ../altar-candidato   # node_modules próprio: npx pnpm install --frozen-lockfile
printf 'CONVEX_DEPLOYMENT=prod:mellow-goose-539\n' > ../prod.env

# 1. Prova de alvo (só leitura)
npx convex function-spec --env-file ../prod.env > ../a.json
npx convex function-spec --deployment mellow-goose-539 > ../b.json
cmp ../a.json ../b.json

# 2. Dry-run — SEM -v (o -v imprime os VALORES das variáveis de ambiente)
npx convex deploy --env-file ../prod.env --dry-run
#    tem de dizer "No indexes are deleted" e "Schema validation complete"
#    A linha "Change the server's version for Node.js actions" aparece também
#    com o código que já está no ar — não vem deste release.

# 3. Backend
npx convex deploy --env-file ../prod.env --message "release <SHA do candidato> (release/2026-10-candidato)"

# 4. Conferir: 258 funções, as do candidato
npx convex function-spec --deployment mellow-goose-539
```

5. **Vercel (clique humano)**: copiar a URL do Production atual (é a volta);
   promover o Preview de `release/2026-10-candidato` no SHA aprovado;
   esperar Ready.
6. **Prova do frontend**: `curl -s https://www.appaltar.com.br/ | grep -oE
   '/assets/index-[A-Za-z0-9_-]+\.css'` tem de devolver **`index-A5biLRQl.css`**
   (build do candidato com as variáveis de PROD, 06/10). Hoje: `index-BjmNlhb2.css`.

## 7. Verificações depois de publicar

- Logs de PROD sem falhas nas primeiras horas (`npx convex logs --deployment
  mellow-goose-539 --history 100`, sem `--success` se não precisar do tráfego).
- Com **conta de teste**: Funil abre na visão resumida; um evento de teste
  abre "Pagamentos da cliente"; definir valor contratado, planejar 2 parcelas,
  registrar um recebimento parcial, anular, conferir o Financeiro.
- Dashboard: "Venceu e não foi liquidado" coerente com a aba.
- No dia seguinte às 07:30: a rodada do Escritório (se mantido) aparece em
  `escritorioExecucoes` e **nenhuma** mensagem saiu.

## 8. Reversão — o que volta e o que não volta

**Frontend:** promover de volta o deployment Production anterior (o de
`50926a8`). Seguro a qualquer momento: o frontend antigo funciona com o
backend novo.

**Backend — o `50926a8` puro NÃO volta.** Provado no DEV: depois de existir
um registro com campo novo, o Convex recusou o schema antigo ("Object
contains extra field `contractedValue`"). Isso vale para recebimentos,
valor contratado, descadastro e condição do acervo.

**A volta do backend é `release/reversao-2026-10` (`1c5f33c`)**: o código de
`50926a8` com o schema do candidato. Publicada no DEV por cima dos registros
novos: aceita, 245 funções. Ordem da volta: **frontend antes, backend
depois** (o frontend novo precisa do backend novo).

O que a volta **não** desfaz, e o que fica pior com ela:
- Os registros novos **continuam no banco**; o código antigo só não os lê.
- Recebimento parcial some da conta: o Financeiro antigo volta a somar só
  parcela com `isPaid`, e a parcela parcial aparece como pendente inteira.
- A baixa manual antiga (`togglePaid`) volta a funcionar em parcela com
  recebimentos — usá-la nesse período desencontra `isPaid` do histórico.
- Peças em reparo, limpeza ou conferência voltam a contar como disponíveis
  no acervo antigo.
- O Escritório volta a aceitar admin, e o cron diário deixa de existir.
- Valor contratado e descadastro ficam guardados, sem efeito.

Voltando a publicar o candidato, tudo isso reaparece como estava — nada é
apagado na ida nem na volta.
