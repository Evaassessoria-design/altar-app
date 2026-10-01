# Arquitetura da jornada — auditoria de 30/09 e o refino

Segunda rodada na branch `feature/altar-jornada-evento`, **depois** da versão
publicada na demo para homologação. Essa versão está congelada na tag
`demo-jornada-homologacao-2026-09-30` (`4643d57`); tudo o que vem depois dela
NÃO está na demo. Para comparar:

```bash
git diff demo-jornada-homologacao-2026-09-30..feature/altar-jornada-evento --stat
```

---

## 1. A página do evento, de cima para baixo (como estava em 4643d57)

| # | Bloco | O que mostra | Observação da auditoria |
|---|---|---|---|
| 1 | Cabeçalho | status, tipo, nome, data, local, orçamento, notas, PDF/editar/excluir | ok |
| 2 | **Informações do Cliente** | nome, telefone, WhatsApp | um card inteiro para 2 linhas — empurra a Saúde para baixo da dobra no celular |
| 3 | **Saúde** | %, fase, próximo passo, atenção, critérios | não diz "está saudável?" em palavras; o % mede cadastro, não risco |
| 4 | **Jornada do projeto** | 10 etapas, você está aqui, próximo | ok — orienta, não trava |
| 5 | **Operação** | 10 etapas em faixa horizontal | separação/carregamento abrem o briefing, mas o **checklist de carregamento** mora em outro card (#9) |
| 6 | Pronto para mostrar? | prontidão de apresentação (fechada) | complementa a Saúde; ok |
| 7 | **Contrato** | arquivo, substituir, ler com IA, pendências | contrato também aparece na Pasta (#10) e na Saúde |
| 8 | **Análise de Croqui** | botão de IA que descreve uma imagem | **não grava nada**, e o nome confunde com a etapa Croqui (planta premium) da jornada |
| 9 | **Checklists** | carregamento (pré) e conferência (pós), com IA | **duplicado**: o Resumo operacional (#11) mostra os mesmos dois contadores e links |
| 10 | Pasta do evento | todos os documentos | ok |
| 11 | **Resumo operacional** | 6 contagens, financeiro, "Próximas ações" | "Próximas ações" compete com o "Próximo passo" da Saúde: duas listas do que fazer |
| 12 | Equipe | responsável, escala | ok |
| 13 | Agenda | horários | ok |

### Duplicações encontradas

- **Checklist pré/pós**: card Checklists (#9) e Resumo operacional (#11),
  mesmos números, mesmos destinos.
- **"O que fazer"**: Próximo passo + Precisa de atenção (Saúde) e Próximas
  ações (Resumo). As fontes são diferentes (jornada × contagens) e as duas
  continuam úteis; o problema é o título igual.
- **Contrato**: seção própria, Pasta do evento e critério da Saúde. Os três
  leem o mesmo registro (`contracts`) — não há divergência de dado, só de
  lugar. Mantido: a seção é o destino da etapa 3 da jornada.

### Ordem × vida real

- Checklist de **separação** é o primeiro passo da operação, e estava longe
  dela (card #9).
- "Análise de Croqui" aparecia antes dos checklists, como se fosse etapa — é
  uma ferramenta, e das menos usadas.
- O cliente ocupava o espaço que a Saúde precisa no topo.

---

## 2. A jornada proposta — e como ela já está modelada

A ordem pedida (questionário → orçamento+proposta → contrato → inspirações →
fornecedores → ficha → acervo → projeto visual → croqui → planta → operação) é
**exatamente** a de `ETAPAS_DO_PROJETO` em `convex/lib/jornadaDoEvento.ts`.
Nada a reordenar. O que se refina é o que cada passo diz e onde leva.

| Princípio | Onde vive |
|---|---|
| A jornada **orienta, não trava** — toda etapa abre a qualquer momento | `jornada-do-projeto.tsx` (todo item é link) |
| "Você está aqui" = primeira não concluída | `jornadaDoEvento` |
| Dependência real só onde o sistema não funciona sem a anterior (planta ← croqui) | `DEFINICAO.planta.dependeDe` |
| Derivada, nunca gravada | D1 em `decisoes.md` |

**Orçamento + Proposta** continuam duas estruturas (D3): o orçamento é interno
(custo, margem), a proposta é o documento da cliente, e a fronteira de
audiência mora na transformação (`paraOCliente`). O que faltava era a TELA
mostrar que são o mesmo processo: a página do orçamento não levava à proposta.
Agora leva (ciclo 3).

---

## 3. Defeitos encontrados (antes de qualquer código)

| # | Onde | Defeito | Gravidade |
|---|---|---|---|
| B1 | `resumoDaJornada` | Na fase Operação o próximo passo **sempre** levava a `/acervo`, mesmo quando a etapa era Separação ou Carregamento (que se resolvem nos itens de montagem). | média — link errado no lugar mais visível |
| B2 | `resumoDaJornada` | Com o projeto todo feito e o evento no futuro, sem itens de montagem, o "próximo passo" virava **"Evento — Ainda não aconteceu"**: esperar não é passo. | baixa |
| B3 | `getEventJourney` | Depois do evento, peça que **não voltou** não aparecia em "Precisa de atenção" — só o retorno não conferido. | média |
| B4 | `registrarRetorno` | Depois da conferência, dava para **baixar** o "voltou" (20 → 10): as peças já classificadas passavam a contar também como "fora sem voltar" — **duas vezes fora**. | alta — estoque incorreto |
| B5 | `registrarRetorno` | Depois da conferência, peça que chegava atrasada (voltou 20 → 22) entrava como **pronta sem ninguém olhar**. | média |
| B6 | disponibilidade | Peça que voltou e **ainda não foi conferida** contava como pronta para o próximo evento. | média — é a pergunta "o que voltou?" |
| B7 | `/acervo` | "28 prontas" incluía peças que estão **fora**, num evento que não devolveu. Condição física e lugar estavam somados num número só. | média |
| B8 | `/acervo` no celular | Três ações à direita de cada item (Ocorrência + 2 ícones) espremiam o nome e as contagens em ~150 px. | baixa |

---

## 4. Decisões desta rodada

### R1 — Condição física e estado logístico são eixos diferentes

Condição (pronto, limpar, reparo, indisponível, conferência) é **do item** e
gravada em contadores (D6). Lugar (no galpão, fora num evento, reservado para
os próximos, voltou aguardando conferência) é **das reservas** e sempre
derivado — `convex/lib/logisticaDoAcervo.ts`. Um castiçal pode estar
"pronto" e "fora"; outro "em reparo" e "no galpão". A tela mostra os dois
eixos em linhas separadas e nunca soma um com o outro.

Separado / carregado continuam no **item de montagem**
(`assemblyItems.operationalStatus`), não no acervo: é o que a equipe marca, e
não há quantidade por item de acervo nesse trajeto. "Pré-reservado" não existe
no modelo — toda reserva é reserva; o que há é evento em planejamento ou
confirmado. Não se cria um segundo tipo de reserva sem pedido real.

### R2 — Retorno registrado fica "aguardando conferência" (só daqui para frente)

A reserva ganha `retornoRegistradoEm` (opcional). Quando existe e a reserva
ainda não foi conferida, as peças que voltaram **não contam como prontas** na
disponibilidade dos eventos seguintes — "voltou, ainda não olhado". A
conferência (que já existia) libera.

Sem backfill: reserva antiga, sem o campo, continua como sempre foi (o que
voltou conta como pronto). É a única forma honesta — o histórico não sabe se
alguém olhou as peças de agosto.

### R3 — Depois da conferência, o retorno só sobe — e o que sobe vai para "em conferência"

Baixar o "voltou" de uma reserva conferida é recusado (B4): corrigir é
ocorrência. Peça que chega depois (B5) entra no contador `emConferencia` do
item, com linha no histórico, e sai de lá por ocorrência no galpão.

### R4 — A Saúde ganha um veredito em palavras

"Esse evento está saudável?" ganha resposta: **Em dia**, **Precisa de
atenção** ou **Em risco**, com o porquê ao lado. O percentual continua o
mesmo (D5). Regra pura em `vereditoDoEvento`; ver `saude-evento.md`.

### R5 — Menos cards, mesma capacidade

- Cliente vai para dentro do cabeçalho (nome + telefone + WhatsApp): a Saúde
  sobe uma dobra no celular.
- Os checklists de carregamento e pós-evento passam para **dentro da
  Operação**, onde está a separação. O card "Checklists" sai.
- "Análise de Croqui" vira **ferramenta**, no fim da página, com nome que não
  se confunde com a etapa Croqui.
- "Próximas ações" do Resumo operacional passa a se chamar "Também em aberto",
  para não competir com o Próximo passo.

Nenhum destino foi removido.
