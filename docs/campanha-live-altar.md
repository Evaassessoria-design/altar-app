# Operar a campanha da live dentro do ALTAR

Como usar `/campanha` do primeiro contato até a assinatura, sem planilha
paralela.

> Descreve o que existe no código em **25/09/2026**. O que não existe está
> escrito que não existe. O estado de cada peça está em
> `homologacao-pre-live.md`.

---

## 1. A campanha é uma constante, não um cadastro

`Apresentação ALTAR — 06/10/2026`, 19:00, fuso de Brasília. Vive em
`convex/lib/campanha.ts` e não se edita pela tela.

**Por quê:** nome, data, hora e observação são quatro valores que não mudam.
Uma tabela para guardá-los seria um CRM de marketing montado para responder uma
dúzia de contagens — e pediria um cadastro que ninguém quer fazer.

No dia em que houver campanha criada pela tela, o slug vira `v.id()` e o dado
já está no lugar certo.

**A situação da campanha é derivada da data**: `agendada`, `hoje`, `realizada`.
Um `status` editável ficaria em "agendada" para sempre no dia em que ninguém
lembrasse de virar a chave, e a tela passaria a convidar para uma live que já
aconteceu.

**O link da sala ainda não existe**, e a tela diz isso. Não há link inventado.

---

## 2. As doze etapas

```
Novo → Convite preparado → Convite enviado → Respondeu → Interessado
     → Confirmado na live → Participou → Trial → Cliente
```

E três saídas laterais:

- **Não participou** — confirmou e faltou. Continua alcançável.
- **Demonstração individual** — vai ver o ALTAR numa conversa só dele.
- **Perdido** — disse que não.

### Por que os desvios não são degraus

Chega-se a "Trial" por três caminhos: participou da live, faltou e foi
recuperado, ou nunca passou pela live. O estágio atual não distingue os três.

Cada palpite estraga um número:

- supor que participou **infla a taxa de comparecimento** — o indicador que a
  live existe para medir;
- supor que não participou faz o total de participantes **encolher** conforme
  as pessoas avançam, e um indicador que despenca quando a campanha dá certo não
  serve para decidir nada.

Por isso cada marco é **carimbado quando acontece** (`marcosEm`), e o carimbo
nunca é apagado nem reescrito. Voltar de etapa corrige o presente sem reescrever
o passado — que é o que faz corrigir um clique errado não zerar o relógio do
follow-up.

Registro antigo, sem carimbo, é contado pelo que o estágio COMPROVA — e essa
leitura é deliberadamente tímida. Subestimar é menos grave do que inflar.

---

## 3. O dia a dia, em quatro blocos

A tela `/campanha` está na ordem do trabalho, não na ordem do bonito.

### Bloco 1 — Comercial, hoje

A pergunta: *"se eu tivesse trinta minutos para a campanha hoje, no que eu
mexeria?"*

- **HOJE** — o estado, em números que fecham com o funil.
- **PREPARADO** — o que já está escrito esperando revisão. **Some quando não há
  nada**, em vez de mostrar "0 convites": anunciar trabalho que não existe é a
  forma mais rápida de alguém parar de acreditar no resto da tela.
- **PRECISA DE VOCÊ** — o que nenhum modelo de texto resolve.

O botão **"Escrever o que está faltando"** prepara em lote, até 50 por vez, e
diz quantos ficaram. Rodar de novo continua de onde parou.

### Bloco 2 — Fila de revisão

Quatro abas: para revisar, aprovadas, já enviadas, descartadas.

**Não existe botão de enviar.** O principal é **Copiar**; o segundo é **"Já
enviei"**, que é anotação de algo que aconteceu fora do ALTAR.

- **Aprovar** é decisão editorial — "este texto está bom" —, registra quem
  aprovou, e **não é enviar**.
- **Editar depois de aprovado derruba a aprovação.** Ela era daquele texto, não
  daquela pessoa.
- **Pendência barra a aprovação.** Um texto com `[LINK DA SALA — ainda não
  definido]` no meio não é aprovável: aprovar um texto com buraco é o mesmo que
  não ter revisado.
