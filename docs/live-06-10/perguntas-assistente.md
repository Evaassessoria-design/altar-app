# O que perguntar ao Assistente ao vivo

Bloco 7 do roteiro. Três minutos, **duas** perguntas.

---

## Primeiro: a tela é `/assistente`

**Não `/escritorio`.** São coisas diferentes e a confusão custaria o bloco:

| Tela | De quem é | Guarda | Serve para a live? |
|---|---|---|---|
| `/assistente` | da **decoradora**, sobre a empresa dela | `requireUser` | **sim, é esta** |
| `/escritorio` | do **negócio ALTAR** (contas, receita, campanha) | `requirePlatformOwner` | não — a conta de demonstração vê uma recusa de acesso |

O roteiro dizia `/escritorio` até 26/09. Está corrigido.

---

## O que está homologado, e o que não está

Cada pergunta abaixo passa, a cada `pnpm test`, pelo caminho inteiro em
`convex/assistente.homologacao.test.ts`: semáforo → roteador → plano de
consulta → tarefa gravada.

**O que o teste prova:** que a pergunta sai **verde**, que vai para o agente
indicado, que o ALTAR escolheu o agente sozinho, e que o plano de consulta não
alcança nenhuma fonte além do que aquele agente pode ler.

**O que o teste NÃO prova:** a redação da resposta. Essa depende de uma chamada
de modelo, que o teste não faz de propósito — as decisões que importam são
tomadas antes de qualquer modelo, porque um modelo pode ser convencido.

Ou seja: **o encaminhamento e a permissão estão homologados; o texto da
resposta será visto pela primeira vez no ensaio.** Ensaie as duas perguntas
com a conta de demonstração antes do dia.

**Desde 28/09, também está homologado O QUE a pergunta de atenção lê.**
`convex/assistente.live.test.ts` semeia a demo e prova que "O que precisa da
minha atenção?" chega nas cobranças vencidas, na despesa vencida e no painel
de compras — e que o número é o mesmo do Financeiro. O teste existe porque,
na homologação da release em produção, essa pergunta leu SÓ os eventos e
respondeu "não há nada pedindo atenção" com três recebimentos vencidos no
briefing logo acima. Corrigido no plano de consulta da Gestão; **a correção
só chega à conta de demonstração quando for publicada** — confira no ensaio.

---

## As duas do roteiro

Com esta redação exata — a redação é o que está homologado.

> ### O que precisa da minha atenção?
> → **Gestão**, que é o único agente que alcança as nove fontes.
>
> É a pergunta que mostra o produto inteiro numa frase. Com a demo semeada,
> ela tem material real para encontrar: duas cobranças vencidas, uma despesa
> vencida e uma compra com prazo estourado
> ([`mapa-demo.md`](mapa-demo.md)).

> ### Como estão minhas oportunidades?
> → **Comercial**.
>
> Puxa o funil. Boa segunda porque muda de área e mostra que existem agentes
> diferentes, com alcances diferentes.

---

## As reservas, se sobrar tempo ou uma delas falhar

Todas homologadas, mesma garantia:

| Pergunta | Agente |
|---|---|
| Organize meu dia. | Gestão |
| Como estão meus próximos eventos? | Produção |
| Tenho recebimentos vencidos? | Financeiro |
| Quais compras precisam da minha atenção? | Gestão |
| Analise meus fornecedores. | Fornecedores |

> "Quais compras precisam da minha atenção?" cai na **Gestão**, não em
> Compras. Não é defeito: "precisa da minha atenção" é sinal de pergunta ampla,
> e a Gestão alcança tudo, então a resposta sai completa. Só muda o nome de
> quem assina. Se alguém perguntar ao vivo, essa é a resposta honesta.

---

## A pergunta que demonstra a fronteira

Vale gastar trinta segundos com ela, porque é o que separa este produto de um
chatbot:

> ### Prepare um retorno para um lead.
> → **verde**, Comercial. Redigir não é enviar.

> ### Envie o retorno para o lead.
> → **amarelo**, motivo *"falar com alguém de fora"*.

O semáforo lê o **verbo**, não o assunto. Nada sai do Assistente porque ele não
tem porta de saída.

> Cuidado de palco: um documento do repositório já afirmou que "Prepare um
> retorno" saía amarelo. Afirmava errado. Se você demonstrar esperando o selo
> de rascunho, vai ver verde.

---

## O que NÃO perguntar ao vivo

### Porque a resposta é uma recusa, e recusa não vende

Estes saem **vermelhos** e param antes de qualquer chamada. A trava é ótima e
está bem testada — mas demonstrá-la gasta o tempo do bloco mostrando o produto
dizendo "não":

- *Pague esta conta.* → movimentar dinheiro
- *Transfira esse dinheiro para o fornecedor.* → movimentar dinheiro
- *Apague este evento.* → apagar dados
- *Envie WhatsApp para a cliente.* → falar com alguém de fora

Se **alguém da plateia** pedir para ver, aí sim vale: a recusa é um argumento
quando é pedida, e não quando é oferecida.

### Porque não foi homologada

Qualquer pergunta que você não tenha rodado antes na conta de demonstração.
Improvisar uma pergunta ao vivo é apostar em três coisas ao mesmo tempo: o
roteamento, o dado existir e a redação sair boa.

### Porque o dado não existe na demo

- Qualquer coisa sobre **fotos** ou **projeto visual** antes de você ter
  subido as imagens à mão
- Qualquer coisa sobre **contratos anexados** — o seed não cria nenhum

---

## Se a resposta demorar

Regra de palco: **cinco segundos**. Passou disso, narre o que ela está
fazendo — "ele está lendo o financeiro, o funil e a agenda" — em vez de
esperar em silêncio. O bloco 7 é o mais descartável do roteiro; se a IA estiver
fora, pule para o encerramento sem comentar.

Plano B completo: [`../plano-b-live.md`](../plano-b-live.md).
