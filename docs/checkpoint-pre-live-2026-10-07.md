# Checkpoint pré-live — 07/10/2026 (noite)

## Onde está

| O quê | Estado |
|---|---|
| Repositório | `Evaassessoria-design/altar-app`, PC da Eva (`DESKTOP-455PHHR`) |
| PROD (backend + frontend) | `5ec2c4cbbd9ba805ff51026423059d194f18f66a` — publicado em 07/10 (backend 17:42 UTC; frontend promovido pela Eva, CSS `index-Caiq6i9x.css`) |
| Branch de trabalho | `feature/parcelas-acessiveis`, a partir do `5ec2c4c` — **só no DEV** |
| `main` | `86dc253` — sem merge |
| Cron do Escritório | desligado |

O SHA final da branch é o do commit que traz este arquivo (ver `git log -1`
em `feature/parcelas-acessiveis`); o ajuste em si é o commit `3e941ac`.

## O que mudou nesta rodada (só no DEV)

**Parcelas sempre acessíveis** (`3e941ac`). Diagnóstico do que a Eva viu em
PROD: quitada, a parcela perdia o "Registrar recebimento" e ficava só com um
texto cinza "Histórico (n)" que expandia dentro do card; editar valor ou
vencimento não existia na aba do evento; no Financeiro a linha não abria.

- Card da parcela (aba do evento) e texto da linha (Financeiro) abrem os
  **Detalhes da parcela**, em qualquer estado, por clique e teclado
  (Enter/Espaço), com foco visível.
- Detalhes: valor, vencimento, recebido, saldo, histórico (anulados riscados
  com motivo), comprovantes com link, e ações com nome claro — Registrar
  recebimento (só com saldo), Editar valor e vencimento, Anexar comprovante /
  outro comprovante, **Corrigir (anular e registrar de novo)**, Anular.
- Corrigir: anula com motivo e abre o registro do valor certo já preenchido.
  Recebimento não se edita — o histórico fica.
- Editar: não deixa o valor abaixo do recebido; mudar o valor recalcula a baixa.
- O mesmo fluxo (`FluxoDaParcela`) na aba e no Financeiro, sempre com a
  parcela atual.
- Diálogos no celular passam a deixar margem lateral (componente base).
- **Sem mudança de backend**: as regras são as mutations existentes.

## Verificações

- 5.956/5.956 testes; `tsc` do app e do Convex; `tsc -b`; lint (0 erros, os 8
  avisos antigos); build. Rodada final feita depois da última mudança de código.
- Teste novo `convex/parcelas-acessiveis.test.ts`: o caso concreto
  (100 → 40 → 60 → quitada → comprovante no anterior → anula → recalcula),
  correção sem duplicar, edição abaixo do recebido recusada, isolamento entre contas.
- Testes de tela atualizados: parcela abre em qualquer estado e pelo teclado;
  as duas telas usam o mesmo fluxo.

## Validado no navegador (DEV, conta de teste, dados fictícios)

- Caso concreto inteiro na aba do evento: R$ 100 → R$ 40 (parcial, saldo 60)
  → R$ 60 (quitada, sem "Registrar recebimento", detalhes abertos) → card
  aberto pelo **Enter** → comprovante no recebimento de R$ 40 ("o valor não
  mudou") → anulação do de R$ 60 (parcial, saldo 60, riscado com motivo).
- Corrigir: anulou o de R$ 40 e abriu "Registrar o valor certo" com 40/data/PIX;
  registrado 45 → histórico com 45 ativo e 60/40 anulados.
- Editar: R$ 30 recusado na tela ("Já foram recebidos R$ 45…", Salvar
  desativado); R$ 120 e vencimento 15/10 salvos, saldo 75.
- Financeiro: a mesma parcela aberta pelo texto da linha, com os mesmos
  detalhes; parcela quitada ("Entrada") abre; despesa abre o diálogo de
  pagamento e comprovantes.
- Receita do Mês = destino: R$ 1.245 (45 + 1.200), anulados fora.
- Funil: lista e detalhe do lead com ações claras.
- Largura de celular (390 px, **simulação no navegador do PC, não aparelho
  real**): aba e detalhes sem rolagem lateral, diálogo com margem.

## Pendências e limitações

- **Teste completo de pagamentos e comprovantes em PROD: em andamento com a
  Eva — NÃO concluído.**
- Parcelas acessíveis estão só no DEV: publicar exige autorização (só
  frontend muda; o backend do `5ec2c4c` já serve).
- Gráfico de meses do Financeiro parte dos 500 lançamentos mais recentes; um
  recebimento novo numa parcela muito antiga pode ficar fora dele (o card do
  Início não tem esse limite).
- Receita do Mês lê todas as receitas da conta: para contas muito grandes
  vai precisar de índice próprio.
- Bloqueio do Assistente para conta sem acesso: coberto por teste, não pelo
  navegador.
- Celular real não validado.
- Cota do Convex (aviso do plano Free): conferir em
  https://dashboard.convex.dev/t/evadelbiancoassessoria/settings/usage.
- Dados de teste no DEV: evento "TESTE Atalhos" com a "Parcela 1/1" e a peça
  "TESTE Castiçal dourado".

## Próximos passos

1. Eva termina o teste de pagamentos em PROD (roteiro passo a passo na conversa).
2. Revisar `feature/parcelas-acessiveis`; se aprovado, publicar o **frontend**
   (o backend não muda) e conferir o CSS novo no site.
3. Ensaiar a live com `docs/roteiro-live-2026-10-08.md` e preparar a conta de
   demonstração pelo checklist do fim do roteiro.
