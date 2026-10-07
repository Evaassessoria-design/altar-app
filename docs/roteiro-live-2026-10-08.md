# Roteiro da live — 08/10/2026, 19h (~20 minutos)

**Uma história só:** a Ana, decoradora, recebe o contato da Mariana para um
casamento, organiza o evento, acompanha o que a cliente paga e controla as
peças do acervo que vão e voltam do galpão.

> Tudo aqui foi usado no DEV com dados de teste. Em PROD está publicado o
> `5ec2c4c` (07/10). O trecho marcado **[só DEV]** só vale se o ajuste das
> parcelas (`feature/parcelas-acessiveis`) for publicado antes da live — senão,
> use a alternativa indicada. Não mostre nada da lista "Ideias futuras".

---

## 0. Antes de abrir (preparação — ver checklist no fim)

Conta de demonstração logada, navegador em tela cheia, notificações do
computador desligadas, uma aba já no **Início**.

---

## 1. Abertura — o dia começa no Início (2 min)

**Cliques:** Início → rolar até os cards → clicar em **Itens Pendentes** →
voltar → clicar em **Receita do Mês**.

**Dados:** 2–3 eventos nos próximos 30 dias, um com checklist pendente; um
recebimento parcial neste mês.

**Benefício:** cada número leva exatamente ao que ele conta — sem refazer a
conta na cabeça.

**Fala:** "O ALTAR abre dizendo o que precisa de mim hoje. E cada número é um
atalho: clico em 'Itens Pendentes' e caio no checklist de cada evento."

**Se falhar:** mostrar os cards e o quadro "Precisam da sua atenção", sem clicar.

---

## 2. O contato chega — Funil (3 min)

**Cliques:** Funil → **Novo Lead** (nome, telefone, tipo, data, orçamento) →
Salvar → no card, **Abrir lead** → **Registrar contato** → **Avançar para…**

**Dados:** lead "Mariana & Gabriel — Casamento", data em 2027, orçamento R$ 48.500.

**Benefício:** cada oportunidade com a próxima ação visível; nada se perde
entre WhatsApp e planilha. Se algo der errado ao salvar, o formulário fica
preenchido.

**Fala:** "Chegou o contato da Mariana. Em trinta segundos ela está no funil,
com a data, o orçamento e o que eu faço a seguir."

**Se falhar:** abrir um lead já existente da demonstração.

---

## 3. Fechou — vira evento (2 min)

**Cliques:** num lead em **Contratado** → **Converter em Evento** → conferir
dados → criar → abrir a pasta do evento.

**Dados:** um lead já em "Contratado" (preparar antes).

**Benefício:** os dados do lead passam para o evento — sem cadastrar de novo.
Converter duas vezes não cria dois eventos.

**Fala:** "Fechou contrato: um clique e o evento nasce com tudo que eu já sabia."

**Se falhar:** abrir um evento já criado.

---

## 4. A pasta do evento (3 min)

**Cliques:** pasta do evento → mostrar **Saúde do evento** (riscos e próximo
passo) → **Jornada do projeto** → abrir o **Checklist de carregamento** →
marcar um item.

**Benefício:** em uma tela, o que falta para o evento estar pronto, com o
próximo passo dito em palavras.

**Fala:** "Aqui é o evento inteiro: o que já está pronto, o que é risco e qual
é o próximo passo."

**Se falhar:** ficar na Saúde do evento e na Jornada.

---

## 5. O dinheiro da cliente — Pagamentos da cliente (4 min)

**Cliques:** pasta do evento → **Pagamentos da cliente** → **Planejar
parcelas** (R$ 3.000 em 3 vezes) → **Registrar recebimento** na 1ª: R$ 400,
PIX → mostrar "Parcialmente recebida", recebido e saldo → abrir a parcela
**[só DEV]** → **Anexar comprovante** no recebimento.

**Dados:** evento com valor contratado; um PDF ou foto de comprovante fictício
no computador.

**Benefício:** quanto foi fechado, quanto entrou e quanto falta — recebimento
a recebimento, com comprovante, sem planilha. Errou? Corrige anulando com
motivo: o histórico fica.

**Fala:** "A Mariana pagou só uma parte. Registro o que entrou, anexo o
comprovante, e o ALTAR já mostra quanto falta — sem eu fazer conta."

