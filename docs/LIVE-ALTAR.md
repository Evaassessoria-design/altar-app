# Live de apresentação do ALTAR

**Janela:** 28/09 a 04/10/2026. Data e horário a definir.
**Duração sugerida:** 45 min — 30 de demonstração, 15 de perguntas.

---

## Objetivo

Que uma decoradora que nunca viu o ALTAR saia da live conseguindo responder:
**"eu consigo imaginar a minha empresa inteira funcionando ali dentro."**

Não é uma aula de funcionalidades. É mostrar uma empresa trabalhando.

## Público

Decoradoras e empresas de decoração de eventos — casamento, 15 anos,
corporativo. De 5 a 60 eventos por ano. Hoje operam em **WhatsApp, planilha e
caderno**. É contra esses três que o ALTAR compete, não contra outro software.

## A promessa

> "Você já faz esse trabalho. O ALTAR faz ele parar de se perder."

Três frases de apoio, nesta ordem:
1. **A informação entra uma vez.** O que você anota no briefing vira item, vira compra, vira ficha, vira o projeto que a cliente vê.
2. **O sistema te avisa.** Conta vencida, evento pedindo atenção, peça que não voltou.
3. **O que sai é bonito.** Do mesmo cadastro sai o caderno da equipe e a apresentação da cliente.

---

## A história

**Marina & Gabriel · 10/10/2026 · Fazenda Aurora · 180 convidados.**

Um casamento **em andamento**, não concluído: checklist pela metade,
fornecedores em estágios diferentes, compras parciais, uma parcela a receber —
e **uma conta vencida**. É o que faz a tela parecer trabalho real em vez de
vitrine.

A conta vencida é o clímax: a floricultura venceu em 15/09 e não foi
liquidada. É o alerta que o produto existe para dar.

---

## Roteiro — sete cenas, sem menu

### 1. A segunda-feira de manhã · 4 min — **Dashboard**
Abre no Início. "O que preciso resolver hoje?"
O painel responde: evento pedindo atenção, **conta vencida**, compras atrasadas.
> *"Isso aqui ninguém digitou. É consequência do que já estava cadastrado."*

### 2. O evento · 4 min — **Evento → Briefing**
Abre Marina & Gabriel. Mostra o briefing: paleta, estilo, atmosfera, horários,
regras do espaço.
Desce até os **itens de montagem** da área Mobiliário.
> *"Repare: eu não digito 'Cadeira Tiffany' duas vezes. O que está escrito aqui vira item, e o item é o que a equipe monta."*

### 3. O momento UAU · 6 min — **Projeto Visual**
A tela que justifica a live. Ambientes, itens com quantidade e fornecedor,
**selo de contratado × inspiração**.
> *"O varal de luz é inspiração — ainda não foi fechado. A cliente vê que é inspiração. Essa confusão é a mais cara que existe na decoração."*
Clica em **Apresentação em PDF**. Abre o documento na frente de todos.
> *"Esse documento saiu do que eu já tinha feito. Não montei nada."*

### 4. O dinheiro · 4 min — **Financeiro**
A conta vencida da cena 1, agora por dentro. Pago com **data e forma**.
> *"Quando você dá baixa, ele pergunta quando entrou de verdade — não quando você lembrou de marcar."*
Mostra o espaço de **comprovante**.
> *"Anexar o comprovante não marca como pago. São decisões diferentes."*

### 5. A operação · 4 min — **Compras → Fornecedores**
Painel de compras: o que está atrasado, o que não tem preço, o que está fora do
livro-caixa.
Abre a ficha da **Mobiliário Casa Rara**: contato, situação, **o que ele entrega
neste evento**, documentos.
> *"Antes de ligar para ele, está tudo numa tela só."*

### 6. A equipe de IA · 6 min — **Escritório**
> *"Isso aqui é novo."*
Escreve, ao vivo: **"Organize meu dia e me diga o que precisa da minha atenção."**
Mostra a resposta e o **"Onde consultei"**.
> *"Ele não inventou nada. Leu o que já estava aqui."*
Depois, escreve: **"Pague a conta da floricultura."**
Mostra a **recusa**.
> *"Ele analisa e organiza. Não mexe no seu dinheiro, não apaga nada e não manda mensagem para ninguém. Essa linha não é configuração — é como ele foi construído."*

### 7. O fechamento · 2 min
Volta ao Dashboard.
> *"Uma decoradora já está usando o ALTAR com cerca de 40 eventos cadastrados. Não é protótipo."*

---

## Momentos "UAU"

| # | O quê | Por que funciona |
|---|---|---|
| 1 | O PDF do Projeto Visual abrindo | material de venda saindo do trabalho já feito |
| 2 | A recusa do Escritório | confiança vale mais que capacidade |
| 3 | "Onde consultei" | prova que não é chute |
| 4 | O selo inspiração × contratado | resolve uma dor que ela conhece na pele |

---

## CTA e oferta

**CTA:** *"Entre em altar.app e comece pelo seu próximo evento — não pelo cadastro."*

Oferta: **PENDENTE DE DECISÃO (Matheus/Eva)** — período de teste, preço de
fundador, condição por indicação. O produto suporta `trial`, `beta` com prazo e
`internal` (`admin.setUserAccess`), então qualquer das três é operacional hoje.

## Depois da live

1. Cadastro → trial. Sem cartão. **Já funciona.**
2. Primeiro evento em menos de 5 minutos — é a métrica que importa.
3. Quem pediu demo/beta cai em `landingLeads` e aparece no Painel Admin.
4. `origem` para separar quem veio da live: **não implementado** — ver `docs/aquisicao-altar.md`.

---

## Riscos de demonstração

| Risco | Gravidade | Mitigação |
|---|---|---|
| **Conta demo com trial vencido** — o Escritório e a criação de evento recusam | **ALTA** | pôr a conta em `internal` antes da live (`admin.setUserAccess`) |
| **Demo sem fotos** — Galeria e Projeto Visual ficam sem imagem; o PDF sai sem capa | **ALTA** | subir de 10 a 15 fotos reais na conta demo e escolher a capa |
| Escritório sem chave de IA | MÉDIA | responde pela redação local e **diz isso na tela**; os números continuam reais |
| Internet cair no meio | MÉDIA | ter gravação de tela das cenas 3 e 6 |
| Perguntarem preço sem oferta definida | MÉDIA | decidir antes |
| Perguntarem "e o WhatsApp?" | BAIXA | responder com honestidade: existe a Central, o envio está fechado por decisão |
| Alguém pedir para criar conta ao vivo | BAIXA | funciona; ensaiar uma vez |

**Nunca demonstrar:** Painel Admin · Central · dados de cliente real.
