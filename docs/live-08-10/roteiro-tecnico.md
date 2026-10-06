# Live de 08/10 — o que a demonstração precisa ter, e o que já está de pé

Escrito em 03/10, na branch `integration/altar-pre-live-08-10`. **Nada foi
publicado**: este documento diz o que semear, não semeia.

---

## Os quatorze momentos pedidos, e o estado de cada um

| # | Momento | Estado | O que sustenta / o que falta |
|---|---|---|---|
| 1 | Dashboard | **pronto** | laços por evento limitados (`slice 5`/`slice 10`) |
| 2 | Evento com boa saúde | **pronto** | veredito "Em dia" em verde, com o motivo |
| 3 | Evento com atenção | **pronto** | veredito âmbar/vermelho + "Riscos e pendências" |
| 4 | Jornada | **pronto** | 10 etapas, "você está aqui", próximo passo com link |
| 5 | Acervo | **pronto** | as três linhas: prontas no galpão, fora/cuidado, prometido |
| 6 | Reserva | **pronto** | reserva por janela, com disponibilidade real |
| 7 | Conflito de disponibilidade | **pronto** | déficit com dia e quantidade, na lista do acervo |
| 8 | Retorno | **pronto** | `registrarRetorno` → em conferência |
| 9 | Item que precisa limpeza | **pronto** | ocorrência no galpão, 3 toques |
| 10 | Item que precisa reparo | **pronto** | idem |
| 11 | Foto de ocorrência | **pronto** | `OcorrenciaDeAcervoDialog` aceita foto |
| 12 | Histórico | **pronto** | movimentos com autor, data e evento de origem |
| 13 | Assistente respondendo sobre problemas | **pronto** | reparo por nome, disponíveis por item, o que voltou com problema |
| 14 | Mobile | **parcial** | acervo e ocorrência medidos; **falta aparelho real** |

**Nenhum dos quatorze depende de código novo.** O que falta é dado semeado e um
aparelho na mão.

## O que semear, e em que ordem

A conta da demo já tem `prepararConta` e o seed de Marina & Gabriel. Para os
quatorze momentos acima, a semeadura precisa produzir:

1. **dois eventos vivos** — um "Em dia" (nada pendente, data distante) e um
   "Em risco" (contrato faltando, data próxima). O veredito é derivado: basta
   o dado, nenhuma marcação manual;
2. **um item de acervo com os dois eixos ocupados** — ex. castiçal com 40 no
   total, 4 fora num evento que não devolveu, 2 para limpar, 1 em reparo. É o
   que faz a tela mostrar as três linhas em vez de uma;
3. **um conflito de data real** — dois eventos pedindo o mesmo item em dias
   próximos, somando mais que o total. O déficit aparece sozinho, com o dia;
4. **uma reserva com retorno registrado e não conferido** — é o estado
   "voltou, ninguém olhou ainda", que a conferência resolve ao vivo;
5. **uma ocorrência com foto** — precisa de upload humano; mutation não sobe
   imagem.

**Os itens 1 a 4 são semeáveis por mutation. O item 5 exige mão humana.**

## Riscos da demonstração

| Risco | Gravidade | Estado |
|---|---|---|
| Conta demo sem as fotos de ocorrência | **ALTA** | **ABERTO** — exige upload humano |
| Conta demo com trial vencido (paywall recusa no palco) | **ALTA** | **ABERTO** — `admin.setUserAccess` para `internal` |
| `/escritorio` recusar para a conta da demonstração | MÉDIA | **esperado** — é a ferramenta interna; não mostrar |
| Assistente sem chave de IA | MÉDIA | **mitigado** — responde localmente e diz que foi local |
| Mobile não testado em aparelho | MÉDIA | **ABERTO** — auditoria é de viewport |

## O que NÃO mostrar

- **`/escritorio`** e o painel de autonomia: é a mesa de quem administra o
  ALTAR, e desde 03/10 recusa para qualquer conta sem `platformOwner`.
  Mostrar levanta a pergunta errada no palco.
- **Central de Comunicações**: envio externo fechado por decisão.
- **Qualquer upload feito na hora**: desde 06/10 o limite de documento é
  100 MB (`fix/documentos-100mb`), mas um arquivo grande depende da subida da
  rede do palco e o POST do Convex corta aos 2 minutos. Se precisar mostrar,
  use um arquivo pequeno (ver `docs/upload/documentos-100mb.md`).
