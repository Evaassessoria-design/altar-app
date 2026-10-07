# Pagamentos da cliente — a aba do evento

Rodada de 06/10/2026. Branch `feature/pagamentos-evento` (base: Funil `dda47d1`).

## O que é

Uma aba do evento (`/eventos/:id/pagamentos`) com **só** o que a cliente paga à
decoradora: valor contratado, recebido, saldo, vencido, próxima parcela, as
parcelas, os recebimentos e os comprovantes. A página do evento mostra um
cartão compacto com o resumo e o atalho.

Não entram: despesas, pagamentos a fornecedores, custos do evento, assinatura
do ALTAR. Não há gateway, cobrança enviada nem dinheiro movimentado.

## Não é um segundo financeiro

| Peça | Onde mora |
|---|---|
| Parcela | a mesma linha de `transactions` (receita do evento) de sempre |
| Recebimento | `transactions.recebimentos` — lista dentro da parcela, como os comprovantes |
| Comprovante | `transactions.comprovantes`, a lista que já existia |
| Valor contratado | `events.contractedValue` — novo, opcional; ausente = "não definido" |
| Regra (centavos, estados, atraso) | `convex/lib/pagamentosDoEvento.ts`, usada pelo servidor e pela tela |

A aba e o Financeiro geral leem as **mesmas linhas**: o total de receitas do
Financeiro, o "recebido / lançado" do Resumo operacional e o vencido do
Dashboard passaram a contar o recebimento parcial.

## Regras

- **Centavos.** Toda conta é em centavos inteiros; o arredondamento do
  parcelamento é distribuído (10.000 em 3 = 3.333,34 + 3.333,33 + 3.333,33).
- **Parcela antiga** (sem `recebimentos`) mantém o significado: `isPaid`
  vale o valor inteiro. Nenhum dado existente muda.
- **Com recebimentos, `isPaid`/`paidAt` são derivados** (`baixaDerivada`).
  Por isso `togglePaid`, a baixa de `registrarPagamento` e `isPaid` em
  `updateTransaction` recusam essas parcelas; forma e observação continuam
  editáveis. O valor da parcela não desce abaixo do já recebido.
- **Acima do saldo é recusado.** Registra-se no máximo o saldo. A parcela e o
  contratado não são aumentados para acomodar um pagamento maior: eles só
  mudam quando o acordo com a cliente muda de fato.
- **Anexar comprovante não dá baixa.**
- **Correção = anular com motivo.** O recebimento anulado fica no histórico,
  riscado, e deixa de contar. Parcela com recebimentos não pode ser excluída.
- **Envio repetido não duplica.** Recebimento e planejamento levam uma chave
  gerada ao abrir o formulário; reenviar depois de uma resposta perdida usa a
  mesma chave, e o servidor devolve o que já gravou. Salvar de novo a MESMA
  prévia por outro formulário também não duplica: se toda parcela pedida já
  existe (descrição, valor e vencimento), nada é criado.
- **Planejar só acrescenta** parcelas novas; não recria nem altera as que
  existem.
- **Atraso** = saldo > 0 e vencimento antes de hoje, inclusive na parcela
  parcialmente recebida. "Hoje" é o dia no **fuso do negócio**
  (`dataDoDiaNoFuso`): o escolhido em Configurações (`users.timezone`),
  padrão America/Sao_Paulo. A aba, o cartão do evento, o vencido e a receita
  do mês do Dashboard e o gráfico de meses do Financeiro usam o mesmo dia —
  nem o do aparelho, nem a virada do UTC às 21h. Agenda e contagem de eventos
  continuam em `dataDoDia` (UTC): não são dinheiro e não entraram na decisão.

## No Financeiro geral

A receita de evento tem no Financeiro geral as MESMAS operações da aba, com os
mesmos componentes (`src/components/financeiro/recebimentos.tsx`):
Registrar recebimento, Histórico, Anular e Anexar comprovante a um recebimento
já registrado. Um recebimento feito numa tela é a mesma linha na outra.

- Receita de evento só se baixa por recebimento. "Já recebido", a baixa rápida,
  a edição e `registrarPagamento` não marcam paga à mão
  (`exigirBaixaPorRecebimento`); no Novo lançamento, uma receita de evento
  "já recebida" vira um recebimento de verdade. Desmarcar uma baixa antiga, sem
  recebimentos, continua possível.
- Despesa e receita avulsa seguem com a baixa de sempre.
- Anexo no Novo lançamento, para receita e despesa: com "Já pago/recebido" o
  rótulo é "Comprovante (opcional)"; pendente, é "Documento/anexo (opcional)",
  e anexar não muda a situação.
- Comprovante depois (`anexarComprovanteAoRecebimento`) não mexe em valor,
  saldo, baixa nem histórico. Recebimento anulado não recebe comprovante.
- O Novo lançamento tem chave por abertura: o reenvio não cria duas linhas, e a
  falha deixa o formulário preenchido.

## Limites conhecidos

- A leitura do contrato por IA extrai o "Valor total", mas ainda não preenche
  o valor contratado — ele é definido na aba.
- Recebimento de valor maior que o saldo não vira crédito; é recusado.
