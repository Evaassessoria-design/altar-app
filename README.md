# ALTAR

Sistema de gestão para **empresas de decoração de eventos**. O ALTAR organiza o
que uma decoradora precisa entre o primeiro contato e a desmontagem: funil,
evento, briefing, fornecedores, equipe, ficha técnica, acervo, compras,
financeiro e os documentos que ela entrega.

> Este arquivo é o ponto de entrada técnico. Ele descreve **o que existe hoje no
> código** — não o que está planejado. Quando divergir do código, o código está
> certo e este arquivo está velho.

---

## 1. Arquitetura

| Camada | O que é |
|---|---|
| Frontend | React 19 + Vite 7 + TypeScript, rotas em `react-router-dom` (SPA, rotas sob demanda) |
| UI | Tailwind 4 + shadcn/ui sobre Radix |
| Backend | **Convex** — queries, mutations, actions, crons e rotas HTTP, tudo em `convex/` |
| Autenticação | **Better Auth** rodando como componente dentro do Convex (e-mail e senha) |
| Pagamentos | **Asaas** — checkout, webhook e reconciliação diária |
| IA | SDK da OpenAI apontando para endpoint configurável por variável de ambiente |
| PDFs | `jspdf` (geração) e `pdfjs-dist` (leitura de contrato) |
| Hospedagem | Frontend na Vercel; backend no Convex |

