# Central de Comunicações ALTAR — BLOCO 1

Operação do SaaS ALTAR. O WhatsApp é o **primeiro canal**, não o domínio.

---

## 1. A fronteira que não pode ser cruzada

| Tabela | Dono | Significa |
|---|---|---|
| `leads` | `userId` (tenant) | cliente **da decoradora** — a noiva, o aniversariante |
| `landingLeads` | admin | interessado **no ALTAR** (SaaS) |
| `users` | — | assinante do ALTAR |
| `adminContacts` | admin | **a pessoa do outro lado** do número comercial |

O número comercial do ALTAR fala com interessados e assinantes. **A Central nunca
toca em `leads`.** Isso é verificado por leitura de código em
`convex/central.fronteiras.test.ts`.

---

## 2. Fluxo

```
WhatsApp (ou outro canal)
   │ POST /channels/<canal>/webhook     HMAC (produção) | token local (mock)
   ▼
integrationEvents          dedup por externalMessageId
communicationIdentities    handle externo → pessoa
adminContacts              a pessoa, com vínculo a landingLead/user
communicationConversations a conversa
communicationMessages      a mensagem normalizada
   │ scheduler.runAfter(0)
   ▼
communicationTriage        o PALPITE da IA (confiança, resumo, sinais)
   ├─► classificação da conversa (departamento, categoria, prioridade)
   ├─► adminWorkItems        follow-up · demo · onboarding · suporte · contato de cobrança
   ├─► customerVoiceSignals  reclamação · sugestão · bug · funcionalidade · elogio
   └─► adminApprovals        proposta de resposta, sempre "pendente"
                             │
                             ▼
              Painel Admin → Matheus aprova / edita / recusa
                             │
                             ▼  communicationsOutbox — porta ÚNICA
                        [TRANCADA NA FASE 1]
```

---

## 3. As quatro travas da saída

`convex/lib/central/autonomia.ts` → `avaliarPortaoDeSaida`. Cada uma **sozinha**
barra a saída:

| # | Trava | Falha quando |
|---|---|---|
| 1 | aprovação aprovada | status ≠ `aprovada` / `aprovada_editada` |
| 2 | decisão tem autor | `decididoPorUserId` ausente |
| 3 | ambiente permite | `ALTAR_CENTRAL_ENVIO_HABILITADO` ≠ `"true"` |
| 4 | canal aceita | `janelaRespostaAte` no passado |

Depois delas ainda vêm opt-out do contato, canal configurado e destino
conhecido. **Só então existe `fetch`.**

Na Fase 1 a trava 3 sempre recusa. Aprovar deixa a proposta em `aprovada` —
**nunca** `falhou` nem `executada`. Confundir as duas apagaria a diferença entre
"o ambiente está fechado" e "a plataforma recusou a mensagem".

`podeEnviarSemAprovacao()` devolve `false` para **todos** os níveis de
autonomia, inclusive `autonomo`. Gravar o nível em `adminAutonomyPolicy` não
liga envio nenhum — a tabela existe para que a Fase 2 seja mudança de dado.

---

## 4. Contrato da ponte do Escritório 3D

**Somente leitura.** Token próprio, distinto do de métricas.

```
GET /office/central/painel
Authorization: Bearer <ALTAR_OFFICE_CENTRAL_TOKEN>
```

```json
{
  "vertical": "altar_decor",
  "geradoEm": "2026-09-18T14:00:00.000Z",
  "mensagensNaoLidas": 12,
  "conversasAbertas": 31,
  "aguardandoAprovacao": 4,
  "escaladasCeo": 1,
  "leadsNovos24h": 3,
  "porDepartamento": {
    "triagem":    { "abertas": 2,  "urgentes": 0, "aguardandoAprovacao": 0 },
    "comercial":  { "abertas": 14, "urgentes": 2, "aguardandoAprovacao": 3 },
    "suporte":    { "abertas": 9,  "urgentes": 1, "aguardandoAprovacao": 1 },
    "financeiro": { "abertas": 4,  "urgentes": 0, "aguardandoAprovacao": 0 },
    "ouvidoria":  { "abertas": 2,  "urgentes": 0, "aguardandoAprovacao": 0 }
  },
  "pendencias": { "semRespostaMais24h": 5, "followUpVencido": 3 },
  "envioExterno": "desligado"
}
```

**Este payload está congelado.** A sala 3D pode ser construída contra ele.

Respostas de erro: `503` (ponte não configurada), `401` (token inválido).

`/office-snapshot` **não foi tocado** — mesmo token, mesmo payload, mesmas
métricas agregadas de sempre.