- **O que já foi enviado não pode ser reescrito** — o histórico deixaria de
  bater com o WhatsApp de quem mandou.

### Bloco 3 — O funil

Doze etapas, com os desvios separados, e cinco taxas.

**Toda taxa mostra a base.** Abaixo de 5 na base, nenhuma porcentagem aparece —
um cliente em dois convidados é "50% de conversão", e é uma frase que só serve
para enganar quem a lê.

Clicar numa etapa filtra a lista abaixo. O filtro é **da consulta**: filtrar a
página carregada devolveria "os não abordados entre os 200 primeiros" e a tela
leria isso como "os não abordados".

### Bloco 4 — As pessoas

Busca por **nome, empresa, telefone ou e-mail** — quatro memórias diferentes.
Telefone normaliza para E.164 antes de procurar, senão o número copiado do
WhatsApp não acha o registro digitado à mão.

Cada pessoa é um **cartão**, não uma linha de tabela: sete colunas em 320px é
rolagem horizontal, e é assim que ninguém usa a tela no celular.

Quem não tem telefone nem e-mail **aparece assim mesmo**, marcado "sem
contato". Esconder faria a lista prometer que todo mundo é alcançável.

---

## 4. Os dez modelos

Convite · follow-up sem resposta · pedido de e-mail · confirmação · lembrete de
24h · lembrete de 30min · agradecimento pós-live · faltou à live · convite para
demonstração individual · convite para testar.

### O que nenhum deles diz

Preço, desconto, prazo de teste, promessa de resultado. Um rascunho que promete
condição vira promessa quando alguém envia sem ler.

### A abertura muda com a origem

O convite abre com *"Você entrou em contato com a gente há um tempo"* para quem
preencheu a landing — e **não** para quem veio de lista de prospecção, que ouve
a verdade: *"Estou falando com empresas de decoração de eventos"*.

Afirmar um contato que nunca houve é a forma mais rápida de queimar o número.

### Os que dependem do link

Confirmação e os dois lembretes precisam do link da sala. Enquanto ele não
existir, o texto sai com `[LINK DA SALA — ainda não definido]` e a pendência
sobe junto — e **não dá para aprovar**. É um impedimento de verdade, não um
aviso decorativo.

---

## 5. O roteiro da noite e dos dias seguintes

### Nas semanas antes

1. Importar a lista de interessados (Painel → Interessados → Importar lista),
   com campanha **Live ALTAR** e a origem certa.
2. `/campanha` → **Escrever o que está faltando** → revisar os convites.
3. Copiar e enviar, um a um, pelo WhatsApp. Marcar **"Já enviei"**.
4. Dois dias depois, o botão de escrever produz os follow-ups sozinho — a regra
   sabe quem foi convidado há dois dias e não respondeu.
5. Quem responder: marcar a etapa e pedir o e-mail.

### Na véspera e no dia

6. Os lembretes de 24h e de 30min aparecem para quem está em **Confirmado**,
   e só nesses dois dias.

### Na mesma noite

7. Marcar **Participou** e **Não participou**. Ninguém mais consegue saber isso
   depois, e é o número que decide se a apresentação funcionou.

### Na semana seguinte

8. Quem participou → convite para testar.
9. Quem não participou → convite para demonstração individual.
10. Acompanhar as taxas. Se alguma continuar sem porcentagem, é porque a base
    ainda é pequena — e é melhor saber disso do que ver um número bonito.

---

## 6. O que a campanha NÃO faz

- **Não envia.** Nem WhatsApp, nem e-mail, nem nada. Os motivos, e o que
  precisaria mudar, estão em `whatsapp-arquitetura.md`.
- **Não funde duplicidade.** Aponta pares suspeitos e uma pessoa decide — duas
  sócias dividem o telefone do escritório e são duas pessoas.
- **Não move ninguém de etapa sozinha.** Nem quando a resposta é clara.
- **Não promete preço.** Nenhum modelo o menciona.