**Alternativa sem o [só DEV]:** em PROD, a parcela quitada se abre pelo
**Histórico (n)** no card ou, no Financeiro, pelo botão redondo da linha.

**Não fazer ao vivo:** excluir parcela ou evento com recebimentos (é recusado
de propósito — só mostre se perguntarem, e explique o porquê).

---

## 6. O mesmo dinheiro no Financeiro (2 min)

**Cliques:** Financeiro → achar a parcela (status **Parcial**, "Recebido R$ 400 ·
falta R$ 600") → voltar ao Início → **Receita do Mês** → mostrar a lista
"Recebido em outubro".

**Benefício:** o Financeiro, o evento e o Início dizem o mesmo número — a
receita do mês é o dinheiro que entrou de verdade, parcial inclusive.

**Fala:** "Não tem duas contas: o que registrei no evento já está no
Financeiro e na receita do mês."

**Se falhar:** mostrar só a linha Parcial no Financeiro.

---

## 7. As peças do galpão — Acervo (3 min)

**Cliques:** Acervo → mostrar peças com quantidade e condição → pasta do
evento → **Acervo do evento** → **Reservar peça** (4 castiçais) → registrar
**Saiu: 4** → registrar **Voltou: 4** → **Confirmar conferência**.

**Dados:** 2–3 peças cadastradas com quantidade (ex.: 6 castiçais dourados).

**Benefício:** quanto tenho, quanto está reservado, o que saiu e o que voltou —
peça em reparo não aparece como pronta.

**Fala:** "Reservei, saíram quatro, voltaram quatro e conferi: o galpão sabe
o que está pronto para o próximo evento."

**Se falhar:** mostrar só a lista do Acervo e uma reserva já feita.

---

## 8. Fechamento (1 min)

**Fala:** "Contato, evento, dinheiro e peças no mesmo lugar, no computador e no
celular. É isso que o ALTAR faz hoje."

**Opcional, só se ensaiado antes:** Assistente ("Pergunte ao ALTAR") com uma
pergunta simples, ex.: "Quanto tenho a receber este mês?". Ele analisa e
organiza; não envia mensagem a ninguém. Se não foi ensaiado, não mostrar.

---

## Disponível hoje × ideias futuras

**Disponível (em PROD, `5ec2c4c`):** Início com atalhos; Funil com lead,
contato, proposta e conversão; pasta do evento com Saúde e Jornada; checklist;
compras; Pagamentos da cliente (parcelas, recebimento parcial, comprovante,
anulação); Financeiro (anexos, Receita do Mês pelo que entrou); Acervo
(reserva, saída, retorno, conferência); proteção contra excluir evento com
histórico; Assistente para contas com acesso ativo.

**Só no DEV até nova publicação:** parcela sempre clicável, com detalhes,
"Corrigir (anular e registrar de novo)" e "Editar valor e vencimento" na aba
do evento.

**Ideias futuras — NÃO prometer:** cobrança ou envio automático de mensagens à
cliente; multiusuário para a equipe da decoradora; gráfico de meses futuros;
integração bancária/PIX automático.

---

## Checklist de preparação da conta de demonstração

| Item | Quem | Situação |
|---|---|---|
| Acesso à conta de demonstração (login funcionando, sem aviso de cobrança) | Você | conferir antes |
| Foto/logo do estúdio em Configurações | Você | conferir |
| 3 eventos nos próximos 30 dias, um com checklist pendente | Você | conferir |
| 1 lead em "Contratado" para converter ao vivo | Você | preparar |
| 1 evento com valor contratado e parcelas planejadas, uma parcial | Você | preparar |
| Comprovante fictício (PDF/foto pequeno) na área de trabalho | Você | preparar |
| 2–3 peças no Acervo com quantidade | Você | preparar |
| Teste completo de pagamentos e comprovantes em PROD | Você | **em andamento** |
| Publicar `feature/parcelas-acessiveis` (se quiser o trecho [só DEV]) | Você autoriza | pendente |
| Cota do Convex (aviso do plano Free) | Você | conferir no painel |

O que eu NÃO confiro: a conta de demonstração e a DEMO em PROD — não tenho
acesso e não altero dados de produção.