### Por que não há escrita aqui

Aprovar exige saber **quem** aprovou, e o token autentica um serviço, não uma
pessoa. Enquanto o Escritório 3D não autenticar o Matheus do lado dele, a
decisão acontece só no Painel Admin. Aprovação sem autor não é aprovação.

---

## 5. Canal de entrada

```
GET  /channels/whatsapp/webhook   handshake (hub.challenge da Meta)
POST /channels/whatsapp/webhook   recebimento
```

| Situação | Resposta |
|---|---|
| canal desconhecido | `404` |
| canal não configurado | `503` — ausência de config **fecha** a porta |
| autenticação inválida | `401`, sem registro na auditoria |
| payload sem mensagem | `200` + `integrationEvents.outcome = "ignored"` |
| corpo não-JSON | `200` + `outcome = "error"` |
| mensagem repetida | `200` + `outcome = "duplicate"` |

`200` para payload estranho é deliberado: a Meta reenvia qualquer webhook que
não receba `200`, e um erro aqui viraria fila de reentrega infinita.

### Modo mock

O número comercial ainda não está integrado. O modo `mock` usa o **mesmo
formato de payload da Meta Cloud API**, autenticado por um token local:

```
ALTAR_WHATSAPP_PROVIDER=mock
ALTAR_CENTRAL_MOCK_TOKEN=<valor local de desenvolvimento>
```

```bash
curl -X POST "$CONVEX_SITE_URL/channels/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Altar-Mock-Token: $ALTAR_CENTRAL_MOCK_TOKEN" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "metadata": { "phone_number_id": "MOCK" },
      "contacts": [{ "wa_id": "5511999998888", "profile": { "name": "Helena" } }],
      "messages": [{
        "from": "5511999998888", "id": "wamid.TESTE1",
        "timestamp": "1789000000", "type": "text",
        "text": { "body": "Oi! Queria conhecer o ALTAR" }
      }]
    }}]}]
  }'
```

Trocar `mock` por produção **não muda uma linha** de normalização, schema ou
tela: muda credencial.

---

## 6. Variáveis de ambiente

| Variável | Papel | Fase 1 |
|---|---|---|
| `ALTAR_VERTICAL` | `altar_decor` \| `altar_buffet` | ausente = `altar_decor` |
| `ALTAR_CENTRAL_ENVIO_HABILITADO` | libera saída externa | **ausente / `false`** |
| `ALTAR_WHATSAPP_PROVIDER` | `meta_cloud` \| `mock` | `mock` em dev |
| `ALTAR_CENTRAL_MOCK_TOKEN` | autentica o modo mock | valor local |
| `ALTAR_WHATSAPP_APP_SECRET` | HMAC da Meta | ausente |
| `ALTAR_WHATSAPP_VERIFY_TOKEN` | handshake da Meta | ausente |
| `ALTAR_WHATSAPP_TOKEN` | token da Graph API | ausente |
| `ALTAR_WHATSAPP_PHONE_ID` | Phone Number ID | ausente |
| `ALTAR_OFFICE_CENTRAL_TOKEN` | ponte do 3D | ausente = `503` |
| `ALTAR_OFFICE_API_TOKEN` | `/office-snapshot` | **inalterado** |

Só a string exata `"true"` habilita o envio. `"1"`, `"sim"`, `"TRUE"` — nada
disso abre a porta. Env mal digitada nunca é autorização.

---

## 7. Acrescentar um canal

1. `convex/lib/channels/<canal>.ts` implementando `AdaptadorDeCanal`
2. uma linha em `FABRICAS`, em `convex/lib/channels/registro.ts`
3. duas rotas em `convex/http.ts`

Nenhuma tabela, índice, query ou tela muda.

---

## 8. O que mede a IA

`communicationTriage` guarda o palpite; a conversa guarda o que vale. Quando um
humano corrige a classificação, `divergiu` é marcado.

O acúmulo de `divergiu = false` ao longo de semanas é o **único dado honesto**
para decidir a Fase 2. Sem ele, liberar autonomia seria chute.

---

# Central de Comunicações — BLOCO 2 (operação)

O BLOCO 1 entregou o caminho: recebe, triava, propõe, registra. **Nada disso era
operável**: a tela existia como uma seção do Painel Admin com indicadores, a
fila e uma conversa somente leitura. Catorze funções de backend — listar,
classificar, atribuir, escalar, vincular, tarefas, Ouvidoria — não tinham como
ser chamadas por ninguém.

