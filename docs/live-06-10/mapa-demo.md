# Mapa da demonstração — onde cada número mora

Para quando alguém na plateia perguntar "de onde saiu esse valor?" e para
quando uma tela abrir diferente do esperado e for preciso saber, em três
segundos, se aquilo é defeito ou é o dado.

Conferido em `26/09/2026`, lendo o banco depois de rodar
`internal.demo.seed` — não de memória.

---

## Onde a demo mora, e como abrir

| Peça | Valor |
|---|---|
| Convex | projeto **`altar-demo`**, deployment **`insightful-goldfish-950`** (`altar-demo:dev`) — nem DEV (`healthy-pika-907`) nem PROD (`mellow-goose-539`) |
| Variáveis | `ALTAR_DEMO=1`, `BETTER_AUTH_SECRET`, `SITE_URL=http://localhost:5173` — **nenhuma de IA** (ver prontidão, C11) |
| Frontend | **local**, no computador da live: o `SITE_URL` do Better Auth é `localhost:5173` |
| Conta | uma só, `demo@exemplo.com.br` |

Abrir a demo — o `.env.local` do repositório aponta para o DEV; as variáveis
do comando têm prioridade sobre ele (conferido em 28/09 pelo bundle).

> **⚠️ A PORTA 5173 PRECISA ESTAR LIVRE.** O projeto **ALTAR Buffet**
> (`buffet-app`) também sobe em `localhost:5173`. Em 28/09 os dois estavam
> rodando juntos e o navegador abriu o **Buffet** — tela "ALTAR Buffet", rota
> `/entrar` — em vez da demo. Pare o servidor do Buffet antes, e use
> `--strictPort`: com ele o comando FALHA se a porta estiver ocupada, em vez
> de subir em outra porta onde o login da demo não funciona (o `SITE_URL` da
> demo é exatamente `localhost:5173`). Na tela certa o título é o da
> decoradora, não "ALTAR Buffet".

```bash
# bash
VITE_CONVEX_URL=https://insightful-goldfish-950.convex.cloud \
VITE_CONVEX_SITE_URL=https://insightful-goldfish-950.convex.site \
pnpm dev --port 5173 --strictPort
```

```powershell
# PowerShell
$env:VITE_CONVEX_URL="https://insightful-goldfish-950.convex.cloud"
$env:VITE_CONVEX_SITE_URL="https://insightful-goldfish-950.convex.site"
pnpm dev --port 5173 --strictPort
```

Publicar código na demo:

```bash
printf 'CONVEX_DEPLOYMENT=dev:insightful-goldfish-950\n' > /fora/do/repo/demo.env
cp .env.local /fora/do/repo/env.local.bak
npx convex dev --once --env-file /fora/do/repo/demo.env
cp /fora/do/repo/env.local.bak .env.local   # ⚠️ OBRIGATÓRIO
```

> **`convex dev` REESCREVE o `.env.local`** para o deployment que usou,
> mesmo com `--env-file`. Sem restaurar, o próximo comando no repositório
> cai na demo achando que está no DEV. Aconteceu em 28/09.

Os comandos internos da demo, sempre com `--deployment altar-demo:dev`:

| Comando | O que faz |
|---|---|
| `demo:checkEnvironment` | só lê: o ambiente aceita o seed? já está semeado? |
| `demo:contaDoDemo` | só lê: quem é a conta |
| `demo:prepararConta` | acesso `internal` e `role: user` — sem paywall e sem menu de admin na transmissão |
| `demo:resetar {"confirmo": "APAGAR E RECRIAR A DEMONSTRACAO"}` | apaga o conteúdo da conta e recria pelo seed atual |

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
| +55 d | planejamento | Lançamento Coleção Aurora — Marca Lume | 74.000 | 29.600 | — |
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

## A segunda-feira pós-evento — o acervo (desde 28/09)

Rafaela & Ian foi no fim de semana. Os números, todos no **Castiçal de vidro
25cm** (36 no acervo):

| O quê | Valor | Onde aparece |
|---|---|---|
| Saíram para Rafaela & Ian | 24 | tela do evento dela → Acervo |
| Voltaram | 20 | idem |
| **Ainda fora** | **4** | `/acervo` → Pós-evento → "Não voltou" |
| **No conserto** (base lascada) | **8** | `/acervo` → Pós-evento → "Em manutenção"; histórico do item |
| Sofia & Tomás pede | 30 | `/acervo` → "Vai faltar": **30 necessárias · 24 disponíveis · 8 fora de uso · 4 ainda não voltaram** (na branch da jornada, "fora de uso" soma todas as condições; aqui as 8 são de reparo) |
| Marina & Gabriel pede | 24 | coberto: 36 − 4 − 8 = **24**. O herói **não** acusa falta de castiçal |

> O impacto cai no contorno de propósito: a história do bloco 3 (o evento
> herói inteiro conectado) não muda. Quem cobra: `convex/demo.acervo.test.ts`.

**Só aparece na conta de demonstração depois de publicar esta versão lá e
rodar o reset** — o seed antigo não tinha o cenário.

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
