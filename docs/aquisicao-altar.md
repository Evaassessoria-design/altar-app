# Aquisição do ALTAR — arquitetura, antes de existir

**Status: PROJETO. Nada disto está implementado.** Este documento existe para
que a implementação, quando vier, não invente estrutura que já existe.

---

## 1. De quem é este funil — a pergunta que decide tudo

O ALTAR tem **dois funis** e confundi-los seria o erro mais caro possível:

| Tabela | Dono | Significa |
|---|---|---|
| `leads` | `userId` (a decoradora) | **cliente dela** — a noiva, a debutante |
| `landingLeads` | admin (Matheus) | **interessado no ALTAR** |

"Encontre decoradores de casamento em Campinas" é o **segundo**. Um prospect do
ALTAR jamais pode entrar em `leads`: é a trava nº 5 do `CLAUDE.md`, e
`central.fronteiras.test.ts` já a verifica por leitura de código.

**Decisão: estender `landingLeads`, não criar tabela.** É a mesma entidade —
"uma empresa interessada no ALTAR" — e a única diferença é como ela chegou.

---

## 2. O que falta em `landingLeads`

Hoje: `name`, `email`, `whatsapp`, `whatsappE164`, `intent`, `status`.
É um formulário de landing. Para prospecção faltam, **todos opcionais, sem backfill**:

```
origem         "landing" | "prospeccao" | "indicacao" | "evento"
               AUSENTE = "landing" — é o que todos os registros de hoje são

empresa        razão/nome fantasia
cidade, uf
site, instagram
telefoneComercial
observacoes

score          0–100
motivoDoScore  POR QUE esse número — um score sem motivo é superstição
etapa          reaproveita `status`; ver §4
responsavelUserId
ultimoContato  "AAAA-MM-DD"
proximoFollowUp
```

**Histórico**: não um campo novo. A Central **já** guarda conversa
(`communicationConversations`), tarefa (`adminWorkItems`) e proposta de resposta
(`adminApprovals`), e `adminContacts` já liga uma pessoa a um `landingLead`. O
histórico de um prospect é a Central dele.

---

## 3. Os dados são públicos, e isso tem limite

Só entram **dados comerciais publicados** pela própria empresa: site, Instagram
de negócio, telefone e e-mail comercial divulgados. Nada de dado pessoal
inferido, nada de raspagem de rede social fechada, nada de lista comprada.

Todo registro guarda **de onde veio** — a LGPD exige saber a origem, e um
prospect sem origem é um prospect que não se pode contatar com segurança.

---

## 4. Etapas

`landingLeads.status` já tem `novo · contatado · convertido · descartado`.
Prospecção precisa de duas: `qualificado` (analisado, vale abordar) e
`abordado` (rascunho aprovado e enviado por uma pessoa).

Acrescentar dois literais a uma união opcional **não quebra registro nenhum** —
é a mesma manobra que `leadStage` fez quando ganhou três etapas no meio.

---

## 5. O Comercial IA — o que ele faz e o que nunca fará sozinho

Reaproveita **inteiro** o Escritório de IA que já existe: catálogo de agentes,
semáforo, plano de consulta, executor sem acesso ao banco.

| Capacidade | Cor | V2 |
|---|---|---|
| analisar e priorizar prospects | 🟢 | executa |
| dar score **com motivo** | 🟢 | executa |
| resumir o histórico de um prospect | 🟢 | executa |
| apontar quem está parado / precisa de follow-up | 🟢 | executa |
| **redigir** abordagem personalizada | 🟢 | executa — é rascunho |
| **enviar** a abordagem | 🟡 | **nunca automático** |

O "buscador de leads" propriamente dito — ir à internet procurar empresas — é
**integração externa nova** e está fora de qualquer rodada até que haja decisão
sobre fonte de dados, custo e base legal. Sem ela, o Comercial IA ainda é útil:
ele qualifica, prioriza e redige sobre a lista que **já** existir.

---

## 6. A camada de aprovação — já está construída

Não é preciso desenhá-la: a Central tem `adminApprovals` +
`lib/central/autonomia.ts` com **quatro travas independentes**, cada uma
sozinha barrando a saída:

1. a aprovação está aprovada;
2. a decisão tem **autor humano registrado** — "aprovação sem autor não é aprovação";
3. `ALTAR_CENTRAL_ENVIO_HABILITADO === "true"`;
4. a janela de resposta do canal está aberta.

E `podeEnviarSemAprovacao()` devolve `false` para **todos** os níveis, inclusive
`autonomo`.

**O caminho de um rascunho do Comercial IA para o mundo é este, e só este.**
Nenhuma função nova de envio. O agente propõe em `adminApprovals`; uma pessoa
decide; o portão avalia. É exatamente o que a triagem da Central já faz.

---

## 7. Marketing IA

Hoje o agente lê **só** `eventos.proximos` — conteúdo não precisa saber quanto a
cliente pagou, e essa restrição fica.

Futuro (🟢 todos, porque são rascunho): calendário de conteúdo a partir dos
eventos executados · ideias de post · texto de divulgação da live ·
acompanhamento dos prospects originados dela (leitura de `landingLeads` por
`origem`) · análise do funil.

**Publicar continua sendo 🟡 e continua sendo de uma pessoa.**

---

## 8. Ordem sugerida

1. os campos em `landingLeads` + as duas etapas;
2. tela de prospecção no Painel Admin (é operação do SaaS, não da decoradora);
3. Comercial IA lendo essa lista — um agente novo no catálogo, nada mais;
4. rascunho de abordagem caindo em `adminApprovals`;
5. **só então** discutir a busca externa.

Os passos 1 a 4 não tocam em rede nenhuma.