O BLOCO 2 é a mesa de operação: rota própria `/central`, admin-only.

## 1. O que a tela mostra, e o que ela pode afirmar

```
/central
 ├── Caixa de entrada   lista · conversa · ficha do contato (3 colunas)
 ├── Fila de aprovação  pendentes + histórico de decisões + portão de saída
 ├── Tarefas            vencidas · hoje · próximas · sem prazo · encerradas
 └── Ouvidoria          sinais, recorrência, fusão e Voz do Cliente → Produto
```

**A regra que atravessa tudo: filtro é do BANCO, nunca da página.**

Filtrar em memória o resultado de um `take(50)` devolve "as urgentes ENTRE as
50 mais recentes". Quem lê entende "as urgentes", e a quinquagésima primeira
fica sem resposta. Por isso:

| Consulta | Como filtra |
|---|---|
| `communications.listarConversas` | `.filter()` na consulta + `.paginate()` |
| `adminWorkItems.listar` | idem — `apenasVencidos` deixou de filtrar a página |
| `customerVoice.listar` | idem, com severidade |

O mesmo vale para o que a tela **escreve**: `descreverResultado`
(`src/lib/central-inbox.ts`) diz "25 carregadas (há mais)" enquanto existir
próxima página, e nunca "25 conversas".

## 2. Busca

Índice de busca nativo do Convex sobre `communicationConversations.buscaTexto`,
com `vertical`, `status` e `channel` como campos de filtro.

`buscaTexto` é **derivado** (assunto + nome do contato + handles, normalizados
em `lib/central/busca.ts`) e é mantido em três pontos: no recebimento, quando a
triagem reescreve o assunto, e por `repararIndiceDeBusca` — interna, idempotente
e em lote — para as conversas anteriores ao campo. Perder esse campo tira a
conversa da BUSCA, nunca da operação.

Vincular contato busca por índice em três frentes: telefone normalizado
(`by_whatsapp_e164`), e-mail (`by_email`) e nome (índices de busca em
`landingLeads.name` e `users.name` — campos que já existiam, sem backfill).

## 3. Campo ausente É o valor padrão

`departamento` ausente significa "triagem"; `prioridade` ausente significa
"normal". Filtrar por esses dois valores alcança também os documentos em que o
campo não existe — senão a conversa recém-chegada, que é justamente a que está
em triagem, seria a única a sumir do filtro "Triagem".

## 4. Notas internas

`adminContacts.notas`, com `notasAtualizadasEm` e `notasAtualizadasPorUserId`.
Só admin lê e escreve. **Não** entram em proposta de resposta, **não** existem
no payload do Escritório 3D e **não** saem da operação. Texto vazio apaga a
nota e a autoria junto.

## 5. Vínculo com desfazer

`vincularContato` ganhou o par que faltava: `desvincularContato`, com
`vinculoRemovidoEm` e `vinculoRemovidoPorUserId`. Um vínculo errado — telefone
reaproveitado, homônimo, clique trocado — deixou de ser permanente. O contato
não é apagado e as conversas não se movem; só o vínculo cai, e o tipo volta a
"desconhecido" quando não sobra nenhum lado.

## 6. O que NÃO mudou

- **Envio externo continua desligado.** Nenhuma função nova toca o outbox, o
  portão ou `ALTAR_CENTRAL_ENVIO_HABILITADO`. Aprovar registra a decisão e
  termina em `aprovada` — nunca `executada`.
- **Zero mensagem automática e zero chamada real ao canal.**
- **`/office/central/painel` e `/office-snapshot` intactos**, payload congelado.
  Os indicadores da tela leem a MESMA query (`communications.painel`) — três
  telas, um número só.
- **Nada do caminho do dinheiro.** `central.fronteiras.test.ts` passou a cobrir
  também a tela: nenhum arquivo de `src/pages/app/central` pode citar
  `api.asaas`, `subscriptionStatus`, `api.funil`, `api.events` ou o outbox.
- **`leads` continua do outro lado da linha.** A busca de candidatos consulta
  `landingLeads` e `users`; uma noiva com o mesmo nome no funil de uma
  decoradora não aparece (verificado em `central.vinculo.test.ts`).

## 7. Sessão autenticada nos testes

`convex/test.auth.ts` substitui SÓ a tradução "sessão → usuário do Better Auth",
que vive num componente que o convex-test não registra. `requireUser`,
`requireAdmin` e o índice `by_better_auth_id` continuam sendo os de verdade — e
cada arquivo de teste da Central verifica que uma decoradora (`role: "user"`) é
barrada em tudo.
