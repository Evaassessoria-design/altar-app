# Checklist real da live — o que está pronto para o palco

Classificação honesta, item a item. **PRONTO** significa homologado; **NÃO
TESTADO** significa que o código existe e passa nos testes, mas ninguém
percorreu a tela contra dado real nesta linha de trabalho.

> **O bloqueio que define tudo abaixo:** nenhuma sessão até aqui conseguiu
> alcançar o DEV (`healthy-pika-907`) — a política de rede do ambiente nega
> `*.convex.dev` e `*.convex.cloud` com 403. Nada do que está marcado
> **NÃO TESTADO** é suspeita de defeito: é ausência de prova pela tela.

---

## As sete cenas

| # | Cena | Estado | O que sustenta / o que falta |
|---|---|---|---|
| 1 | **Dashboard** — "o que resolvo hoje?" | **NÃO TESTADO** | laços por evento são limitados (`slice 5`/`slice 10`); depende de dado semeado |
| 2 | **Evento → Briefing** | **NÃO TESTADO** | o texto do briefing virando item de montagem é testado em unidade |
| 3 | **Projeto Visual + PDF** ← o UAU | **PARCIAL** | a junção foto↔ambiente, a capa, o selo e o PDF sem custo/fornecedor têm teste. **Falta foto real na conta demo** — sem imagem, a cena morre |
| 4 | **Financeiro** — baixa com data e forma | **PRONTO** | homologado contra banco real nesta rodada, receita e despesa |
| 4b | **Comprovante não marca como pago** | **PRONTO** | é a frase da cena, e está travada por teste nos dois tipos |
| 5 | **Compras → Fornecedores** | **PRONTO** (backend) / **NÃO TESTADO** (tela) | comprado ≠ pago, cancelamento com decisão e procedência homologados |
| 6 | **Assistente** — "Organize meu dia" | **PRONTO** (decisão) / **PARCIAL** (redação) | roteamento, semáforo, fontes e recusa homologados. A redação depende de chave de IA; sem ela responde localmente **e diz isso na tela** |
| 6b | **A recusa** — "Pague a conta" | **PRONTO** | `refused`, com motivo, sem custar uma consulta |
| 7 | **Fechamento** | **PRONTO** | é fala |

## Os quatro momentos "UAU"

| # | Momento | Estado |
|---|---|---|
| 1 | O PDF do Projeto Visual abrindo | **PARCIAL** — falta foto na conta demo |
| 2 | A recusa do Assistente | **PRONTO** |
| 3 | "Onde consultei" | **PRONTO** — `fontesConsultadas` é gravado por tarefa |
| 4 | Selo inspiração × contratado | **NÃO TESTADO** na tela; a regra tem teste |

## Riscos, revisados

| Risco | Gravidade | Estado |
|---|---|---|
| **Conta demo com trial vencido** | **ALTA** | **ABERTO** — depende de `admin.setUserAccess` no DEV |
| **Demo sem fotos** | **ALTA** | **ABERTO** — mutation não sobe imagem; exige upload humano |
| `platformOwner` não concedido → `/escritorio` recusa | MÉDIA | **ABERTO**, e é o esperado: ninguém ganha por inferência |
| Assistente sem chave de IA | MÉDIA | **MITIGADO** — redação local com números reais, e a tela diz que foi local |
| Internet cair | MÉDIA | gravar as cenas 3 e 6 antes |

---

## O roteiro que eu levaria ao palco

Baseado no que está homologado, não no que é bonito.

**Trocas em relação ao roteiro atual:**

1. **A cena 4 (Financeiro) sobe para logo depois da 2.** É a única cena
   inteiramente homologada contra banco real, e é a dor que a decoradora sente
   toda semana. Começar pelo que é sólido compra a atenção para o que vem.

2. **A cena 3 (Projeto Visual) só entra se a conta demo tiver fotos.** Sem
   imagem, a tela do UAU é uma lista — e uma lista depois da promessa "o
   momento que justifica a live" é pior do que não prometer. **Se não houver
   foto até a véspera, corte a cena e distribua os 6 minutos entre Financeiro e
   Assistente.**

3. **A cena 6 (Assistente) termina na recusa, não na resposta.** "Pague a conta
   da floricultura" → recusa explicada. A resposta analítica depende de chave e
   de dado; a recusa é determinística e funciona sempre, inclusive offline.
   Terminar no que nunca falha é como se fecha uma demonstração.

4. **Mostre a busca de eventos.** Entrou nesta rodada e responde à objeção que
   uma decoradora com 40 eventos faz em silêncio: *"e quando eu tiver
   duzentos?"*. Trinta segundos, na cena 1.

**O que eu NÃO mostraria:**

- `/escritorio` — é a mesa de quem administra o ALTAR, não da decoradora, e
  hoje recusa para toda conta até a concessão explícita. Mostrar levanta a
  pergunta errada no palco.
- Central de Comunicações — envio externo está fechado por decisão. Explicar
  isso ao vivo gasta tempo e planta dúvida.
- Qualquer tela que dependa de upload feito na hora.

---

## A ordem das duas horas antes da live

1. Publicar schema e funções no DEV, e conferir `assistantTasks` e
   `users.platformOwner`.
2. Pôr a conta demo em `internal` — senão o Assistente e a criação de evento
   recusam por paywall, no palco.
3. Subir de 10 a 15 fotos reais e **escolher a capa**. É o que decide se a
   cena 3 entra.
4. Percorrer as sete cenas inteiras, uma vez, do jeito que serão mostradas.
5. Gravar as cenas 3 e 6.
