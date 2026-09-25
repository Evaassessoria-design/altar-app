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
o deployment alvo**. O script de homologação se recusa a rodar contra produção
— mas a checagem no seu terminal vem antes.

A homologação da Central roda igual nos dois sistemas, porque é o mesmo Node:

```bash
node scripts/homologacao/central.mjs      # Linux, macOS
pwsh scripts/homologacao-central.ps1      # Windows
./scripts/homologacao-central.sh          # casca, para os dedos que já sabem
```

As travas (não tocar produção, não rodar com envio externo ligado, exigir
`mock`, token só do ambiente) vivem em `scripts/homologacao/travas.mjs`, são
funções puras e têm teste próprio (`npx vitest run --project scripts`).

Para publicar uma rodada no DEV e conferir o produto depois, a sequência está
em **`docs/homologacao-dev.md`** — vinte passos, na ordem, incluindo o
`convex codegen` e a conferência do `api.d.ts`.

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
| **Proposta comercial** (o documento da CLIENTE) | `convex/propostas.ts`, `lib/propostaComercial.ts` — a fronteira de audiência vive na transformação, não na tela; veja `docs/proposta-comercial.md` |
| Fornecedores (catálogo e por evento) | `convex/supplierCatalog.ts`, `suppliers.ts` |
| Documentos do evento e da contratação | `convex/contracts.ts` — o slot é (tipo, fornecedor); anexar acontece na Pasta do Evento OU dentro do fornecedor, e é o mesmo registro |
| Equipe e escala | `convex/team.ts` |
| Ficha técnica (materiais, composições, receita) | `convex/fichaTecnica.ts`, `materials.ts`, `compositions.ts` |
| Catálogo (a mesma base, em tela própria) | `/catalogo`, `src/components/catalogo/*` — os diálogos são os MESMOS da ficha técnica, importados dos dois lugares |
| Acervo (reserva, saída, retorno, ajuste) | `convex/acervo.ts` |
| Compras e panorama | `convex/purchases.ts` |
| Financeiro (livro-caixa) | `convex/financeiro.ts`, `lib/dinheiro.ts` |
| Orçamento, galeria, planta por IA | `convex/orcamento.ts`, `gallery.ts`, `layoutRenders.ts`, `aiVisual.ts` |
| Saúde do evento, dashboard, agenda | `convex/health.ts`, `dashboard.ts`, `agenda.ts` |
| Notificações (com varredura diária) | `convex/notifications.ts`, `crons.ts` |
| Assistente ALTAR (a IA da decoradora) | `convex/assistente.ts`, `assistenteExecutor.ts`, `lib/assistente/*` — veja `docs/assistente-e-escritorio.md` e `docs/comercial-ia.md` |
| Briefing da manhã (o ALTAR olha antes de ser perguntado) | `convex/assistenteBriefing.ts`, `lib/assistente/briefing.ts` — derivado, nunca gravado |
| "Meu ALTAR está pronto?" (onboarding por valor, não por cadastro) | `convex/onboarding.ts`, `lib/prontidaoDaConta.ts` |

**Operação do SaaS** (só administradores)

| Módulo | Onde |
|---|---|
| Painel administrativo, contas, métricas | `convex/admin.ts` |
| Campanha da live (12 etapas, taxas, busca) | `convex/lib/campanha.ts`, `comercialBriefing.ts`, `/campanha` — veja `docs/campanha-live-altar.md` |
| Mensagens preparadas da campanha | `convex/campanhaRascunhos.ts`, `lib/mensagensDaCampanha.ts` — **não** é `adminApprovals`, e o porquê está em `docs/whatsapp-arquitetura.md` |
| Situação honesta de cada canal | `convex/mensageria.ts`, `lib/channels/situacao.ts` — cinco estados; hoje `nao_configurado` |
| Assinatura e cobrança | `convex/asaas.ts`, `asaasWebhook.ts` |
| Central de Comunicações | `convex/communications*.ts`, `adminApprovals.ts`, `adminWorkItems.ts`, `customerVoice.ts` — veja `docs/central-comunicacoes.md` |
| Ponte do Escritório 3D (somente leitura) | `convex/officeBridgeHttp.ts`, `officeCentralHttp.ts` |
| Escritório ALTAR (o painel do negócio) | `convex/escritorio.ts`, `lib/escritorio/panorama.ts`, `lib/platformGuard.ts` — **não** é para administradores: é para o dono da plataforma |
| Seed de demonstração (Marina & Gabriel) | `convex/demo.ts`, `lib/demoData.ts`, `lib/demoGuard.ts` — três travas: `ALTAR_DEMO=1`, recusa em banco com sinal de produção, idempotência |

**A identidade visual**: `docs/identidade-visual.md` — a arte oficial, as onze
derivações técnicas que saem dela, onde cada uma é usada e por que a ocupação
do símbolo muda de um alvo para outro. A fonte fica em `brand/`, intacta; as
derivações são geradas por `scripts/brand/gerar-icones.py`.

**Para a live de 06/10/2026**, quatro arquivos com papéis distintos:
`docs/live-altar-2026-10-06.md` (roteiro pela jornada de um casamento e o que
NÃO demonstrar), `docs/checklist-demo-manual.md` (preparar a conta — o seed
não cria fotos nem contrato, e sem elas o Projeto Visual abre vazio),
`docs/checklist-pre-live.md` (T-7 até T-15min) e `docs/plano-b-live.md` (plano
A e B de cada bloco). No produto, `health.getEventReadiness` responde "este
evento está pronto para ser mostrado?" com número, não com promessa.

