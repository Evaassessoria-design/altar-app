# Roteiro curto — a folha que fica aberta ao lado

Uma página. A narrativa inteira está em
[`../live-altar-2026-10-06.md`](../live-altar-2026-10-06.md); isto aqui é o
que se olha de relance, com a plateia esperando.

**06/10/2026 · 19:00 · America/Sao_Paulo · 28–33 min + perguntas**

---

## A ordem

| # | Tela | Min | A frase que abre o bloco |
|---|---|---|---|
| 0 | — | 2 | "Uma decoradora tem sete lugares para a informação de um casamento." |
| 1 | `/dashboard` | 3 | "O que precisa de mim hoje?" |
| 2 | `/funil` → proposta → evento | 5 | "Como entra um casamento aqui dentro?" |
| 3 | `/eventos` → Marina & Gabriel | 5 | "Onde fica tudo de um evento?" |
| 4 | `/eventos/:id/fornecedores` → `/compras` | 4 | "E o que eu contratei e comprei?" |
| 5 | `/financeiro` | 3 | "Estou ganhando dinheiro neste evento?" |
| 6 | `/eventos/:id/projeto` + PDF | 6 | "O que a noiva recebe?" — **o clímax** |
| 7 | `/assistente` | 3 | "Preciso aprender o sistema todo?" |
| 8 | — | 2 | "Como eu entro?" |

---

## Os cinco momentos que sustentam a apresentação

Se o tempo apertar, **estes** ficam:

1. **Bloco 1** — o painel de atenção falando sozinho. Prova que o sistema
   olha pela decoradora em vez de esperar que ela procure.
2. **Bloco 2** — "Aceita → criar o evento". Prova que dado informado uma vez
   não é redigitado.
3. **Bloco 5** — a margem que **se cala** quando o custo está incompleto.
   Prova que o sistema prefere não afirmar a afirmar errado.
4. **Bloco 6** — o PDF dos noivos, e a foto "Só para mim" que **não** aparece
   nele. É o bloco que vende.
5. **Bloco 7** — duas perguntas ao Assistente, com as fontes citadas.

---

## As duas perguntas do bloco 7

Exatamente com esta redação (homologadas em
`convex/assistente.homologacao.test.ts`):

> **O que precisa da minha atenção?** → Gestão
>
> **Como estão minhas oportunidades?** → Comercial

Tudo sobre isso: [`perguntas-assistente.md`](perguntas-assistente.md).

---

## O que NÃO abrir, em nenhuma hipótese

- **`/central`** — o envio externo está desligado; abrir sugere um WhatsApp
  que não existe
- **`/admin`** — contas, receita e os leads desta própria live
- **`/escritorio`** — é o painel do negócio ALTAR, não o produto da cliente
- **Qualquer conta real** de cliente, em especial a da piloto
- **Leitura de contrato por IA** e **planta por IA** ao vivo — só o resultado
  já gerado
- **Preço de improviso** — só o que estiver escrito na landing

---

## As três regras de palco

1. **Nunca tente a mesma coisa duas vezes** na frente de quem assiste.
2. Se uma tela demorar mais de cinco segundos, **narre** em vez de esperar —
   e siga.
3. Se algo cair, o plano B do bloco está em
   [`../plano-b-live.md`](../plano-b-live.md). Escolher ao vivo qual plano B
   usar é o que custa a apresentação.

---

## Nos quinze minutos antes

- [ ] Logada na conta de **demonstração** — não na da piloto
- [ ] `/eventos/:id` → **"Pronto para mostrar?"** sem nenhum ✕ em fotos e capa
      (se houver, **o bloco 6 não é apresentado**)
- [ ] `/dashboard` aberto e carregado
- [ ] As onze abas do roteiro já abertas, na ordem
- [ ] Notificações do sistema operacional silenciadas
- [ ] O vídeo gravado de contingência acessível em uma aba

A lista completa das horas anteriores:
[`../checklist-pre-live.md`](../checklist-pre-live.md).
