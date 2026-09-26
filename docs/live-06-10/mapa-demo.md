# Mapa da demonstração — onde cada número mora

Para quando alguém na plateia perguntar "de onde saiu esse valor?" e para
quando uma tela abrir diferente do esperado e for preciso saber, em três
segundos, se aquilo é defeito ou é o dado.

Conferido em `26/09/2026`, lendo o banco depois de rodar
`internal.demo.seed` — não de memória.

---

## A regra que este arquivo existe para provar

**Os números conversam.** Se o Dashboard diz X, o detalhe justifica X. Evento
realizado não tem cobrança em aberto. Compra recebida não aparece pendente.
Nada foi pago no futuro.

Quem cobra isso a cada `pnpm test`: `convex/demo.coerencia.test.ts`.

---

## As datas são RELATIVAS — e por quê

Os doze eventos de contorno nascem com deslocamento em dias a partir de hoje
(`emDias` em `convex/lib/demoPortfolio.ts`). Um seed com datas fixas envelhece:
o evento "da semana que vem" viraria passado no primeiro ensaio de novembro, e
a demonstração passaria a mostrar uma empresa que parou de trabalhar.

**A exceção é Marina & Gabriel: 10/10/2026, fixa**, porque o roteiro cita a
data e ela precisa cair quatro dias depois da live.

> Consequência no dia 06/10: Marina & Gabriel será o **evento mais próximo**,
> a quatro dias. É exatamente o que o bloco 1 precisa.

---

## Os treze eventos

Valores em reais. A coluna "quando" é o deslocamento a partir do dia em que o
seed rodar.

| Quando | Situação | Evento | Orçamento | Receita lançada | Despesa |
|---|---|---|---|---|---|
| −62 d | realizado | Casamento Helena & Rui | 142.000 | 142.000 | 49.900 |
| −34 d | realizado | 15 anos da Antonella | 68.000 | 68.000 | 19.600 |
| −18 d | realizado | Confraternização Vitrine Digital | 43.500 | 43.500 | 19.000 |
| −5 d | em andamento | Casamento Rafaela & Ian | 128.000 | 128.000 | 5.400 |
| +6 d | confirmado | Corporativo Nexo — Convenção Anual | 96.000 | 96.000 | 22.000 |
| **10/10 fixa** | **confirmado** | **Marina & Gabriel** | **186.500** | **186.500** | **98.200** |
| +21 d | confirmado | Casamento Sofia & Tomás | 118.000 | 82.600 | 9.800 |
| +30 d | confirmado | Batizado do Bento | 18.900 | 18.900 | 3.200 |
| +38 d | confirmado | Bodas de Prata — Célia & Amaro | 52.000 | 52.000 | — |
| +47 d | planejamento | Aniversário de 50 anos — Beatriz | 38.500 | 15.400 | — |
| +55 d | planejamento | Lançamento Coleção Aurora — Lume | 74.000 | 29.600 | — |
| +78 d | planejamento | Casamento Júlia & Enzo | 165.000 | 66.000 | — |
| +96 d | planejamento | 15 anos da Manuela | 71.000 | — | — |

Seis tipos diferentes: casamento, debutante, corporativo, aniversário,
batizado e "outro" (bodas). Uma demonstração só de noivos ensina o público
errado sobre o que o produto atende.

---

## O Financeiro, fechado

| Linha | Valor |
|---|---|
| Receita lançada, todos os eventos | **928.500** |
| Já recebido | **674.800** |
| A receber | **253.700** |
| Despesa lançada | **227.100** |

Nenhum evento da demonstração fecha no prejuízo, e nenhuma receita passa do
orçamento do evento — as duas coisas são cobradas por teste.

---

## O que está VERMELHO, e de propósito

Se estas três linhas não aparecerem, o painel de atenção abre calado e o
bloco 1 do roteiro perde o argumento.

| O quê | Onde aparece | Valor |
|---|---|---|
| **Segunda parcela** de Sofia & Tomás, vencida há 9 dias | Financeiro · Dashboard · Assistente | 35.400 |
| **Sinal** da Lume, vencido há 2 dias | Financeiro · Dashboard · Assistente | 29.600 |
| **Flores de Aurora — saldo do pedido**, despesa vencida (Marina & Gabriel) | Financeiro · Dashboard | 17.000 |
| **Tecido para backdrop do palco**, compra com prazo vencido (Nexo) | Compras | 60 m × 38,00 |

> A cobrança vencida **não** é de Marina & Gabriel. É deliberado: o clímax da
> apresentação abre o evento dela, e a narrativa depende de a cliente do evento
> principal ter pago em dia. A tensão de dinheiro mora nos eventos de contorno.

---

## O que só existe em Marina & Gabriel

O evento herói é o único com profundidade. Os doze de contorno são rasos de
propósito — existem para os painéis terem o que somar, não para serem abertos.
A live abre um evento, não doze.

- Briefing completo (oito áreas), com 180 convidados em três lugares
  diferentes que precisam bater
- Itens de montagem por ambiente, com ficha técnica e flores
- Fornecedores no catálogo **e** vinculados ao evento, em estágios diferentes
- Acervo, reservas e ajustes
- Orçamento item a item, que soma exatamente os 186.500 do evento
- O lead no funil, em `contracted`, apontando para o evento
- A proposta aceita

**Se você abrir um evento de contorno ao vivo, ele estará quase vazio.** Não é
defeito; é o desenho. Abra Marina & Gabriel.

---

## O que o seed NÃO cria

**Nenhuma foto, nenhum contrato, nenhuma planta.** São subidos à mão pela
interface, e as fotos são o clímax do bloco 6.

Os passos: [`../checklist-demo-manual.md`](../checklist-demo-manual.md).
A conferência: abra o evento e use **"Pronto para mostrar?"** — ela lê o banco
e responde com número, em vez de perguntar se você lembra de ter subido.

---

## Refazer a demo entre dois ensaios

Cada ensaio deixa rastro: um checklist marcado, um lead movido, uma conta dada
como paga. No painel do Convex, no deployment de demonstração:

```
internal.demo.resetar  { "confirmo": "APAGAR E RECRIAR A DEMONSTRACAO" }
```

A frase é exata e não é normalizada — o ponto dela é obrigar a ler antes de
digitar. Se a conta já tiver **fotos subidas à mão**, o reset **recusa** e diz
quantas encontrou, em vez de destruir a única parte da demonstração que não se
refaz com um comando. Só prossegue com `{ "apagarArquivos": true }`.

> **Ordem que importa no dia:** resetar **antes** de subir as fotos. Depois
> das fotos, não resete.
