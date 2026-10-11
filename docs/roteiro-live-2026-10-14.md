# Roteiro da live — 14/10/2026, 19h30 (~20 minutos)

Base: `docs/roteiro-live-2026-10-08.md`. A história é a mesma: uma decoradora
recebe o contato de uma cliente, organiza o evento, acompanha o que a cliente
paga e controla as peças do acervo. Este arquivo diz **o que mudou** e o que
conferir antes. Os blocos que não aparecem aqui seguem o roteiro de 08/10.

> **No ar (PROD):** frontend `5810dbd` (CSS `index-DwvYhOS9`), backend
> `5ec2c4c`. Parcela sempre clicável, detalhes, "Corrigir" e "Editar valor e
> vencimento" **já estão em PROD**: o trecho que em 08/10 era [só DEV] agora vale.
>
> **[só DEV]**, até nova publicação do frontend (`feature/evolucao-14-10`):
> "Acrescentar parcelas" com as já lançadas à vista, levas com nome próprio,
> aviso de correção não concluída e os diálogos sem rolagem lateral.
>
> **Produção floral NÃO entra** nesta live: está em `feature/producao-floral`,
> revisada e com pendências (ver checkpoint). Não mostre nem prometa.

---

## ⚠️ Antes de tudo: o evento-herói venceu

O casamento **Marina & Gabriel** da conta de demonstração tem data
**10/10/2026**. Desde então o ALTAR o trata como evento que **já aconteceu**:

- a Jornada mostra a fase **Operação**, não Projeto;
- o alerta de déficit do acervo ("faltam 30 guardanapos") sumiu — ele só
  olha eventos futuros (ver `docs/demo-comercial.md`, "O demo tem data").

O bloco 4 (pasta do evento: Saúde, Jornada, "próximo passo") **não conta a
história de 08/10** com esse evento. Escolha uma das saídas da proposta no
checkpoint (`docs/checkpoint-evolucao-2026-10-11.md`) **antes** do ensaio. Sem
decisão, use no bloco 4 um evento com data futura e deixe Marina & Gabriel
para mostrar o retorno do acervo.

---

## 5. O dinheiro da cliente — Pagamentos da cliente (4 min)

**Cliques (PROD):** pasta do evento → **Pagamentos da cliente** → **Planejar
parcelas** (R$ 3.000 em 3×) → **Registrar recebimento** na 1ª: R$ 400, PIX →
mostrar "Parcialmente recebida", recebido e saldo → **clicar no card** da
parcela → **Anexar comprovante** no recebimento.

**[só DEV] Se publicado:** com as parcelas já lançadas, o botão vira
**Acrescentar parcelas** e mostra a lista do que já existe. As novas entram
como "Parcela adicional 1/2", e uma segunda leva como "Parcela adicional
(leva 2) 1/2".

**Fala:** "A cliente pagou uma parte. Registro o que entrou, anexo o
comprovante, e o ALTAR já mostra quanto falta. Se ela fechar um adicional,
eu acrescento parcelas sem mexer nas que já existem."

**Não fazer ao vivo:**
- "Corrigir" e depois **Cancelar**: a correção fica pela metade (o
  recebimento é anulado e o novo não entra). O ALTAR avisa [só DEV], mas não
  é cena para a live.
- Excluir parcela ou evento com recebimentos (recusado de propósito).
- Acrescentar parcelas acima do contratado sem explicar: o aviso aparece e o
  botão diz "mesmo assim".

---

## Disponível hoje × ideias futuras

**Em PROD:** tudo da lista de 08/10, mais a parcela sempre clicável com
detalhes, histórico, comprovantes, Corrigir e Editar.

**Só no DEV:** Acrescentar parcelas com levas nomeadas; aviso de correção não
concluída; diálogos de pagamento sem rolagem lateral.

**Ideias futuras — NÃO prometer:** Produção floral / ficha do florista (em
revisão); cobrança ou mensagem automática à cliente; multiusuário para a
equipe; integração bancária/PIX automático.

---

## Checklist até 14/10 19h30

| Item | Quem | Situação |
|---|---|---|
| Decidir a saída para o evento-herói vencido (proposta no checkpoint) | Você | **pendente** |
| Conferir o candidato `feature/evolucao-14-10` no DEV (roteiro no checkpoint) | Você | pendente |
| Autorizar (ou não) a publicação do frontend do candidato | Você | pendente |
| Se publicar: conferir no site o CSS do build do SHA publicado | Você | depois da publicação |
| Ensaiar o bloco 5 na conta de demonstração | Você | pendente |
| Comprovante fictício (PDF/foto pequeno) na área de trabalho | Você | preparar |
| Itens do checklist de 08/10 (acesso, logo, eventos, lead em Contratado, acervo) | Você | conferir de novo |
| Cota do Convex (aviso do plano Free) | Você | conferir no painel |

O que eu NÃO confiro: a conta de demonstração e os dados de PROD — não acesso
nem altero.