**Modelo de dados: por usuário.** Cada tabela carrega `userId`, e a assinatura
vive no próprio registro de `users`. Não há tabela de organização e não há
multiempresa — uma tentativa de migrar para multi-tenant foi revertida antes de
existir produto (veja o PR #2 do repositório). **Não reintroduza `organizationId`
sem uma decisão explícita de produto.**

A regra de negócio mora em módulos **puros** (`convex/lib/*`, `src/lib/*`),
testados sem banco; as funções do Convex e as telas orquestram. É essa divisão
que sustenta a suíte de testes.

---

## 2. Comandos

```bash
pnpm install            # pnpm é o gerenciador — não use npm nem yarn
pnpm dev                # frontend em http://localhost:5173
pnpm test               # suíte completa (convex + frontend)
pnpm lint
pnpm build              # tsc -b && vite build
npx tsc -p tsconfig.app.json --noEmit      # tipos do aplicativo
npx tsc -p convex/tsconfig.json --noEmit   # tipos das funções Convex
npx convex codegen      # regenera convex/_generated (exige deployment configurado)
```

O frontend precisa de duas variáveis para falar com o backend:

```
VITE_CONVEX_URL       # https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL  # https://<deployment>.convex.site  (rotas HTTP e Better Auth)
```

Coloque-as em `.env.local` (ignorado pelo git). **Nunca** versione valor de
variável de ambiente.

---

## 3. DEV e PROD

| Ambiente | Deployment | Regra |
|---|---|---|
| Desenvolvimento | `healthy-pika-907` | onde se publica, testa e semeia dado de demonstração |
| **Produção** | `mellow-goose-539` | **só recebe release revisado. Nunca rode script, seed ou experimento aqui.** |

Antes de qualquer `convex deploy`, `convex env set` ou `convex run`, **confirme
o deployment alvo**. O script de homologação (`scripts/homologacao-central.sh`)
se recusa a rodar contra produção — mas a checagem no seu terminal vem antes.

Variáveis de ambiente usadas pelo backend (só os NOMES; os valores vivem no
Convex e em lugar nenhum do repositório):

```
BETTER_AUTH_SECRET  SITE_URL  RESEND_API_KEY  EMAIL_FROM
ASAAS_API_KEY  ASAAS_ENV  ASAAS_WEBHOOK_SECRET
ALTAR_AI_API_KEY  ALTAR_AI_BASE_URL  ALTAR_AI_MODEL
ALTAR_VISION_*  ALTAR_IMAGE_*           (IA de texto, visão e imagem)
ALTAR_VERTICAL  ALTAR_OFFICE_API_TOKEN  ALTAR_OFFICE_CENTRAL_TOKEN
ALTAR_WHATSAPP_PROVIDER  ALTAR_CENTRAL_MOCK_TOKEN
ALTAR_CENTRAL_ENVIO_HABILITADO           ← ver a seção 5
ALTAR_DEMO                               ← só no projeto de demonstração
```

---

## 4. Módulos

**Aplicativo da decoradora** (tudo isolado por `userId`)

| Módulo | Onde |
|---|---|
| Eventos, briefing, checklist | `convex/events.ts`, `briefing.ts` |
| Funil comercial e documentos do lead | `convex/funil.ts`, `leadDocuments.ts` |
| Fornecedores (catálogo e por evento) | `convex/supplierCatalog.ts`, `suppliers.ts` |
| Equipe e escala | `convex/team.ts` |
| Ficha técnica (materiais, composições, receita) | `convex/fichaTecnica.ts`, `materials.ts`, `compositions.ts` |
| Acervo (reserva, saída, retorno, ajuste) | `convex/acervo.ts` |
| Compras e panorama | `convex/purchases.ts` |
| Financeiro (livro-caixa) | `convex/financeiro.ts` |
| Orçamento, galeria, planta por IA | `convex/orcamento.ts`, `gallery.ts`, `layoutRenders.ts`, `aiVisual.ts` |
| Saúde do evento, dashboard, agenda | `convex/health.ts`, `dashboard.ts`, `agenda.ts` |
| Notificações (com varredura diária) | `convex/notifications.ts`, `crons.ts` |

**Operação do SaaS** (só administradores)

| Módulo | Onde |
|---|---|
| Painel administrativo, contas, métricas | `convex/admin.ts` |
| Assinatura e cobrança | `convex/asaas.ts`, `asaasWebhook.ts` |
| Central de Comunicações | `convex/communications*.ts`, `adminApprovals.ts`, `adminWorkItems.ts`, `customerVoice.ts` — veja `docs/central-comunicacoes.md` |
| Ponte do Escritório 3D (somente leitura) | `convex/officeBridgeHttp.ts`, `officeCentralHttp.ts` |
| Seed de demonstração (Marina & Gabriel) | `convex/demo.ts`, `lib/demoData.ts`, `lib/demoGuard.ts` — três travas: `ALTAR_DEMO=1`, recusa em banco com sinal de produção, idempotência |

**Para a reunião comercial**: `docs/demo-comercial.md` (roteiro de 7 e 20 min,
perguntas frequentes, checklist pré-Meet) e `docs/prontidao-comercial.md` (o
que pode e o que não pode ser mostrado hoje).

---

## 5. Regras de segurança

Estas não são preferências. Cada uma existe por causa de um defeito real.

1. **Toda função pública passa por um guarda.** Nada de `ctx.db` sem antes
   `requireUser`, `requireEventOwner`, `requireLeadOwner` (`convex/lib/identity.ts`)
   ou `requireAdmin` (`convex/lib/adminGuard.ts`).
2. **Id que veio do navegador não é prova de posse.** Toda função que recebe um
   `v.id(...)` confere o dono antes de ler ou escrever. Evento de outra conta
   responde `NOT_FOUND`, nunca `FORBIDDEN` — não se confirma nem que existe.
3. **O paywall é do servidor.** `requireActiveAccess` (`convex/lib/accessGuard.ts`)
   cobre criar evento, converter lead, **enviar arquivo** e toda ação de IA. Não
   cobre ler e editar o que a conta já tem, e **nunca** deve cobrir o caminho de
   volta (`users.updateProfile`, `users.generateLogoUploadUrl`,
   `asaas.createCheckoutSession`).
4. **A Central nunca toca em `leads`.** `leads` são clientes da decoradora;
   a Central fala com `landingLeads`, `users` e `adminContacts`. A fronteira é
   verificada por leitura de código em `convex/central.fronteiras.test.ts`.
5. **Envio externo tem uma porta só.** `communicationsOutbox` é o único módulo
   que chama `fetch`, e ele consulta o portão de saída antes. Com
   `ALTAR_CENTRAL_ENVIO_HABILITADO` ausente ou diferente de `"true"`, **nada
   sai** — aprovar registra a decisão e termina em `aprovada`, nunca `executada`.
6. **A Central classifica cobrança; nunca a executa.** Nenhum módulo dela
   referencia Asaas, `transactions` ou `subscriptionStatus`.
7. **Exclusão apaga mesmo.** `convex/lib/cascade.ts` é a fonte única: some a
   linha, somem os filhos e somem os arquivos no storage. Tabela nova com
   `eventId` que não entrar ali quebra `cascade.test.ts`.

---

## 6. Convenções

- **Campo novo nasce opcional.** Ausente tem significado declarado no schema
  (`departamento` ausente É "triagem"; `prioridade` ausente É "normal"), e
  nenhum backfill é feito. Filtrar por um valor padrão precisa alcançar também
  quem não tem o campo.
- **Estado derivável é derivado, não gravado.** Disponibilidade de acervo,
  status efetivo de compra e expiração de trial são calculados na leitura.
- **Snapshot onde o histórico importa.** A receita copiada para o item de
  montagem e a necessidade carimbada na compra não são recalculadas quando a
  origem muda; a tela avisa a divergência e a pessoa decide.
- **Filtro é do banco, nunca da página.** Filtrar em memória o resultado de um
  `take()` devolve "os urgentes ENTRE os 50 primeiros" e é lido como "os
  urgentes". Use `.filter()` na consulta e pagine o conjunto inteiro.
- **Varredura global pagina.** Nada de `take(500)` sobre `users` com filtro na
  memória: passado o teto, a função para em silêncio.
- **A tela não afirma o que não sabe.** "25 carregadas (há mais)" enquanto
  houver próxima página; "sem prazo" em vez de inventar data; nenhuma mensagem
  de erro técnica exposta a quem usa.
- **Comentário explica o PORQUÊ.** O código já diz o quê. Os comentários deste
  repositório guardam a decisão e o defeito que a motivou — mantenha o padrão.
- Português nos nomes de domínio novos; o que já está em inglês continua.

---

## 7. Como testar

```bash
pnpm test                                   # tudo
npx vitest run --project convex             # só backend
npx vitest run --project frontend           # só telas e libs puras
npx vitest run convex/central.inbox.test.ts # um arquivo
```

Dois projetos no mesmo comando: `convex` roda em edge-runtime com
`convex-test` (banco de verdade, em memória) e `frontend` roda em jsdom.

Padrões que valem a pena conhecer antes de escrever teste novo:

- **Sessão autenticada**: `convex/test.auth.ts` — `autenticarComoAdmin`,
  `autenticarComoDecoradora`. O componente Better Auth é substituído só na
  tradução "sessão → usuário"; `requireUser` e `requireAdmin` continuam reais.
- **Travas por leitura de código**: `central.fronteiras.test.ts`,
  `posicionamento.test.ts`, `produto-generico.test.ts`. Elas leem o fonte e
  falham quando uma fronteira é cruzada. Se você mexeu no texto e o teste
  quebrou, leia o que ele protege antes de "consertar" o teste.
- **Teste adversarial**: um teste novo deve tentar quebrar alguma coisa — id de
  outra conta, conta bloqueada, mutation repetida, paginação no limite. Teste
  que só confirma o caminho feliz não protege nada.

Toda validação também roda sozinha no GitHub Actions
(`.github/workflows/validacao.yml`): instala, testa, confere tipos, lint e
build. Ele **não** publica nada e não usa segredo nenhum.

---

## 8. O que NÃO fazer

- **Não toque em `mellow-goose-539`** (produção) para experimentar.
- **Não versione `.env*`**, chave, token ou admin key. Nunca.
- **Não ligue o envio externo da Central** sem o número comercial integrado e
  uma decisão explícita: `ALTAR_CENTRAL_ENVIO_HABILITADO` fora de `"true"` é o
  que mantém a Fase 1 segura.
- **Não aumente a autonomia da IA.** `podeEnviarSemAprovacao` devolve `false`
  para todos os níveis, de propósito; aprovação humana é a trava.
- **Não mexa em preço, plano, trial ou regra de cobrança** sem decisão de
  produto — e nunca em `convex/asaas*.ts` "de passagem".
- **Não remova campo do schema nem faça migração destrutiva.** Campo que saiu de
  uso vira documentado, não apagado.
- **Não filtre em memória** o que a tela apresenta como total.
- **Não crie tabela por canal** (`whatsapp*`): canal é atributo, não domínio.
- **Não conserte um teste de fronteira** sem entender o que ele protege.