**Para OPERAR a campanha da live** — que é outro trabalho, feito antes e depois
dela: `docs/campanha-live-altar.md` (as doze etapas, os dez modelos de
mensagem, e o roteiro do primeiro contato até a assinatura). A tela é
`/campanha`, separada do Painel Admin porque "como vai o SaaS" e "com quem eu
falo agora" são perguntas diferentes.

**O que está pronto de verdade**: `docs/homologacao-pre-live.md` separa
CONSTRUÍDO de TESTADO de HOMOLOGADO, e lista o que só existe em teste. Nada da
rodada de campanha está homologado — homologação exige uma pessoa usando com
dado real.

**Por que o ALTAR não manda WhatsApp**: `docs/whatsapp-arquitetura.md`. A
camada de canal está pronta e o portão de saída está fechado por quatro travas
independentes. Os rascunhos da campanha vivem em outra tabela, sem caminho até
o outbox — de propósito.

**Para a reunião comercial**: `docs/demo-comercial.md` (roteiro de 7 e 20 min,
perguntas frequentes, checklist pré-Meet) e `docs/prontidao-comercial.md` (o
que pode e o que não pode ser mostrado hoje).

**Como o produto se apresenta**: `docs/experiencia-visual.md` — o sistema
visual dos seis documentos, a diferença CLIENTE/EQUIPE/INTERNO, referência x
resultado, ambientes, custo de imagem e as decisões adiadas.

**Se alguém pedir os próprios dados**: `docs/portabilidade-dados.md` — o que
sai hoje (os PDFs, evento por evento), o que exigiria implementação, e por que
o arquivo no storage é a parte difícil. É mapa, não plano.

**Antes de decidir o que construir**: `docs/estado-do-produto.md` (o que existe,
com que qualidade, e o que cresce com o uso). A pergunta de segunda pessoa na
conta está medida, e só medida, em `docs/arquitetura-multiusuario.md` — ela
**não** autoriza reintroduzir `organizationId` (ver §1).

---

## 5. Regras de segurança

Estas não são preferências. Cada uma existe por causa de um defeito real.

1. **Toda função pública passa por um guarda.** Nada de `ctx.db` sem antes
   `requireUser`, `requireEventOwner`, `requireLeadOwner` (`convex/lib/identity.ts`),
   `requireAdmin` (`convex/lib/adminGuard.ts`) ou `requirePlatformOwner`
   (`convex/lib/platformGuard.ts`).
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
7. **Documento de cliente não se filtra na tela.** O que sai para a cliente é
   CONSTRUÍDO campo a campo por `paraOCliente` (`convex/lib/propostaComercial.ts`),
   nunca espalhado do registro do banco. Custo, margem e fornecedor não ficam
   escondidos na renderização — eles não existem no objeto que sai. A
   pré-visualização e o PDF consomem o MESMO objeto, e o Orçamento, que é
   interno, diz isso no título, no rodapé e no nome do arquivo.
   A mesma disciplina vale para as **flores e materiais do Projeto Visual**
   (`convex/lib/materiaisDoProjeto.ts`): a linha consolidada da Ficha Técnica
   carrega custo, margem e cobertura, e a tela que ela vira para a noiva lê uma
   consulta própria — `fichaTecnica.materiaisParaOProjeto` —, nunca `getFicha`.
8. **Exclusão apaga mesmo.** `convex/lib/cascade.ts` é a fonte única: some a
   linha, somem os filhos e somem os arquivos no storage. Tabela nova com
   `eventId` que não entrar ali quebra `cascade.test.ts`.
9. **Administrar o NEGÓCIO e administrar uma EMPRESA CLIENTE são permissões
   diferentes.** `platformOwner` (`convex/lib/platformGuard.ts`) abre o
   Escritório ALTAR, e **ninguém o ganha por inferência**: nem `role: "admin"`,
   nem `accessType: "internal"` ou `"beta"`, nem ser dona do próprio tenant —
   os dois últimos são isenções de cobrança, não poder. A concessão é um ato
   explícito (`internal.admin.grantPlatformOwnerByEmail`), sem nome nem e-mail
   escrito no código. `escritorio.fronteiras.test.ts` e
   `src/lib/duas-camadas-de-ia.test.ts` atacam a fronteira de propósito.

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
- **Número que veio de formulário é conferido no servidor.** `parseFloat`
  devolve `NaN` para o que não começa com número, e um `NaN` gravado não
  estraga a própria linha: estraga toda soma que a incluir, para sempre. A
  leitura do que a pessoa digitou é de `src/lib/valor-digitado.ts` ("1.500,00"
  é mil e quinhentos) e a trava é de `convex/lib/dinheiro.ts`. Dinheiro soma
  por `somaEmDinheiro`, nunca por `reduce` cru — `0.1 + 0.2` não é `0.3`.
- **Comentário explica o PORQUÊ.** O código já diz o quê. Os comentários deste
  repositório guardam a decisão e o defeito que a motivou — mantenha o padrão.
- Português nos nomes de domínio novos; o que já está em inglês continua.

---

## 7. Como testar

```bash
pnpm test                                   # tudo
npx vitest run --project convex             # só backend
npx vitest run --project frontend           # só telas e libs puras
npx vitest run --project scripts            # só os scripts de homologação
npx vitest run convex/central.inbox.test.ts # um arquivo
```

Três projetos no mesmo comando: `convex` roda em edge-runtime com
`convex-test` (banco de verdade, em memória), `frontend` roda em jsdom e
`scripts` roda em node, para as travas da homologação.

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
