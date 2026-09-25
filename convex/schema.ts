import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ── CENTRAL DE COMUNICAÇÕES ─────────────────────────────────────────────────
// Os validadores vivem em convex/lib/central/validadores.ts — fonte única,
// importada também pelas queries, mutations e actions da Central. Duplicá-los
// aqui criaria a chance de o schema e as funções divergirem em silêncio.
import {
  categoriaValidator as categoriaCentral,
  channelValidator as channel,
  departamentoValidator as departamentoCentral,
  desfechoValidator as desfechoDeIntegracao,
  direcaoValidator as direcaoDeMensagem,
  nivelDeAutonomiaValidator as nivelDeAutonomia,
  prioridadeValidator as prioridadeCentral,
  propostaValidator as propostaDeAprovacao,
  severidadeValidator as severidadeDeSinal,
  statusDeAprovacaoValidator as statusDeAprovacao,
  statusDeConversaValidator as statusDeConversa,
  statusDeEntregaValidator as statusDeEntrega,
  statusDeSinalValidator as statusDeSinal,
  statusDeTrabalhoValidator as statusDeTrabalho,
  tipoDeContatoValidator as tipoDeContato,
  tipoDeMensagemValidator as tipoDeMensagemCentral,
  tipoDeSinalValidator as tipoDeSinal,
  tipoDeTrabalhoValidator as tipoDeTrabalho,
  verticalValidator as vertical,
} from "./lib/central/validadores";


// ─── Enum-like validators (mirror the unions used in the function args/frontend) ──
const eventType = v.union(
  v.literal("wedding"),
  v.literal("corporate"),
  v.literal("birthday"),
  v.literal("debutante"),
  v.literal("baptism"),
  v.literal("other"),
);

const eventStatus = v.union(
  v.literal("planning"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);

// Estagios do funil. Os quatro originais NAO mudaram de nome nem de
// significado — os tres do meio foram ACRESCENTADOS, entao todo lead ja
// gravado continua valido sem backfill.
//   contact    = Novo contato        (original)
//   contacted  = Contato realizado   (novo)
//   meeting    = Reuniao agendada    (novo)
//   quote_sent = Orcamento enviado   (original)
//   negotiating= Negociacao          (novo)
//   contracted = Fechado             (original)
//   discarded  = Perdido             (original)
const leadStage = v.union(
  v.literal("contact"),
  v.literal("contacted"),
  v.literal("meeting"),
  v.literal("quote_sent"),
  v.literal("negotiating"),
  v.literal("contracted"),
  v.literal("discarded"),
);

// Tipos de documento que nascem na negociacao, antes de existir evento.
const leadDocumentType = v.union(
  v.literal("proposta"),
  v.literal("contrato"),
  v.literal("comprovante"),
  v.literal("referencia"),
  v.literal("outro"),
);

// ── FICHA TÉCNICA ───────────────────────────────────────────────────────────
// Valores espelhados de lib/materiais.ts. O Convex exige literais estáticos no
// validador, e um teste estrutural falha se as listas divergirem.
const unidadeDeMaterial = v.union(
  v.literal("un"),
  v.literal("haste"),
  v.literal("maco"),
  v.literal("duzia"),
  v.literal("caixa"),
  v.literal("pacote"),
  v.literal("rolo"),
  v.literal("m"),
  v.literal("m2"),
  v.literal("kg"),
  v.literal("l"),
);

const tipoDeMaterial = v.union(
  v.literal("consumivel"),
  v.literal("reutilizavel"),
  v.literal("locacao"),
  v.literal("compra_especifica"),
);

/**
 * Uma linha de receita. Usada nos DOIS lados:
 *
 *  · na biblioteca (`compositions.receita`) — a receita mestre, editável;
 *  · no evento (`assemblyItems.receita`)    — o SNAPSHOT, congelado.
 *
 * O mesmo formato de propósito: aplicar uma composição da biblioteca é copiar
 * o array. Mudar a receita mestre depois NÃO mexe no evento (ver MASTER #6,
 * seção "snapshot"), e é o que protege o histórico de quem já executou.
 *
 * `nome`, `unidade` e `tipo` são COPIADOS junto com o `materialId`: o material
 * pode ser renomeado ou excluído do catálogo, e a ficha de um evento passado
 * continua legível. Mesmo princípio de `assemblyItems.supplierName`.
 */
const componenteDaReceita = v.object({
  materialId: v.optional(v.id("materials")),
  nome: v.string(),
  unidade: unidadeDeMaterial,
  quantidade: v.number(),
  tipo: v.optional(tipoDeMaterial),
  /** Categoria copiada do catalogo — agrupa o consolidado no PDF e na tela. */
  categoria: v.optional(v.string()),
  /** Custo de referência por unidade no momento da cópia. SÓ estimativa. */
  custoReferencia: v.optional(v.number()),
  /**
   * Margem de segurança em PERCENTUAL, copiada do catálogo junto com o resto.
   *
   * SNAPSHOT pelo mesmo motivo que o nome e a unidade: se ficasse só no
   * catálogo, mudar a margem padrão da rosa hoje mudaria a sugestão de um
   * evento executado ha seis meses — o papel impresso na epoca diria uma coisa
   * e a tela outra, sem ninguem ter mexido naquele evento.
   *
   * AUSENTE = sem margem. `0` e margem CONFIGURADA e vale zero.
   */
  margemPercentual: v.optional(v.number()),
  notes: v.optional(v.string()),
});

/** Tipos de ajuste de estoque — a lista vive em lib/ajusteDeAcervo.ts. */
const tipoDeAjusteDeAcervo = v.union(
  v.literal("entrada"),
  v.literal("perda"),
  v.literal("quebra"),
  v.literal("avaria"),
  v.literal("descarte"),
  v.literal("acerto_inventario"),
);

const txType = v.union(v.literal("income"), v.literal("expense"));

// ── COMPROVANTE DE UM LANCAMENTO ────────────────────────────────────────────
// Evidencia do pagamento: o PDF do PIX, a foto do recibo, o print da
// transferencia. Mora NO lancamento, como `assemblyItems.receita` mora no
// item — nao ha tabela filha, e por isso nao ha id proprio que o navegador
// pudesse mandar para alcancar o comprovante de outra conta.
//
// `filename` e `contentType` sao SNAPSHOT do que ela enviou: o storage nao
// guarda nome, e sem isso a lista mostraria um identificador no lugar de
// "pix-outubro.pdf".
const comprovanteFinanceiro = v.object({
  storageId: v.id("_storage"),
  filename: v.string(),
  /** MIME declarado pelo navegador. Ausente = tipo desconhecido, nao invente. */
  contentType: v.optional(v.string()),
  uploadedAt: v.string(),
});

const checklistPhase = v.union(v.literal("pre"), v.literal("post"));

const photoCategory = v.union(
  v.literal("antes"),
  v.literal("montagem"),
  v.literal("evento"),
  v.literal("desmontagem"),
);

// Interpretação estrutural de um croqui (IA Visual). `elementos` carrega a
// CONTAGEM que precisa ser preservada no render (12 mesas continuam 12 mesas).
// `tipo` é texto livre justamente para caber mesa/cadeira/palco/bar/pista/
// lounge/buffet/altar/entrada/estrutura sem engessar o schema.
const layoutInterpretation = v.object({
  ambientes: v.array(v.string()),
  elementos: v.array(
    v.object({
      tipo: v.string(),
      quantidade: v.number(),
      observacao: v.optional(v.string()),
    }),
  ),
  circulacao: v.optional(v.string()),
  acessos: v.optional(v.string()),
  observacoes: v.optional(v.string()),
});

// All briefing fields are optional free-text (kept in sync with convex/briefing.ts)
const briefingFields = {
  guestCount: v.optional(v.string()),
  theme: v.optional(v.string()),
  ceremonyTime: v.optional(v.string()),
  receptionTime: v.optional(v.string()),
  venueContact: v.optional(v.string()),
  venueRules: v.optional(v.string()),
  colorPalette: v.optional(v.string()),
  decorStyle: v.optional(v.string()),
  referenceImages: v.optional(v.string()),
  atmosphereDescription: v.optional(v.string()),
  tableClothColor: v.optional(v.string()),
  napkinStyle: v.optional(v.string()),
  centerpiece: v.optional(v.string()),
  ceremony_arch: v.optional(v.string()),
  aisle_decor: v.optional(v.string()),
  flowerTypes: v.optional(v.string()),
  flowerColors: v.optional(v.string()),
  bouquetStyle: v.optional(v.string()),
  boutonniere: v.optional(v.string()),
  flowerSupplier: v.optional(v.string()),
  flowerBudget: v.optional(v.string()),
  corsage: v.optional(v.string()),
  flowersNotes: v.optional(v.string()),
  guestTableType: v.optional(v.string()),
  guestTableCount: v.optional(v.string()),
  guestChairType: v.optional(v.string()),
  guestChairCount: v.optional(v.string()),
  sweetTableIncluded: v.optional(v.string()),
  sweetTableStyle: v.optional(v.string()),
  loungeIncluded: v.optional(v.string()),
  loungeDescription: v.optional(v.string()),
  signTable: v.optional(v.string()),
  furnitureSupplier: v.optional(v.string()),
  furnitureNotes: v.optional(v.string()),
  lightingType: v.optional(v.string()),
  lightingEffects: v.optional(v.string()),
  uplighting: v.optional(v.string()),
  stringLights: v.optional(v.string()),
  candleUse: v.optional(v.string()),
  lightingSupplier: v.optional(v.string()),
  lightingNotes: v.optional(v.string()),
  cakeSupplier: v.optional(v.string()),
  cakeFlavor: v.optional(v.string()),
  cakeLayers: v.optional(v.string()),
  cakeDesign: v.optional(v.string()),
  sweetsIncluded: v.optional(v.string()),
  sweetsDescription: v.optional(v.string()),
  weddingFavors: v.optional(v.string()),
  drinkService: v.optional(v.string()),
  cakeNotes: v.optional(v.string()),
  generalNotes: v.optional(v.string()),
  specialRequests: v.optional(v.string()),
  restrictions: v.optional(v.string()),
  vendorContacts: v.optional(v.string()),
  setupTime: v.optional(v.string()),
  teardownTime: v.optional(v.string()),
  parkingInfo: v.optional(v.string()),
  accessibilityNeeds: v.optional(v.string()),
  insuranceInfo: v.optional(v.string()),
  emergencyContact: v.optional(v.string()),
  otherNotes: v.optional(v.string()),
} as const;


export default defineSchema({
  // Usuários — modelo por-usuário (Arquitetura A). Assinatura vive no próprio usuário.
  users: defineTable({
    name: v.string(),
    email: v.string(),
    // Identidade Better Auth (novo modelo — id do usuário no componente de auth)
    betterAuthId: v.optional(v.string()),
    // Legado Hercules/OIDC — será removido na fase final da migração
    tokenIdentifier: v.optional(v.string()),
    role: v.string(), // 'admin' | 'user'
    subscriptionStatus: v.string(), // 'trial' | 'active' | 'expired' | 'cancelled'
    trialStartDate: v.optional(v.string()),
    trialEndDate: v.optional(v.string()),
    onboardingCompleted: v.optional(v.boolean()),
    // Perfil / configurações
    phone: v.optional(v.string()),
    studioName: v.optional(v.string()),
    cpfCnpj: v.optional(v.string()),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    // ── Identidade da empresa nos DOCUMENTOS ────────────────────────────────
    // `studioName`, `logoStorageId`, `phone`, `email` e `cpfCnpj` ja existiam e
    // NAO foram duplicados. So o que faltava entra aqui, tudo opcional.
    // Alimenta os PDFs gerados; a INTERFACE do ALTAR continua com a identidade
    // do ALTAR — nao ha white-label de tela.
    instagram: v.optional(v.string()),
    website: v.optional(v.string()),
    /** Cor principal dos documentos, "#RRGGBB". Invalida cai no padrao ALTAR. */
    brandColor: v.optional(v.string()),
    /** Cor de apoio, usada com moderacao. */
    brandAccentColor: v.optional(v.string()),
    // Integração Asaas (assinatura)
    asaasCustomerId: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    subscriptionExpiresAt: v.optional(v.string()),
    // Epoch ms do PRIMEIRO aviso de atraso do Asaas. É o que dá fim ao período
    // de tolerância da inadimplência (lib/access.ts). Zerado quando o pagamento
    // entra. Ausente = tolerância não começou a correr (cadastros anteriores a
    // esta regra continuam liberados até o próximo aviso de atraso).
    overdueSince: v.optional(v.number()),
    // Epoch ms do último acesso ao app. Gravado no MÁXIMO uma vez a cada
    // LAST_SEEN_THROTTLE_MS (lib/presence.ts) — não é um contador de cliques.
    // Ausente = nunca acessou desde que a medição existe (cadastros antigos).
    lastSeenAt: v.optional(v.number()),
    // ── Tipo de acesso (independente do estado de cobrança) ──────────────────
    // AUSENTE = "client" — é o que todos os usuários atuais são, sem migração.
    //   client   → comportamento normal (trial → paywall → Asaas)
    //   beta     → acesso liberado até accessExpiresAt; depois volta a client
    //   internal → acesso permanente, nunca cobra, fora das métricas de receita
    accessType: v.optional(
      v.union(v.literal("client"), v.literal("beta"), v.literal("internal")),
    ),
    // Epoch ms. Só tem efeito quando accessType === "beta".
    accessExpiresAt: v.optional(v.number()),
    /**
     * DONO DA PLATAFORMA — quem administra o negócio ALTAR.
     *
     * ── TRÊS CONCEITOS QUE NÃO PODEM SE MISTURAR ────────────────────────────
     *   platformOwner  → administra o SaaS ALTAR. Hoje: uma conta só.
     *   role: "admin"  → opera o painel e a Central (suporte, cobrança).
     *   a decoradora   → administra a EMPRESA DELA dentro do ALTAR.
     *
     * O terceiro é dono de tudo que é dele e de nada que seja do ALTAR. O
     * segundo já existia e é mais amplo do que o primeiro precisa ser: um dia
     * haverá alguém de suporte com `role: "admin"` que não deve enxergar
     * métricas de receita nem a ferramenta interna de IA.
     *
     * ── NINGUÉM GANHA ISTO POR INFERÊNCIA ───────────────────────────────────
     * AUSENTE = false, e é o estado de TODAS as contas — inclusive as que têm
     * `role: "admin"`, `accessType: "internal"` ou `beta`. Nenhuma dessas
     * promove ninguém: são estados de COBRANÇA e de SUPORTE, não de posse da
     * plataforma.
     *
     * Não há nome, e-mail ou identidade pessoal em lugar nenhum do código. A
     * concessão é um ato explícito e deliberado —
     * `admin.grantPlatformOwnerByEmail`, uma `internalMutation` que só roda
     * pelo painel do Convex, por quem já tem acesso ao deployment.
     */
    platformOwner: v.optional(v.boolean()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_better_auth_id", ["betterAuthId"])
    .index("by_email", ["email"])
    .index("by_asaas_customer", ["asaasCustomerId"])
    .index("by_asaas_subscription", ["asaasSubscriptionId"])
    // Quem OPERA o ALTAR. Sem este índice, achar os administradores era varrer
    // a tabela de assinantes e filtrar na memória — com um teto de 500 ou 1.000
    // linhas que, passado o milésimo cadastro, deixaria administradores de fora
    // do aviso da Central em silêncio.
    .index("by_role", ["role"])
    // Busca por nome na hora de vincular um contato da Central a um assinante.
    // Índice de LEITURA sobre um campo que já existe: nenhum campo novo,
    // nenhum backfill e nada do caminho de cobrança é tocado.
    .searchIndex("search_name", { searchField: "name" }),

  // ── REGISTRO DOS AVISOS DO ASAAS ─────────────────────────────────────────
  //
  // Existe por causa de um caso real: um pagamento confirmado não ativou a
  // assinatura, e não havia COMO saber se o aviso tinha chegado. A pergunta
  // "o webhook chegou?" era impossível de responder.
  //
  // Guarda só o necessário para auditar e para não processar o mesmo aviso
  // duas vezes. NÃO guarda o payload completo nem nada de cartão.
  asaasWebhookEvents: defineTable({
    /** Identifica UM aviso. Segunda chegada da mesma chave não reprocessa. */
    dedupKey: v.string(),
    event: v.string(),
    receivedAt: v.number(),
    /** "applied" | "duplicate" | "no_match" | "ignored" | "error" */
    outcome: v.string(),
    /** Por qual chave o usuário foi encontrado: externalReference/subscription/customer. */
    matchedBy: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    asaasCustomerId: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    asaasPaymentId: v.optional(v.string()),
    value: v.optional(v.number()),
    /** Detalhe curto para diagnóstico. Nunca dado sensível. */
    detail: v.optional(v.string()),
  })
    .index("by_dedup_key", ["dedupKey"])
    .index("by_received_at", ["receivedAt"])
    .index("by_outcome", ["outcome"]),

  events: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: eventType,
    date: v.string(),
    location: v.string(),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    status: eventStatus,
    notes: v.optional(v.string()),
    // ── QUEM RESPONDE POR ESTE EVENTO ───────────────────────────────────────
    // Antes, o cartao do evento mostrava o PRIMEIRO membro escalado como
    // "Resp." — ninguem escolheu essa pessoa, ela so foi adicionada primeiro.
    // AUSENTE = ninguem escolheu; a regra em lib/responsavel.ts decide o que
    // dizer (e prefere nao dizer nada a eleger alguem).
    responsibleId: v.optional(v.id("teamMembers")),
    responsible: v.optional(v.string()),
    /**
     * A foto que abre o Projeto Visual — ESCOLHIDA por ela, nunca deduzida.
     *
     * AUSENTE = sem capa, e a tela abre com a capa tipográfica. Não há
     * backfill, não há "a primeira foto" e não há IA: a capa de um casamento
     * é decisão da decoradora, e um `[0]` seria uma regra inventada em
     * silêncio (a mesma armadilha que `projectScope` evita ao não promover
     * foto sem classificação a referência).
     *
     * É um PONTEIRO para a linha da galeria, não uma cópia e não um
     * `storageId`: o arquivo continua sendo um só, e a capa herda ambiente,
     * legenda e classificação da foto. Mesma forma de `responsibleId` acima.
     *
     * Ponteiro para foto apagada NÃO é estado válido: `gallery.deletePhoto`
     * limpa a capa antes de apagar. A leitura ainda degrada para "sem capa"
     * se um ponteiro velho sobreviver — a regra 3 de `lib/responsavel.ts`.
     */
    coverPhotoId: v.optional(v.id("eventPhotos")),
    /**
     * Ultima vez que ALGUEM MEXEU neste registro dentro do ALTAR.
     *
     * AUSENTE = registro anterior a este campo; a leitura cai em
     * `_creationTime` (lib/ultimaAtualizacao.ts). Nao houve backfill e
     * nenhuma data e inventada.
     *
     * NAO e contato com o cliente: quem responde por isso continua sendo
     * `leads.lastInteraction`.
     */
    updatedAt: v.optional(v.string()),
    // Importação do contrato por IA (status + pendências identificadas no doc).
    contractAnalyzedAt: v.optional(v.string()),
    contractPendings: v.optional(v.array(v.string())),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"]),

  leads: defineTable({
    userId: v.id("users"),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    stage: leadStage,
    notes: v.optional(v.string()),
    order: v.number(),
    convertedEventId: v.optional(v.id("events")),
    // ── Comercial (tudo OPCIONAL e aditivo) ─────────────────────────────────
    // Reaproveitados na conversao em evento, para nao redigitar o que a
    // decoradora ja anotou durante a negociacao.
    /**
     * LEGADO. Nunca foi escrito por tela nenhuma e nunca foi lido por nada.
     *
     * Entrou no schema junto com os outros campos comerciais e ficou órfão: a
     * auditoria da jornada encontrou o campo aceito por `funil.create` e
     * `funil.updateLead`, gravável pela API, e sem um único consumidor. Um
     * campo assim é pior que ausência — a próxima pessoa liga um formulário
     * nele e passa uma semana procurando por que o dado não aparece.
     *
     * Os argumentos saíram das mutations, que é o que fechava a porta. O CAMPO
     * fica: remover do schema invalidaria qualquer documento que já o tivesse
     * gravado, e este ambiente não tem como conferir a base. Removê-lo é uma
     * decisão para quem puder olhar os dados.
     *
     * O segundo nome de um casal não some do produto por causa disto: o nome
     * do evento ("Marina & Gabriel") sempre foi quem carregou os dois, e é ele
     * que sai na capa do Projeto Visual.
     */
    partnerName: v.optional(v.string()),
    venue: v.optional(v.string()),
    city: v.optional(v.string()),
    guestCount: v.optional(v.number()),
    /** Como chegou: indicacao, Instagram, site, feira... texto livre. */
    source: v.optional(v.string()),
    responsible: v.optional(v.string()),
    /** Vinculo com a equipe. O texto acima continua valendo como anotacao. */
    responsibleId: v.optional(v.id("teamMembers")),
    /** "AAAA-MM-DD" da ultima conversa. Sem ela nao se afirma abandono. */
    lastInteraction: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    /**
     * Ultima vez que ALGUEM MEXEU neste registro dentro do ALTAR.
     *
     * AUSENTE = registro anterior a este campo; a leitura cai em
     * `_creationTime` (lib/ultimaAtualizacao.ts). Nao houve backfill e
     * nenhuma data e inventada.
     *
     * NAO e contato com o cliente: quem responde por isso continua sendo
     * `leads.lastInteraction`.
     */
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_stage", ["userId", "stage"]),

  // ── PROPOSTA COMERCIAL ────────────────────────────────────────────────────
  // O documento que a decoradora MANDA para a cliente.
  //
  // Distinto de `budgetItems`, que é o orçamento INTERNO: aquele traz custo,
  // lucro e margem e existe para a reunião dela; este traz escopo e
  // investimento e existe para a reunião com a cliente. Os dois convivem, e a
  // fronteira entre eles vive em `lib/propostaComercial.ts` — na
  // TRANSFORMAÇÃO, não na tela.
  //
  // ── POR QUE NÃO REAPROVEITAR `budgetItems` ───────────────────────────────
  // Porque o que a cliente lê não é um recorte do que a decoradora calcula.
  // Ela vende "Projeto floral da cerimônia — R$ 38.000", e por trás disso há
  // dezoito linhas de custo que a cliente não vai ver e não deve ver. Derivar
  // uma coisa da outra amarraria as duas para sempre e faria toda mudança de
  // preço interno mexer no documento já enviado.
  //
  // ── A PROPOSTA NASCE DE UM LEAD OU DE UM EVENTO ──────────────────────────
  // Antes do fechamento ela pende do LEAD (ainda não há evento); depois, do
  // EVENTO. Os dois são opcionais e pelo menos um está presente — a mutation
  // exige. Ausentes os dois, a proposta não teria de quem falar.
  proposals: defineTable({
    userId: v.id("users"),
    leadId: v.optional(v.id("leads")),
    eventId: v.optional(v.id("events")),

    titulo: v.string(),
    /** Texto de abertura: o conceito, o que ela entendeu do desejo da cliente. */
    apresentacao: v.optional(v.string()),

    /** Para quem é. Copiado do lead/evento na criação e editável depois. */
    clienteNome: v.string(),
    eventoTipo: v.optional(v.string()),
    eventoData: v.optional(v.string()),
    eventoLocal: v.optional(v.string()),
    eventoConvidados: v.optional(v.number()),

    /**
     * O escopo como a CLIENTE lê: descrição e valor.
     *
     * Não há custo, quantidade de insumo nem fornecedor aqui — de propósito.
     * "Projeto floral da cerimônia" é uma linha; as dezoito compras que a
     * sustentam vivem em `purchaseItems`, e não têm por que aparecer.
     */
    itens: v.array(
      v.object({
        descricao: v.string(),
        detalhe: v.optional(v.string()),
        valor: v.number(),
      }),
    ),

    /** Texto livre: a decoradora escreve a condição que ela pratica. */
    condicoesPagamento: v.optional(v.string()),
    /** "AAAA-MM-DD". Vencimento é DERIVADO daqui — nunca um status gravado. */
    validadeAte: v.optional(v.string()),
    observacoes: v.optional(v.string()),

    status: v.union(
      v.literal("rascunho"),
      v.literal("enviada"),
      v.literal("aceita"),
      v.literal("recusada"),
    ),

    /**
     * O que foi enviado, congelado no momento do envio.
     *
     * Sem isto, editar o valor depois de enviar mudaria em silêncio o
     * significado de uma proposta que a cliente já tem na mão — e ninguém
     * conseguiria dizer qual versão ela recebeu.
     *
     * É a mesma solução que a receita do item de montagem já usa: cópia é o
     * versionamento. Sem tabela de versões, sem diff, sem migração.
     *
     * AUSENTE = nunca foi enviada.
     */
    versaoEnviada: v.optional(
      v.object({
        enviadaEm: v.string(),
        titulo: v.string(),
        investimento: v.number(),
        itens: v.array(
          v.object({
            descricao: v.string(),
            detalhe: v.optional(v.string()),
            valor: v.number(),
          }),
        ),
        condicoesPagamento: v.optional(v.string()),
        validadeAte: v.optional(v.string()),
      }),
    ),

    /** Quem decidiu e quando. Registro humano, não assinatura. */
    decididaEm: v.optional(v.string()),
    decididaPor: v.optional(v.string()),
    /** Por que foi recusada, quando ela quis registrar. */
    motivoDaRecusa: v.optional(v.string()),

    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_lead", ["leadId"])
    .index("by_event", ["eventId"]),

  // ── DOCUMENTOS DO LEAD (comercial) ────────────────────────────────────────
  // A negociacao gera arquivos ANTES de existir evento: proposta enviada,
  // contrato assinado, comprovante do sinal, referencias que a cliente mandou
  // no WhatsApp. Ate aqui esses arquivos so tinham onde morar depois da
  // conversao (tabela `contracts`, que exige eventId) — na pratica ficavam no
  // celular da decoradora e sumiam.
  //
  // Tabela separada de `contracts` de proposito: o dono aqui e o LEAD, que
  // pode nunca virar evento. Converter o lead NAO move nem copia arquivo — o
  // lead sobrevive a conversao e continua sendo a origem deles (ver
  // `leadDocuments.listForEvent`).
  leadDocuments: defineTable({
    userId: v.id("users"),
    /**
     * Lead de origem. OPCIONAL porque o documento SOBREVIVE ao lead: quando um
     * lead ja convertido e excluido, o vinculo migra para o evento (abaixo) em
     * vez de o arquivo ser destruido. Um contrato assinado nao pode sumir
     * porque a decoradora arrumou o funil.
     */
    leadId: v.optional(v.id("leads")),
    /**
     * Evento que herdou o documento quando o lead de origem foi excluido.
     * AUSENTE enquanto o lead existe — a origem continua sendo ele.
     * Exatamente um dos dois esta presente.
     */
    eventId: v.optional(v.id("events")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    /** Tipo do documento. AUSENTE = nao classificado; nada e presumido. */
    documentType: v.optional(leadDocumentType),
    /** Metadados do arquivo, quando o navegador informou. Nunca obrigatorios. */
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    uploadedAt: v.string(),
  })
    .index("by_lead", ["leadId"])
    .index("by_event", ["eventId"])
    .index("by_user", ["userId"]),

  briefings: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    ...briefingFields,
  })
    .index("by_event", ["eventId"])
    // A lista de eventos precisa da saúde de TODOS os eventos da conta. Sem
    // este índice, a resposta era uma consulta por evento — 40 eventos viravam
    // centenas de operações para desenhar uma tela. Ver lib/saudeDoEvento.ts.
    .index("by_user", ["userId"]),

  checklistItems: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    phase: checklistPhase,
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    notes: v.optional(v.string()),
    order: v.number(),
    isChecked: v.boolean(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_phase", ["eventId", "phase"])
    // O painel de atenção do Dashboard pergunta "o que falta em TODOS os meus
    // eventos?". Sem este índice, a resposta era uma consulta por evento — e o
    // Dashboard é a primeira tela que ela abre, todo dia.
    .index("by_user", ["userId"]),

  teamMembers: defineTable({
    userId: v.id("users"),
    name: v.string(),
    role: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  eventTeam: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    teamMemberId: v.id("teamMembers"),
    scheduledTime: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_member", ["eventId", "teamMemberId"])
    // Excluir um membro precisa achar TODAS as escalas dele, em qualquer
    // evento — sem este indice a exclusao varreria a tabela inteira.
    .index("by_member", ["teamMemberId"])
    // A lista de eventos precisa da saúde de TODOS os eventos da conta. Sem
    // este índice, a resposta era uma consulta por evento — 40 eventos viravam
    // centenas de operações para desenhar uma tela. Ver lib/saudeDoEvento.ts.
    .index("by_user", ["userId"]),

  // Documentos do evento (contrato, adendo, orçamento, referência, outros).
  // `kind` ausente = contrato legado (compatibilidade com dados existentes).
  // A "Pasta do Evento" está COMPLETA: a tela oferece os cinco tipos
  // (event-documents.tsx). Este comentário dizia o contrário e ficou velho —
  // e um comentário velho faz reimplementar o que já existe.
  contracts: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    filename: v.string(),
    uploadedAt: v.string(),
    /**
     * De QUEM é este documento, quando ele é de alguém.
     *
     * ── POR QUE AQUI, E NÃO NUMA TABELA NOVA ────────────────────────────────
     * A Pasta do Evento já resolve documento bem: um lugar, um caminho de
     * envio, uma exclusão, e ela já funde `contracts` com os documentos
     * herdados do lead. Criar um segundo gerenciador só para o fornecedor
     * seria o erro que este repositório já cometeu três vezes.
     *
     * O que faltava era uma ETIQUETA. Com ela, a ficha da Móveis Bella passa a
     * responder "o que foi contratado + quais documentos existem + quais itens
     * ele entrega" sem nenhuma estrutura nova.
     *
     * AUSENTE = documento do EVENTO, não de um fornecedor — que é o estado de
     * todos os documentos já enviados. Sem backfill.
     *
     * Aponta para `eventSuppliers` (o fornecedor NESTE evento), como
     * `assemblyItems.supplierId` — e não para o catálogo: um orçamento é
     * daquele casamento, não da empresa em geral.
     */
    supplierId: v.optional(v.id("eventSuppliers")),
    kind: v.optional(
      v.union(
        v.literal("contract"),
        v.literal("addendum"),
        v.literal("budget"),
        v.literal("reference"),
        v.literal("other"),
      ),
    ),
  })
    .index("by_event", ["eventId"])
    // A lista de eventos precisa da saúde de TODOS os eventos da conta. Sem
    // este índice, a resposta era uma consulta por evento — 40 eventos viravam
    // centenas de operações para desenhar uma tela. Ver lib/saudeDoEvento.ts.
    .index("by_user", ["userId"]),

  purchaseItems: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplier: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
    isPurchased: v.boolean(),
    order: v.number(),
    // ── Operacional (tudo OPCIONAL e aditivo) ───────────────────────────────
    // `isPurchased` continua sendo a verdade sobre "ja foi comprado?" — lido
    // pelo Resumo Operacional, Dashboard e notificacoes. `status` e a leitura
    // fina por cima dele, e as duas sao mantidas coerentes na gravacao
    // (lib/purchaseStatus.ts). AUSENTE = derivado de `isPurchased`.
    status: v.optional(
      v.union(
        v.literal("necessidade"),
        v.literal("cotacao"),
        v.literal("aprovado"),
        v.literal("comprado"),
        v.literal("recebido"),
        v.literal("cancelado"),
      ),
    ),
    // Quem esta tocando este item. Texto livre: pode ser alguem de fora da
    // tabela `teamMembers` (a propria decoradora, um socio). Continua valendo
    // como anotacao mesmo depois do vinculo abaixo — ver lib/responsavel.ts.
    responsible: v.optional(v.string()),
    /** Vinculo com a equipe cadastrada. AUSENTE = so a anotacao livre. */
    responsibleId: v.optional(v.id("teamMembers")),
    // Vinculo com o catalogo central. `supplier` (texto) continua existindo
    // como historico do que valia quando o item foi cadastrado.
    supplierId: v.optional(v.id("suppliers")),
    // "AAAA-MM-DD". So com ela o sistema pode afirmar atraso.
    dueDate: v.optional(v.string()),
    // ── O VÍNCULO COM O LIVRO-CAIXA ─────────────────────────────────────────
    // A compra é OPERACIONAL; `transactions` é o livro contábil. Este campo
    // diz qual lançamento nasceu desta compra — e é ele que impede a mesma
    // despesa de ser contada duas vezes: enquanto existir, lançar de novo
    // ATUALIZA o mesmo registro em vez de criar outro.
    //
    // Ausente = compra ainda não lançada. É o estado de toda compra que já
    // existe hoje, e continua válido: o custo dela aparece como "fora do
    // livro", não como erro.
    /**
     * Ultima vez que ALGUEM MEXEU neste registro dentro do ALTAR.
     *
     * AUSENTE = registro anterior a este campo; a leitura cai em
     * `_creationTime` (lib/ultimaAtualizacao.ts). Nao houve backfill e
     * nenhuma data e inventada.
     *
     * NAO e contato com o cliente: quem responde por isso continua sendo
     * `leads.lastInteraction`.
     */
    updatedAt: v.optional(v.string()),
    transactionId: v.optional(v.id("transactions")),
    // ── A PONTE COM A FICHA TÉCNICA (MASTER #6) ─────────────────────────────
    // NECESSIDADE ≠ COMPRA. A ficha diz "preciso de 185 rosas"; a compra diz
    // "vou comprar 200 da Flora Bela". Os dois números podem e devem divergir.
    //
    // `materialId` é o que torna a geração IDEMPOTENTE: gerar de novo encontra
    // a compra que já existe em vez de criar outra igual.
    materialId: v.optional(v.id("materials")),
    /**
     * Necessidade consolidada NO MOMENTO em que esta compra foi gerada.
     *
     * É um carimbo, não uma regra: se a ficha mudar de 185 para 210, a compra
     * NÃO é reescrita — a tela mostra "a necessidade mudou" e a decoradora
     * decide. Reescrever sozinho apagaria a negociação que ela já fez.
     */
    necessidadeTecnica: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_material", ["eventId", "materialId"])
    // Apagar um lancamento no Financeiro precisa achar a compra que aponta
    // para ele — sem este indice o vinculo ficaria apontando para o vazio.
    .index("by_transaction", ["transactionId"])
    // O panorama de compras lê TODAS as compras da empresa de uma vez (a
    // pergunta de segunda-feira: "o que resolvo esta semana?"). Sem este
    // indice a consulta varreria a tabela de todos os usuarios.
    .index("by_user", ["userId"])
    // "O que eu já comprei deste fornecedor?" é a pergunta que se faz antes de
    // ligar para ele. Sem o índice, a resposta exigiria varrer todas as
    // compras da empresa — que crescem a cada evento, para sempre.
    .index("by_supplier", ["supplierId"]),

  budgetItems: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    description: v.string(),
    category: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    type: txType,
    notes: v.optional(v.string()),
    order: v.number(),
  }).index("by_event", ["eventId"]),

  eventPhotos: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    /**
     * Versao LEVE da mesma foto (1400 px, JPEG), gerada no navegador no
     * momento do envio. Ver src/lib/imagem-reduzida.ts.
     *
     * AUSENTE = foto enviada antes desta rodada, ou formato que o navegador
     * nao decodificou (HEIC no Android), ou imagem ja pequena. A tela cai no
     * ORIGINAL e funciona igual — nao ha backfill e nada precisa ser
     * reprocessado para o produto funcionar.
     *
     * NUNCA substitui `storageId`: o arquivo que ela enviou continua inteiro.
     * O visualizador em tela cheia usa o original de proposito.
     */
    previewStorageId: v.optional(v.id("_storage")),
    filename: v.string(),
    // FASE do evento em que a foto foi tirada (antes/montagem/evento/
    // desmontagem). Eixo diferente de `projectScope`, abaixo.
    category: photoCategory,
    caption: v.optional(v.string()),
    order: v.number(),
    uploadedAt: v.string(),
    // ── O que esta imagem SIGNIFICA no projeto (opcional, aditivo) ──────────
    // A distincao existe para inspiracao nunca ser confundida com contratacao:
    //   incluso     - esta no projeto aprovado
    //   referencia  - imagem conceitual, NAO contratada
    //   nao_incluso - foi mostrado e ficou de fora
    // AUSENTE = nao classificada. Nenhum backfill: a tela mostra sem selo, e
    // nao inventa que a foto e um item contratado.
    projectScope: v.optional(
      v.union(
        v.literal("incluso"),
        v.literal("referencia"),
        v.literal("nao_incluso"),
      ),
    ),
    /** Ambiente a que a imagem se refere (cerimonia, mesa do bolo, bar...). */
    ambiente: v.optional(v.string()),
    /**
     * PARA QUEM esta foto pode aparecer.
     *
     * ── O EIXO QUE FALTAVA ───────────────────────────────────────────────────
     * `projectScope` responde "o que a imagem É no projeto" e `category`
     * responde "quando ela foi tirada". Nenhum dos dois responde "quem pode
     * ver" — e desde que existe um PDF que sai da empresa para os noivos, essa
     * pergunta precisa de resposta própria.
     *
     * Sem este campo, o documento usava `category === "antes"` como PROXY de
     * audiência. O proxy falha no caso que mais importa: a foto do problema —
     * o fornecedor mandou a cor errada, a peça chegou torta — é tirada ANTES
     * do evento, não tem classificação nenhuma, e ia impressa para a noiva.
     *
     * `assemblyItems.visibility` já existia com este papel. O vocabulário aqui
     * é o MESMO de propósito: item e foto respondem à mesma pergunta e
     * precisam usar as mesmas palavras nos documentos.
     *
     * ── AUSENTE = O COMPORTAMENTO DE HOJE ────────────────────────────────────
     * Ausente significa "nunca foi marcada como interna" — NÃO significa "ela
     * aprovou". A distinção importa: a foto continua passando pelos filtros de
     * escopo e fase como sempre passou, e este campo só acrescenta uma porta
     * de saída explícita.
     *
     * O contrário — ausente valendo "interno" — esvaziaria o documento de
     * todos os eventos que já existem. Trocar o padrão de um campo novo por
     * uma regressão silenciosa em dado antigo é exatamente o que "campo novo
     * nasce opcional" existe para impedir. Sem backfill.
     *
     * Sem `"equipe"`: nenhuma superfície distingue foto só-da-equipe hoje, e
     * alargar a união é aditivo no dia em que distinguir.
     */
    visibility: v.optional(v.union(v.literal("interno"), v.literal("cliente"))),
  })
    .index("by_event", ["eventId"])
    .index("by_event_category", ["eventId", "category"])
    // ── A GALERIA COMO ACERVO DA EMPRESA, NÃO ÁLBUM DO EVENTO ───────────────
    // Até aqui `eventPhotos` só sabia responder "as fotos DESTE casamento".
    // Cinco anos de trabalho ficavam em setenta álbuns lacrados: a decoradora
    // não tinha como achar o arco de oliveiras que fez em 2024 para mostrar à
    // cliente de hoje.
    //
    // O repositório já resolveu essa mesma pergunta três vezes para outras
    // entidades — `materials.ondeEUsado`, `compositions.ondeEUsada`,
    // `supplierCatalog.listEventsForSupplier`. Faltava para as imagens, que
    // são o ativo mais valioso de quem decora.
    .index("by_user", ["userId"])
    // ── DUAS LINHAS PODEM APONTAR PARA O MESMO ARQUIVO ──────────────────────
    // Reaproveitar uma foto em outro evento cria uma LINHA nova (que é dela,
    // com o ambiente e a classificação daquele evento) apontando para o
    // MESMO `storageId`. Nenhum byte é copiado.
    //
    // O preço disso é que apagar deixou de poder assumir posse exclusiva do
    // arquivo: sem este índice, excluir a foto de 2024 quebraria a de 2026 em
    // silêncio. Ver `arquivoAindaEmUso` em `lib/cascade.ts`.
    .index("by_user_storage", ["userId", "storageId"]),

  transactions: defineTable({
    userId: v.id("users"),
    eventId: v.optional(v.id("events")),
    type: txType,
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    /** VENCIMENTO. Quando foi pago de verdade e `paidAt`, abaixo. */
    date: v.string(),
    isPaid: v.boolean(),
    notes: v.optional(v.string()),
    /**
     * Quando o dinheiro entrou de verdade.
     *
     * AUSENTE = pago sem data informada, ou ainda nao pago. Nao ha backfill e
     * `togglePaid` NAO preenche sozinho: dar baixa hoje num PIX que caiu na
     * semana passada gravaria uma data errada, e data errada em financeiro e
     * pior que data ausente.
     *
     * `date` continua sendo o VENCIMENTO. Sao perguntas diferentes: "quando
     * era para entrar" e "quando entrou".
     */
    paidAt: v.optional(v.string()),
    /**
     * Forma de pagamento — TEXTO LIVRE, nao lista fechada.
     *
     * A leitura de contrato por IA (`ai.ts`) ja extrai este campo como texto
     * livre e o mostra na revisao; fechar um enum aqui contradiria o formato
     * que o produto ja produz — e deixaria de fora "permuta", "cheque" e o que
     * mais aparecer. A tela sugere as formas comuns sem impedir as outras.
     */
    paymentMethod: v.optional(v.string()),
    /**
     * Os comprovantes deste lancamento. AUSENTE = nenhum.
     *
     * ANEXAR COMPROVANTE NAO MARCA COMO PAGO: comprovante e evidencia,
     * `isPaid` e decisao dela. As duas coisas tem mutations separadas de
     * proposito.
     */
    comprovantes: v.optional(v.array(comprovanteFinanceiro)),
    /**
     * De qual COMPRA esta despesa nasceu. Só PROCEDÊNCIA HISTÓRICA.
     *
     * ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────
     * `purchaseItems.transactionId` é o vínculo OPERACIONAL: enquanto existe,
     * editar a compra atualiza a despesa. Cancelar a compra e escolher MANTER
     * a despesa desfaz esse vínculo de propósito — compra cancelada não pode
     * continuar comandando um lançamento.
     *
     * Só que, desfeito o vínculo, a despesa perdia também a informação de que
     * tinha nascido daquela compra. Sobrava R$ 12.400 no livro sem ninguém
     * conseguir dizer de onde vieram.
     *
     * ── POR QUE NÃO É SÓ UM ID ──────────────────────────────────────────────
     * O precedente do repositório é `assemblyItems.compositionId`, que guarda
     * procedência com um id e nenhuma leitura operacional. Aqui um id sozinho
     * não bastaria: o caminho "manter a despesa e excluir a compra" apaga a
     * linha apontada, e a procedência morreria junto — exatamente no caso em
     * que ela é mais necessária.
     *
     * Por isso o NOME vai junto, copiado no momento do lançamento. É a mesma
     * solução de `assemblyItems.supplierName` e de `componenteDaReceita.nome`:
     * cópia é o que mantém o histórico legível depois que a origem some.
     *
     * ── O QUE ELE NUNCA FAZ ─────────────────────────────────────────────────
     * Não recria vínculo, não é lido por cálculo nenhum, não é índice e não
     * reativa sincronização. AUSENTE = lançamento criado à mão no Financeiro,
     * ou anterior a este campo — que é o estado de todos os de hoje.
     */
    origemDaCompra: v.optional(
      v.object({
        /** Pode já não existir: a compra foi excluída e a despesa ficou. */
        purchaseItemId: v.optional(v.id("purchaseItems")),
        nome: v.string(),
        registradaEm: v.string(),
      }),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    // O painel da manhã pergunta "o que venceu e não foi liquidado?" a cada
    // abertura do Dashboard. Sem este índice a resposta exigia varrer TODO o
    // histórico financeiro da conta — que cresce para sempre — para achar um
    // punhado de linhas em aberto. Com ele, a consulta lê só o que está em
    // aberto e com data no passado.
    .index("by_user_pago_data", ["userId", "isPaid", "date"])
    .index("by_event", ["eventId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("event_soon"),
      v.literal("trial_expiring"),
      v.literal("purchase_pending"),
      v.literal("checklist_incomplete"),
      // ── Central de Comunicações (administrativo) ─────────────────────────
      // Alargar a união é ADITIVO: nenhum registro existente precisa mudar.
      // Só chegam a administradores, e só a partir da Central.
      v.literal("central_aprovacao"),
      v.literal("central_escalado"),
    ),
    title: v.string(),
    body: v.string(),
    isRead: v.boolean(),
    relatedEventId: v.optional(v.id("events")),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "isRead"]),

  // ── Contas excluídas pelo administrador ────────────────────────────────────
  // Registro mínimo (e-mail + quando) de quem foi excluído no painel admin.
  // Serve a UM propósito: impedir que a mesma pessoa se cadastre de novo e ganhe
  // OUTRO trial de 14 dias. Sem isso, excluir o usuário era um botão de
  // "renovar teste grátis" — bastava entrar novamente.
  //
  // Quem volta continua conseguindo entrar (não é banimento), mas entra com a
  // assinatura já expirada e vai direto ao paywall.
  deletedAccounts: defineTable({
    email: v.string(),
    deletedAt: v.string(),
    /** Quem apagou — para auditoria. */
    deletedByUserId: v.optional(v.id("users")),
    /** Já teve trial alguma vez? Hoje sempre true; campo mantido explícito. */
    hadTrial: v.boolean(),
  }).index("by_email", ["email"]),

  // Leads capturados pela landing page (visitantes não autenticados).
  // Distinto de `leads` (funil de vendas interno de cada usuário do app).
  landingLeads: defineTable({
    name: v.string(),
    email: v.string(),
    whatsapp: v.optional(v.string()),
    intent: v.union(v.literal("demo"), v.literal("beta")),
    // Acompanhamento comercial do interessado no ALTAR (SaaS) — NÃO confundir
    // com o funil de leads da decoradora (tabela `leads`), que é de clientes
    // dela. AUSENTE = "novo": todos os registros anteriores a este campo
    // continuam válidos, sem backfill.
    // ── O PIPELINE DE QUEM SE INTERESSOU PELO ALTAR ────────────────────────
    // Os quatro originais NÃO mudaram de nome nem de significado; os cinco do
    // meio foram ACRESCENTADOS, então todo registro já gravado continua válido
    // sem backfill. Mesmo movimento que `leads.stage` fez no funil dela.
    //
    //   novo              recém-chegado, ninguém falou com ele
    //   contato_preparado a mensagem está escrita, esperando uma pessoa enviar
    //   contatado         o convite foi enviado por uma pessoa
    //   respondeu         deu retorno, sem interesse ainda declarado
    //   interessado       respondeu e demonstrou interesse
    //   confirmou         disse que vem (campanha com data, como a live)
    //   participou        esteve presente
    //   nao_participou    confirmou e faltou — recuperável por demonstração
    //   demonstracao      vai ver o ALTAR numa conversa individual
    //   testando          está usando o ALTAR
    //   convertido        virou cliente          (original)
    //   descartado        não tem interesse      (original)
    //
    // `contato_preparado` existe por causa de uma trava do produto: a IA
    // escreve a mensagem e PARA. O estágio é o registro de que o rascunho
    // existe e de que falta uma pessoa apertar enviar. Ver lib/campanha.ts.
    //
    // `respondeu`, `nao_participou` e `demonstracao` foram ACRESCENTADOS
    // depois dos outros nove. Nenhum literal existente mudou de nome ou de
    // significado, então todo registro já gravado continua válido — a união é
    // aditiva e não houve backfill. Os dois últimos são DESVIOS da linha
    // principal, e é por isso que o funil conta por marcos declarados e não
    // por posição num array: ver `MarcoDoInteressado` em lib/campanha.ts.
    status: v.optional(
      v.union(
        v.literal("novo"),
        v.literal("contato_preparado"),
        v.literal("contatado"),
        v.literal("respondeu"),
        v.literal("interessado"),
        v.literal("confirmou"),
        v.literal("participou"),
        v.literal("nao_participou"),
        v.literal("demonstracao"),
        v.literal("testando"),
        v.literal("convertido"),
        v.literal("descartado"),
      ),
    ),
    // ── QUEM É ESTA PESSOA, ALÉM DO NOME E DO E-MAIL ───────────────────────
    // A landing captura três campos porque pedir mais afugenta quem está com
    // pressa. O resto é preenchido DEPOIS, por quem conversa — ou entra junto
    // numa importação de lista legítima.
    //
    // Tudo opcional, e em todos ausente significa "ninguém preencheu ainda".
    empresa: v.optional(v.string()),
    instagram: v.optional(v.string()),
    site: v.optional(v.string()),
    cidade: v.optional(v.string()),
    estado: v.optional(v.string()),
    /** "Casamento", "Corporativo", "Infantil"... texto livre: o vocabulário é do mercado. */
    segmento: v.optional(v.string()),
    /** Porte, em eventos por ano. Ajuda a decidir quem atender primeiro. */
    eventosPorAno: v.optional(v.number()),
    observacoes: v.optional(v.string()),
    /**
     * DE ONDE ele veio. Distinto de `intent`, que diz o que ele PEDIU.
     *
     * AUSENTE = veio pela landing, que é a origem de todo registro anterior a
     * este campo e continua sendo a do formulário público.
     */
    origem: v.optional(
      v.union(
        v.literal("landing"),
        v.literal("instagram"),
        v.literal("indicacao"),
        v.literal("whatsapp"),
        v.literal("site"),
        v.literal("evento"),
        v.literal("live"),
        v.literal("prospeccao"),
        v.literal("outro"),
      ),
    ),
    /**
     * A campanha que trouxe esta pessoa — o slug de `lib/campanha.ts`.
     *
     * ── POR QUE NÃO EXISTE TABELA DE CAMPANHA ───────────────────────────────
     * Uma campanha teria nome, data, hora e observação: quatro valores que não
     * mudam e que ninguém edita pela tela. "Leads relacionados" é um FILTRO
     * por este slug, não uma coluna. Uma tabela para guardar uma constante
     * seria um CRM de marketing montado para responder sete contagens.
     *
     * No dia em que houver campanha criada pela tela, o slug vira `v.id()` e
     * o dado já está no lugar certo.
     */
    campanha: v.optional(v.string()),
    /** Quem, da ALTAR, está cuidando deste interessado. */
    responsavelUserId: v.optional(v.id("users")),
    /** "AAAA-MM-DD" do próximo retorno combinado. Dia civil, nunca instante. */
    proximoContato: v.optional(v.string()),
    /** "AAAA-MM-DD" da última conversa. Sem ela não se afirma abandono. */
    ultimaInteracao: v.optional(v.string()),
    /**
     * QUANDO cada marco do funil foi atravessado. Instantes, não dias civis.
     *
     * ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────────
     * Enquanto o funil foi uma fila reta, dava para inferir o passado a partir
     * do presente: quem está em "testando" obviamente confirmou e participou.
     *
     * Parou de ser verdade quando entraram os DESVIOS. Hoje se chega a
     * "testando" por três caminhos — participou da live, faltou e foi
     * recuperado, ou nunca passou pela live e viu uma demonstração individual.
     * O estágio atual não distingue os três, e cada palpite estraga um número:
     * supor que participou infla a taxa de comparecimento (o número que a live
     * existe para medir); supor que não participou faz o total de participantes
     * ENCOLHER conforme as pessoas avançam — um indicador que despenca quando a
     * campanha dá certo.
     *
     * A saída é não adivinhar. Cada marco é carimbado quando acontece, e o
     * carimbo nunca é apagado nem reescrito: voltar de etapa corrige o presente
     * sem reescrever o passado.
     *
     * ── O AUSENTE ───────────────────────────────────────────────────────────
     * AUSENTE (o objeto todo, ou um marco dentro dele) = não há registro de que
     * aquilo aconteceu. NÃO significa que não aconteceu: um registro marcado à
     * mão antes deste campo existir é um convidado sem carimbo.
     *
     * Por isso a contagem aceita as duas evidências — o carimbo, quando há, e
     * o que o estágio atual COMPROVA, quando não há. A segunda é deliberadamente
     * conservadora (ver `MarcoDoInteressado` em lib/campanha.ts): na dúvida ela
     * subestima, porque uma taxa de comparecimento inflada é pior do que uma
     * tímida. Nenhum backfill foi feito e nenhuma data é inventada.
     */
    marcosEm: v.optional(
      v.object({
        convidado: v.optional(v.number()),
        respondeu: v.optional(v.number()),
        interessado: v.optional(v.number()),
        confirmou: v.optional(v.number()),
        participou: v.optional(v.number()),
        testando: v.optional(v.number()),
        cliente: v.optional(v.number()),
      }),
    ),
    /**
     * Quando este registro foi COLETADO — só para os de prospecção.
     *
     * Uma lista legítima importada precisa dizer de quando é: telefone público
     * de dois anos atrás não é contato, é ruído.
     */
    coletadoEm: v.optional(v.string()),
    /**
     * Telefone em E.164 canônico, derivado de `whatsapp`.
     *
     * Existe porque `whatsapp` é TEXTO LIVRE — "(11) 9 9999-9999", "11999999999"
     * e "+55 11 99999-9999" são o mesmo aparelho e nenhum casa com o outro por
     * comparação de string. A Central precisa responder "quem é este número?"
     * por ÍNDICE; sem este campo seria varredura da tabela inteira a cada
     * mensagem recebida.
     *
     * AUSENTE = registro anterior a este campo, ou telefone que não normaliza
     * (lib/central/telefone.ts devolve null). Não houve backfill e nenhum
     * número é inventado — ausente apenas significa "não indexado", nunca
     * "pessoa diferente".
     */
    whatsappE164: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_whatsapp_e164", ["whatsappE164"])
    // "Quantos leads temos para a live?" é a pergunta da campanha, e ela não
    // pode custar uma varredura da tabela inteira filtrada na memória — que é
    // como a resposta para na metade em silêncio depois do milésimo registro.
    .index("by_campanha", ["campanha"])
    .index("by_campanha_status", ["campanha", "status"])
    // Vincular um contato da Central a um interessado exige achá-lo pelo NOME
    // quando o telefone não casa (pessoa que escreveu de outro aparelho).
    // Índice sobre um campo que já existe — sem backfill.
    //
    // `campanha` entrou como filtro do índice para que "procurar Marina DENTRO
    // da live" seja uma consulta só. Sem ele, a busca voltaria os homônimos de
    // todas as campanhas e a tela teria de descartá-los depois de carregados —
    // que é a forma de a busca dizer "16 resultados" e mostrar 3.
    .searchIndex("search_nome", { searchField: "name", filterFields: ["campanha"] })
    // A decoradora é procurada pelo nome da EMPRESA tanto quanto pelo dela:
    // quem anotou "Ateliê Flor de Lis" no direct não lembra o nome da dona.
    .searchIndex("search_empresa", { searchField: "empresa", filterFields: ["campanha"] }),

  // ── CATÁLOGO CENTRAL DE FORNECEDORES ──────────────────────────────────────
  // "Este fornecedor pertence ao catálogo desta empresa."
  //
  // Distinto de `eventSuppliers`, que significa "este fornecedor NESTE evento".
  // A relação é: suppliers → eventSuppliers → events.
  //
  // O catálogo é POR EMPRESA (userId). Não há catálogo compartilhado entre
  // assinantes — decisão de produto.
  //
  // Guarda só o que é do FORNECEDOR e se repete entre eventos. O que é da
  // relação com um evento específico (status, valor, alinhamentos, observações
  // operacionais) continua em `eventSuppliers` e nunca sobe para cá.
  suppliers: defineTable({
    userId: v.id("users"),

    companyName: v.string(),
    // Nome normalizado (minúsculo, sem acento) — busca e deduplicação.
    // Ver lib/supplierIdentity.ts.
    searchName: v.string(),
    category: v.string(),

    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    // Só dígitos, sem código do país — a outra metade da chave de dedup.
    phoneDigits: v.optional(v.string()),
    email: v.optional(v.string()),

    // Perfil reutilizável — os mesmos campos que já existiam em eventSuppliers.
    logoStorageId: v.optional(v.id("_storage")),
    instagram: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    differentials: v.optional(v.string()),
    commercialInfo: v.optional(v.string()),
    bankInfo: v.optional(v.string()),
    notes: v.optional(v.string()),

    favorite: v.optional(v.boolean()),
    // Arquivar em vez de excluir preserva o histórico dos eventos passados.
    archivedAt: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_category", ["userId", "category"])
    .index("by_user_search", ["userId", "searchName"]),

  // Dossiê operacional de fornecedores por evento. Base para o "Dossiê do Evento"
  // futuro. Tudo opcional exceto category/companyName — não impacta eventos antigos.
  // `operational` é uma lista flexível rótulo→valor (com grupo opcional para a UI,
  // ex.: "operacao" / "mesa_posta" no Buffet). `category` é slug fixo OU texto livre.
  eventSuppliers: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    category: v.string(),
    companyName: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Perfil do fornecedor (reutilizável no futuro — hoje vive no fornecedor do
    // evento; a arquitetura permite extrair para uma tabela global depois).
    logoStorageId: v.optional(v.id("_storage")),
    instagram: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    differentials: v.optional(v.string()),
    commercialInfo: v.optional(v.string()),
    bankInfo: v.optional(v.string()),
    // Operacional (CORE — vale p/ Decor/Buffet/Bar).
    status: v.optional(
      v.union(
        v.literal("cotacao"),
        v.literal("em_negociacao"),
        v.literal("contratado"),
        v.literal("confirmado"),
        v.literal("finalizado"),
      ),
    ),
    alignments: v.optional(
      v.array(
        v.object({
          date: v.string(),
          note: v.string(),
          by: v.optional(v.string()),
          nextAction: v.optional(v.string()),
        }),
      ),
    ),
    // Próxima ação pendente do fornecedor neste evento (memória operacional /
    // futura Saúde do Evento). Mostrada no card e na "Situação neste evento".
    nextAction: v.optional(v.string()),
    favorite: v.optional(v.boolean()),
    operational: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
          group: v.optional(v.string()),
        }),
      ),
    ),
    order: v.optional(v.number()),
    // ── Vínculo com o CATÁLOGO CENTRAL (tabela `suppliers`) ──────────────────
    // Ausente = registro anterior ao catálogo, ainda não vinculado. Continua
    // funcionando: as telas leem daqui e só consultam o catálogo quando há
    // vínculo. Nenhum campo acima foi removido — os dados de perfil seguem
    // gravados neste registro como fallback e como histórico do evento.
    supplierId: v.optional(v.id("suppliers")),
  })
    .index("by_event", ["eventId"])
    .index("by_event_category", ["eventId", "category"])
    // Responde "em quais eventos já usei este fornecedor?" — a pergunta que
    // não tinha resposta antes do catálogo.
    .index("by_supplier", ["supplierId"])
    // A lista de eventos precisa da saúde de TODOS os eventos da conta. Sem
    // este índice, a resposta era uma consulta por evento — 40 eventos viravam
    // centenas de operações para desenhar uma tela. Ver lib/saudeDoEvento.ts.
    .index("by_user", ["userId"]),

  // ── CATÁLOGO DE MATERIAIS ─────────────────────────────────────────────────
  // "Do que a decoração é feita": rosa branca, eucalipto, vaso 25cm, vela,
  // tecido, castiçal, cabo. Por EMPRESA, como o catálogo de fornecedores —
  // não há catálogo compartilhado entre assinantes.
  //
  // NÃO é estoque: aqui não existe saldo, movimentação nem patrimônio. É o
  // vocabulário que receita, consolidado e compra usam para falar da mesma
  // coisa. `tipo` responde só "o que acontece com isto depois do evento".
  materials: defineTable({
    userId: v.id("users"),
    nome: v.string(),
    /** Nome normalizado — busca e deduplicação (lib/materiais.ts). */
    searchName: v.string(),
    unidade: unidadeDeMaterial,
    categoria: v.optional(v.string()),
    tipo: v.optional(tipoDeMaterial),
    /**
     * Custo de referência por unidade. OPCIONAL e SEMPRE estimativa: o custo
     * real vive em `purchaseItems`, e o livro-caixa em `transactions`. A Ficha
     * Técnica nunca é fonte de custo realizado (MASTER #5, lib/custoDoEvento).
     */
    custoReferencia: v.optional(v.number()),
    /**
     * Margem de segurança PADRÃO deste material, em percentual.
     *
     * Flor quebra no transporte, fita sobra em recorte, vidro trinca — e a
     * perda e propriedade do INSUMO, nao do arranjo nem do evento. Por isso a
     * margem mora aqui e nao na composicao: 10% de rosa vale em toda receita
     * que use rosa, e o vaso nao herda esse 10% so por dividir o arranjo.
     *
     * E so o PADRAO: o valor efetivo de cada evento e o que foi copiado para
     * a receita (`componenteDaReceita.margemPercentual`).
     */
    margemPercentual: v.optional(v.number()),
    /** Fornecedor preferencial. NUNCA obrigatório: a compra pode ser em outro. */
    supplierId: v.optional(v.id("suppliers")),
    /**
     * A FOTO DO MATERIAL — para a cliente saber o que é "lisianthus".
     *
     * ── POR QUE AQUI, E NÃO NO EVENTO ────────────────────────────────────────
     * "Rosa", "Lisianthus", "Boca-de-leão", "Eucalipto" é uma lista que não diz
     * quase nada para quem não trabalha com flor. A imagem que resolve isso é
     * sempre a MESMA — lisianthus branco é lisianthus branco no casamento de
     * setembro e no de março. Pendurá-la no evento obrigaria a decoradora a
     * subir a mesma foto a cada casamento, e é exatamente o trabalho repetido
     * que o catálogo existe para eliminar.
     *
     * O material é o vocabulário compartilhado (receita, consolidado e compra
     * já falam por ele); a foto é parte desse vocabulário. Um envio, todos os
     * eventos.
     *
     * ── NÃO É A GALERIA, E NÃO COMPETE COM ELA ───────────────────────────────
     * `eventPhotos` é a biblioteca visual DAQUELE evento, e desde o acervo de
     * imagens ela atravessa eventos da mesma empresa. Isto aqui é ilustração
     * de INSUMO, não registro de evento — "é esta flor", não "é assim que o
     * altar vai ficar". Por isso não tem `ambiente`, `projectScope` nem fase,
     * e por isso o item de montagem continua apontando para `eventPhotos`
     * (`referencePhotoId`), nunca para cá.
     *
     * ── UM ARQUIVO, NÃO DOIS ─────────────────────────────────────────────────
     * Sem `previewStorageId` ao lado, ao contrário de `eventPhotos`: lá o
     * original é o trabalho dela e precisa sobreviver inteiro. Aqui o arquivo
     * só existe para ilustrar um item de catálogo, desenhado pequeno, e a
     * versão reduzida É o que se quer guardar. A redução continua sendo a do
     * navegador (`lib/imagem-reduzida.ts`); falhando, sobe o original e
     * funciona igual.
     *
     * AUSENTE = material sem foto, que é o estado de todo material já
     * cadastrado. Sem backfill, e a tela mostra o nome como sempre mostrou.
     */
    fotoStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
    /** Fora do catálogo ativo sem perder as receitas que já o citam. */
    archived: v.optional(v.boolean()),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_search", ["userId", "searchName"])
    .index("by_user_categoria", ["userId", "categoria"])
    .index("by_supplier", ["supplierId"]),

  // ── ACERVO — O QUE A DECORADORA POSSUI ────────────────────────────────────
  // "Vaso cilíndrico 25cm: 40 unidades". Contagem por QUANTIDADE, nunca por
  // peça numerada: patrimônio individual, QR e prateleira sao ERP, e a
  // pergunta que precisa ser respondida ("tenho essas pecas livres para este
  // evento?") nao exige nada disso.
  //
  // Separado de `materials` de proposito. Um material tecnico pode NUNCA ser
  // acervo (rosa branca some no evento) e um item de acervo pode existir sem
  // material tecnico nenhum (sousplat que ela so usa em corporativo). Enfiar
  // estoque em `materials` criaria um objeto com metade dos campos sempre
  // vazios — e obrigaria toda rosa a carregar um `quantidadeTotal` sem
  // sentido.
  collectionItems: defineTable({
    userId: v.id("users"),
    nome: v.string(),
    /** Nome normalizado — busca e deduplicacao (lib/materiais.ts). */
    searchName: v.string(),
    unidade: unidadeDeMaterial,
    /**
     * O UNICO numero cadastrado do acervo. Reservado, disponivel e "falta
     * voltar" sao SEMPRE derivados (lib/acervo.ts) — um `disponivel` guardado
     * diverge em silencio na primeira reserva cancelada.
     *
     * NUNCA e alterado automaticamente: se sairam 20 e voltaram 19, o total
     * continua 40 ate alguem decidir o que aconteceu com a peca.
     */
    quantidadeTotal: v.number(),
    categoria: v.optional(v.string()),
    /**
     * Material tecnico correspondente. OPCIONAL e EXPLICITO: nao vinculamos
     * por nome. "Vaso X reutilizavel" pode ser da decoradora OU alugado de
     * terceiro, e so ela sabe a diferenca.
     */
    materialId: v.optional(v.id("materials")),
    notes: v.optional(v.string()),
    /** Arquivado sai das reservas novas; o historico continua legivel. */
    archived: v.optional(v.boolean()),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_search", ["userId", "searchName"])
    .index("by_material", ["materialId"]),

  // ── RESERVA DE ACERVO POR EVENTO ──────────────────────────────────────────
  // "Prometi 20 destes vasos para o casamento da Marina, de 09 a 11/10."
  //
  // A reserva e INTENCAO, nao movimento fisico. `saiu` e `voltou` moram aqui
  // porque sao a operacao DAQUELE evento com AQUELAS pecas — uma tabela de
  // movimentos separada seria uma segunda fonte para os mesmos dois numeros.
  //
  // A situacao (planejada/fora/retorno parcial/retornada) e DERIVADA das
  // quantidades: um `status` gravado ao lado divergiria no primeiro ajuste.
  // ── Historico de ajustes do acervo ────────────────────────────────────────
  // AUDITORIA, nao fonte de verdade. `collectionItems.quantidadeTotal` continua
  // sendo o estoque fisico; esta tabela EXPLICA como ele chegou onde chegou.
  // Somar este historico para descobrir o estoque criaria dois numeros que
  // discordam no primeiro registro perdido.
  //
  // Imutavel por convencao: nao ha mutation de edicao nem de exclusao. Correcao
  // se faz com ajuste compensatorio, que deixa os dois registros na historia —
  // apagar o erro apagaria tambem a prova de que ele existiu.
  collectionAdjustments: defineTable({
    userId: v.id("users"),
    collectionItemId: v.id("collectionItems"),
    tipo: tipoDeAjusteDeAcervo,
    /** ASSINADO: +entrada, -perda. E o que efetivamente moveu o estoque. */
    delta: v.number(),
    /** Antes e depois ficam gravados: o historico se le sem recalcular nada. */
    quantidadeAntes: v.number(),
    quantidadeDepois: v.number(),
    motivo: v.optional(v.string()),
    /**
     * Evento de onde a perda veio, quando veio de um. So PROCEDENCIA: o ajuste
     * nao mexe em reserva, saida nem retorno daquele evento.
     */
    eventId: v.optional(v.id("events")),
    responsibleId: v.optional(v.id("teamMembers")),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["collectionItemId"]),
  // A data do ajuste e o `_creationTime` do proprio Convex: carimbo do
  // servidor, que o cliente nao consegue forjar. Um campo de data proprio
  // seria um segundo relogio, livre para divergir.

  collectionReservations: defineTable({
    userId: v.id("users"),
    collectionItemId: v.id("collectionItems"),
    eventId: v.id("events"),
    /** Quanto foi prometido. Pode exceder o disponivel — o deficit fica visivel. */
    quantidade: v.number(),
    /** Janela operacional, DIA CIVIL "AAAA-MM-DD". Inclusiva nas duas pontas. */
    inicio: v.string(),
    fim: v.string(),
    /** De onde nasceu. `ficha` guarda o vinculo tecnico; `manual` nao precisa. */
    origem: v.union(v.literal("ficha"), v.literal("manual")),
    /** Material da ficha que originou. So quando `origem` e `ficha`. */
    materialId: v.optional(v.id("materials")),
    /**
     * Necessidade tecnica no momento em que a reserva foi criada/atualizada.
     * Mesmo papel do carimbo em `purchaseItems`: e comparando-o com a
     * necessidade de agora que o sistema diz "a ficha mudou desde entao" —
     * sem NUNCA mexer na reserva sozinho.
     */
    necessidadeTecnica: v.optional(v.number()),
    /** Saiu fisicamente do galpao. AUSENTE = nada saiu ainda. */
    saiu: v.optional(v.number()),
    /** Voltou fisicamente. AUSENTE = nada voltou ainda. */
    voltou: v.optional(v.number()),
    notes: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_event", ["eventId"])
    .index("by_item", ["collectionItemId"])
    // Uma reserva por item por evento — e o que torna a geracao a partir da
    // ficha idempotente (clicar duas vezes nao reserva 40).
    .index("by_event_item", ["eventId", "collectionItemId"]),

  // ── BIBLIOTECA DE COMPOSIÇÕES (receitas) ──────────────────────────────────
  // "Arranjo baixo clássico branco" — a receita que a decoradora reaproveita
  // de evento em evento. Por EMPRESA.
  //
  // A receita mora AQUI como array embutido, não em tabela filha: são poucas
  // linhas por composição, uma leitura traz tudo (nenhum N+1) e aplicar a
  // composição num evento é copiar o array — que é exatamente o snapshot.
  compositions: defineTable({
    userId: v.id("users"),
    nome: v.string(),
    searchName: v.string(),
    categoria: v.optional(v.string()),
    notes: v.optional(v.string()),
    receita: v.array(componenteDaReceita),
    archived: v.optional(v.boolean()),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_search", ["userId", "searchName"]),

  // ── Itens operacionais de montagem (Caderno de Montagem) ───────────────────
  // Genérica de propósito: serve para cadeiras, mesas, sofás, poltronas,
  // aparadores, tapetes, lounges, arranjos, peças, iluminação e estruturas —
  // por isso `area` é string e a tabela NÃO se chama "furniture".
  //
  // NÃO substitui o briefing: o texto do briefing é o combinado comercial;
  // estes itens são o operacional da montagem. As duas camadas convivem.
  assemblyItems: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    // Casa com BRIEFING_AREAS em src/lib/briefing-areas.ts.
    area: v.string(),
    order: v.number(),
    name: v.string(),
    model: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    // Vínculo real + nome denormalizado (sobrevive à exclusão do fornecedor).
    supplierId: v.optional(v.id("eventSuppliers")),
    supplierName: v.optional(v.string()),
    ambiente: v.optional(v.string()),
    notes: v.optional(v.string()),
    // ── AS DUAS FOTOS DO ITEM ───────────────────────────────────────────────
    // Papéis distintos e deliberados: o que foi APROVADO pela cliente × o que
    // foi efetivamente CONTRATADO. São perguntas diferentes, e a segunda é a
    // que evita a discussão no dia da montagem.
    //
    // ── POR QUE EXISTEM DUAS FORMAS DE GUARDAR CADA UMA ─────────────────────
    // Os `...StorageId` são o caminho ANTIGO: o item era dono exclusivo de um
    // arquivo enviado por ele mesmo. Funciona, e continua funcionando — mas
    // produzia a mesma imagem duas vezes no storage quando ela já estava na
    // Galeria, e essa cópia nascia sem `ambiente`, sem `projectScope`, sem
    // legenda e SEM VERSÃO LEVE: a miniatura de 40 px baixava o original.
    //
    // Os `...PhotoId` são o caminho de hoje: um PONTEIRO para a linha da
    // Galeria, na mesma forma de `events.coverPhotoId`. A Galeria continua
    // dona do arquivo — apagar o item NÃO apaga a foto, e apagar a foto limpa
    // o ponteiro (`gallery.deletePhoto`) em vez de deixar lixo apontando para
    // o vazio.
    //
    // PRECEDÊNCIA, escrita uma vez em `lib/fotoDoItem.ts` e lida por todo
    // mundo: o ponteiro manda quando resolve; senão cai no arquivo próprio.
    // Item antigo continua abrindo exatamente como abria, sem backfill.
    referencePhotoStorageId: v.optional(v.id("_storage")),
    contractedPhotoStorageId: v.optional(v.id("_storage")),
    referencePhotoId: v.optional(v.id("eventPhotos")),
    contractedPhotoId: v.optional(v.id("eventPhotos")),
    includeInAssemblyReport: v.boolean(),
    // ATENCAO: `checkOnAssembly` NAO e estado. E preferencia de IMPRESSAO —
    // marca quais itens ganham caixinha na ficha de montagem em PDF. O ponto
    // do trajeto vive em `operationalStatus`, abaixo. Sao eixos diferentes.
    checkOnAssembly: v.boolean(),
    // ── O QUE ESTE ITEM E NO PROJETO (opcional, aditivo) ────────────────────
    // Mesmo vocabulario de `eventPhotos.projectScope`, de proposito: item e
    // foto respondem a MESMA pergunta ("isto foi contratado ou e inspiracao?")
    // e precisam usar as mesmas palavras nos documentos.
    //   incluso     - faz parte do projeto contratado
    //   referencia  - direcao estetica, NAO contratada
    //   nao_incluso - foi mostrado e ficou de fora
    // AUSENTE = nao classificado. Item antigo continua valido e NAO vira
    // obrigacao de montagem por omissao.
    projectScope: v.optional(
      v.union(
        v.literal("incluso"),
        v.literal("referencia"),
        v.literal("nao_incluso"),
      ),
    ),
    // Ponto do trajeto fisico do item. AUSENTE = "pendente": todo item
    // cadastrado antes deste campo continua correto, sem backfill.
    // Nao ha contagem de quantidade retornada — isso seria inventario.
    operationalStatus: v.optional(
      v.union(
        v.literal("pendente"),
        v.literal("separado"),
        v.literal("carregado"),
        v.literal("conferido"),
        v.literal("retornou"),
      ),
    ),
    // Audiência do item — permite os relatórios de cliente/interno no futuro
    // sem mexer no schema.
    visibility: v.union(
      v.literal("interno"),
      v.literal("cliente"),
      v.literal("equipe"),
    ),
    // ── FICHA TÉCNICA (MASTER #6) ──────────────────────────────────────────
    // `assemblyItems` JÁ É a composição dentro do evento: tem ambiente
    // (`area`/`ambiente`), nome ("Arranjo baixo branco"), quantidade (20) e
    // escopo. Criar uma tabela `eventCompositions` obrigaria a decoradora a
    // cadastrar a mesma coisa duas vezes — uma para montar, outra para
    // calcular — e as duas divergiriam na primeira semana. Mesmo argumento
    // que src/lib/decoration-project.ts já usa para o Projeto de Decoração.
    //
    // O que faltava era só a RECEITA: do que este item é feito.
    //
    // SNAPSHOT, não referência: as linhas são COPIADAS da biblioteca. Editar
    // "Arranjo clássico" amanhã não pode recalcular, em silêncio, um evento
    // que já foi executado. AUSENTE = item sem ficha técnica, que é o estado
    // de todo item cadastrado antes desta rodada.
    receita: v.optional(v.array(componenteDaReceita)),
    /**
     * Composição da biblioteca que originou esta receita, quando houve uma.
     * É só PROCEDÊNCIA ("veio do Arranjo clássico") — nenhuma leitura busca a
     * receita por aqui, senão o snapshot deixaria de ser snapshot.
     */
    compositionId: v.optional(v.id("compositions")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_area", ["eventId", "area"])
    .index("by_composition", ["compositionId"])
    // A lista de eventos precisa da saúde de TODOS os eventos da conta. Sem
    // este índice, a resposta era uma consulta por evento — 40 eventos viravam
    // centenas de operações para desenhar uma tela. Ver lib/saudeDoEvento.ts.
    .index("by_user", ["userId"]),

  // ── IA VISUAL / Planta Premium ─────────────────────────────────────────────
  // Histórico versionado das gerações de planta. Tabela EXCLUSIVA da IA Visual —
  // não substitui nem toca em `contracts` (documentos) nem `eventPhotos` (galeria).
  // O croqui original (`originalSketchStorageId`) nunca é apagado: cada versão
  // guarda a referência ao arquivo de origem que a produziu.
  layoutRenders: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    // Origem — croqui enviado pela decoradora (preservado no storage).
    originalSketchStorageId: v.id("_storage"),
    originalSketchFilename: v.string(),
    // O que a IA leu do croqui, JÁ com as correções da decoradora aplicadas
    // (é exatamente o que foi enviado ao modelo de imagem).
    interpretation: layoutInterpretation,
    // Observações livres que a decoradora escreveu na revisão.
    corrections: v.optional(v.string()),
    // Resultado — ausente enquanto `status` é "generating" ou "failed".
    outputStorageId: v.optional(v.id("_storage")),
    // Rastreabilidade da geração.
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    promptSnapshot: v.string(),
    generationVersion: v.number(),
    status: v.union(
      v.literal("generating"),
      v.literal("done"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_version", ["eventId", "generationVersion"]),

  // ══════════════════════════════════════════════════════════════════════════
  // CENTRAL DE COMUNICAÇÕES ALTAR
  //
  // Operação do SaaS ALTAR — NÃO é dado de cliente da decoradora.
  //
  // ── A FRONTEIRA QUE NÃO PODE SER CRUZADA ─────────────────────────────────
  //   `leads`        = clientes DA DECORADORA (noiva, aniversariante). Tem
  //                    `userId` e é isolado por empresa. A Central NUNCA toca.
  //   `landingLeads` = interessados NO ALTAR. Sem tenant, só admin.
  //   `users`        = assinantes do ALTAR.
  //
  // O número comercial do ALTAR fala com interessados e assinantes. Todas as
  // tabelas abaixo são administrativas e vivem atrás de `requireAdmin`, ao
  // lado de `landingLeads` e `asaasWebhookEvents`.
  //
  // ── CANAL É ATRIBUTO, NÃO DOMÍNIO ────────────────────────────────────────
  // Nenhuma tabela, campo ou índice se chama "whatsapp". O WhatsApp é o valor
  // `channel: "whatsapp"`. Instagram, e-mail e chat entram sem schema novo.
  //
  // ── `vertical` EM TUDO ───────────────────────────────────────────────────
  // ALTAR Decor e ALTAR Buffet vivem em deployments separados e o Escritório
  // 3D agrega os dois. Hoje o valor é constante por deployment; o campo entra
  // como PRIMEIRO componente dos índices de listagem para que, se a Central
  // um dia virar hub único, não seja preciso reescrever índice nem fazer
  // backfill. Ver convex/lib/central/vertical.ts.
  // ══════════════════════════════════════════════════════════════════════════

  // ── A PESSOA DO OUTRO LADO ────────────────────────────────────────────────
  // Memória administrativa: quem é, a que lead/assinante corresponde, e o que
  // já se sabe dela. O VÍNCULO mora aqui, não na conversa — um telefone tem
  // várias conversas ao longo do tempo, e duas conversas do mesmo número não
  // podem apontar para donos diferentes.
  adminContacts: defineTable({
    vertical,
    displayName: v.string(),
    /** AUSENTE = "desconhecido". Nada é presumido sobre quem chegou. */
    tipo: v.optional(tipoDeContato),
    /** Interessado no ALTAR (landing). Exclusivo em relação a `userId`? Não: um
     *  interessado que virou assinante mantém os dois. */
    landingLeadId: v.optional(v.id("landingLeads")),
    userId: v.optional(v.id("users")),
    /** Como o vínculo nasceu. Automático só em casamento ÚNICO e exato. */
    vinculoOrigem: v.optional(v.union(v.literal("automatico"), v.literal("humano"))),
    vinculoPorUserId: v.optional(v.id("users")),
    vinculoEm: v.optional(v.number()),
    /**
     * Vínculo DESFEITO por um humano, com autor e data.
     *
     * Vincular sem poder desvincular é pior do que não vincular: o engano fica
     * gravado para sempre e a conversa de uma pessoa aparece na ficha de
     * outra. A remoção é registrada em vez de apagada — quem desfez e quando
     * é exatamente o que se precisa saber depois.
     */
    vinculoRemovidoEm: v.optional(v.number()),
    vinculoRemovidoPorUserId: v.optional(v.id("users")),
    /** Pediu para não ser mais contatado. Bloqueia proposta de resposta. */
    optOut: v.optional(v.boolean()),
    optOutEm: v.optional(v.number()),
    /**
     * NOTAS INTERNAS — memória administrativa sobre a pessoa.
     *
     * Só admin lê e escreve, e nunca sai da operação do SaaS: não vai para o
     * Escritório 3D, não entra em proposta de resposta e não é visível a
     * ninguém de fora do Painel. Por isso o autor e a data são gravados: uma
     * anotação sem origem, meses depois, não se sabe se ainda vale.
     */
    notas: v.optional(v.string()),
    notasAtualizadasEm: v.optional(v.number()),
    notasAtualizadasPorUserId: v.optional(v.id("users")),
    criadoEm: v.number(),
    atualizadoEm: v.number(),
  })
    .index("by_vertical", ["vertical"])
    .index("by_vertical_tipo", ["vertical", "tipo"])
    .index("by_landing_lead", ["landingLeadId"])
    .index("by_user", ["userId"])
    // Busca por nome na hora de vincular um contato solto. `displayName` já
    // existe em todo registro — nenhum campo novo, nenhum backfill.
    .searchIndex("search_nome", {
      searchField: "displayName",
      filterFields: ["vertical", "tipo"],
    }),

  // ── HANDLE EXTERNO → PESSOA ───────────────────────────────────────────────
  // É o que torna a Central multicanal de verdade: a mesma pessoa chega hoje
  // por WhatsApp e amanhã por Instagram, e as duas apontam para UM contato.
  // Sem esta tabela, ou se faz varredura (caro) ou se duplica a pessoa (pior).
  //
  // Para WhatsApp, `externalId` é o telefone em E.164 canônico
  // (lib/central/telefone.ts). Para e-mail seria o endereço; para Instagram,
  // o id da conta.
  communicationIdentities: defineTable({
    contactId: v.id("adminContacts"),
    channel,
    externalId: v.string(),
    displayName: v.optional(v.string()),
    verificadoPor: v.union(v.literal("automatico"), v.literal("humano")),
    criadoEm: v.number(),
  })
    .index("by_channel_external", ["channel", "externalId"])
    .index("by_contact", ["contactId"]),

  // ── A CONVERSA ────────────────────────────────────────────────────────────
  // Guarda O QUE VALE. O palpite da IA vive em `communicationTriage` e NUNCA
  // sobrescreve isto sem passar pelas regras de lib/central/triagem.ts.
  //
  // `proximaAcao` NÃO existe aqui de propósito: virou `adminWorkItems`, que
  // tem dono, prazo, status e sobrevive ao fim da conversa.
  communicationConversations: defineTable({
    vertical,
    channel,
    contactId: v.id("adminContacts"),
    /** Identificador da thread no canal, quando o canal tem um. */
    externalThreadId: v.optional(v.string()),
    assunto: v.string(),
    /** AUSENTE = "triagem". Conversa recém-chegada ainda não foi roteada. */
    departamento: v.optional(departamentoCentral),
    categoria: v.optional(categoriaCentral),
    /** AUSENTE = "normal". Sem backfill. */
    prioridade: v.optional(prioridadeCentral),
    status: statusDeConversa,
    responsavelUserId: v.optional(v.id("users")),
    escaladaParaCeo: v.optional(v.boolean()),
    escaladaMotivo: v.optional(v.string()),
    escaladaEm: v.optional(v.number()),
    ultimaMensagemEm: v.number(),
    ultimaMensagemDirecao: direcaoDeMensagem,
    naoLidas: v.number(),
    /**
     * Fim da janela em que o canal aceita resposta livre (24h no WhatsApp).
     * AUSENTE = canal sem janela. É a quarta trava do portão de saída.
     */
    janelaRespostaAte: v.optional(v.number()),
    /**
     * Texto DERIVADO para a busca da caixa de entrada: assunto + nome do
     * contato + handles do canal, normalizados (lib/central/busca.ts).
     *
     * Existe porque um índice de busca enxerga um campo de um documento, e a
     * pergunta real ("quem é a Helena?", "de quem é este número?") atravessa
     * três tabelas. Nunca é autoridade sobre nada: perder este campo tira a
     * conversa da BUSCA, não da operação.
     *
     * AUSENTE = conversa anterior a este campo. `repararIndiceDeBusca`
     * (interna, idempotente) preenche as antigas; as novas já nascem com ele.
     */
    buscaTexto: v.optional(v.string()),
    criadaEm: v.number(),
    atualizadaEm: v.number(),
  })
    .index("by_vertical_status", ["vertical", "status"])
    .index("by_vertical_departamento_status", ["vertical", "departamento", "status"])
    .index("by_vertical_ultimaMensagem", ["vertical", "ultimaMensagemEm"])
    .index("by_responsavel_status", ["responsavelUserId", "status"])
    .index("by_contact", ["contactId"])
    .index("by_channel_thread", ["channel", "externalThreadId"])
    // `vertical` como filtro do índice de busca pelo mesmo motivo que é o
    // primeiro componente de todo índice de listagem: o dia em que Decor e
    // Buffet dividirem deployment, a busca já está particionada.
    .searchIndex("search_busca", {
      searchField: "buscaTexto",
      filterFields: ["vertical", "status", "channel"],
    }),

  // ── A MENSAGEM, JÁ NORMALIZADA ────────────────────────────────────────────
  // Formato único, independente do canal (lib/channels/tipos.ts). O payload
  // cru da plataforma não é guardado: o que interessa auditar é o EVENTO
  // recebido, e isso vive em `integrationEvents`.
  communicationMessages: defineTable({
    conversationId: v.id("communicationConversations"),
    vertical,
    channel,
    externalMessageId: v.string(),
    direcao: direcaoDeMensagem,
    tipo: tipoDeMensagemCentral,
    texto: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaMime: v.optional(v.string()),
    /** Transcrição de áudio — BLOCO 4. O campo entra agora para não migrar. */
    transcricao: v.optional(v.string()),
    autor: v.union(v.literal("cliente"), v.literal("altar"), v.literal("sistema")),
    /** Quem, do lado da ALTAR, produziu a saída. */
    enviadaPorUserId: v.optional(v.id("users")),
    /** Aprovação que originou esta saída. Toda saída tem uma. */
    approvalId: v.optional(v.id("adminApprovals")),
    enviadaEm: v.number(),
    statusEntrega: v.optional(statusDeEntrega),
  })
    .index("by_conversation_enviadaEm", ["conversationId", "enviadaEm"])
    .index("by_channel_external", ["channel", "externalMessageId"]),

  // ── O QUE A IA ACHOU (nunca o que vale) ───────────────────────────────────
  // Tabela separada da conversa DE PROPÓSITO.
  //
  // A conversa guarda o estado real; aqui fica o palpite, com confiança e
  // justificativa. Quando um humano corrige, os dois divergem — e `divergiu`,
  // acumulado ao longo de semanas, é o ÚNICO dado honesto para decidir se a
  // IA pode ganhar autonomia na Fase 2. Sem ele, liberar envio automático
  // seria chute.
  communicationTriage: defineTable({
    conversationId: v.id("communicationConversations"),
    messageId: v.optional(v.id("communicationMessages")),
    vertical,
    channel,
    departamentoSugerido: departamentoCentral,
    categoriaSugerida: categoriaCentral,
    prioridadeSugerida: prioridadeCentral,
    escalarCeoSugerido: v.boolean(),
    /** 0 a 1. Abaixo de CONFIANCA_MINIMA a conversa sobe para o CEO. */
    confianca: v.number(),
    resumo: v.string(),
    sinais: v.array(v.string()),
    respostaSugerida: v.optional(v.string()),
    modelo: v.string(),
    promptVersao: v.string(),
    aplicada: v.boolean(),
    aplicadaPor: v.optional(v.union(v.literal("auto"), v.literal("humano"))),
    /** Um humano mudou o que a IA propôs. Ver lib/central/triagem.ts. */
    divergiu: v.optional(v.boolean()),
    criadaEm: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_vertical_criadaEm", ["vertical", "criadaEm"]),

  // ── A OPERAÇÃO ────────────────────────────────────────────────────────────
  // Follow-up, demonstração, onboarding, suporte, contato de cobrança.
  //
  // Existe como entidade própria (e não como campo de texto na conversa)
  // porque uma tarefa tem dono, prazo e status, aparece em lista por
  // responsável, e SOBREVIVE ao fim da conversa. Além disso nem toda tarefa
  // nasce de conversa: um follow-up de trial nasce do calendário.
  adminWorkItems: defineTable({
    vertical,
    tipo: tipoDeTrabalho,
    titulo: v.string(),
    descricao: v.optional(v.string()),
    prioridade: v.optional(prioridadeCentral),
    status: statusDeTrabalho,
    contactId: v.optional(v.id("adminContacts")),
    conversationId: v.optional(v.id("communicationConversations")),
    landingLeadId: v.optional(v.id("landingLeads")),
    userId: v.optional(v.id("users")),
    responsavelUserId: v.optional(v.id("users")),
    /** Dia civil "AAAA-MM-DD" — nunca instante. Ver lib/central/prazos.ts. */
    venceEm: v.optional(v.string()),
    concluidoEm: v.optional(v.number()),
    criadoPor: v.union(v.literal("ia"), v.literal("humano"), v.literal("sistema")),
    criadoPorUserId: v.optional(v.id("users")),
    criadoEm: v.number(),
    atualizadoEm: v.number(),
  })
    .index("by_vertical_status", ["vertical", "status"])
    .index("by_responsavel_status", ["responsavelUserId", "status"])
    .index("by_vertical_vence", ["vertical", "venceEm"])
    .index("by_conversation", ["conversationId"])
    .index("by_contact", ["contactId"]),

  // ── A FILA DO MATHEUS ─────────────────────────────────────────────────────
  // Generalizada de propósito: `proposta` é união discriminada. A Fase 1
  // implementa só `mensagem_saida`, mas a Fase 2 vai querer propor "abrir
  // tarefa", "vincular contato", "registrar sinal" — e isso entra sem
  // migração nenhuma.
  //
  // NENHUMA saída externa existe fora daqui. Ver lib/central/autonomia.ts.
  adminApprovals: defineTable({
    vertical,
    conversationId: v.optional(v.id("communicationConversations")),
    contactId: v.optional(v.id("adminContacts")),
    workItemId: v.optional(v.id("adminWorkItems")),
    triageId: v.optional(v.id("communicationTriage")),
    proposta: propostaDeAprovacao,
    /** Texto final quando o Matheus editou antes de aprovar. */
    textoAprovado: v.optional(v.string()),
    status: statusDeAprovacao,
    geradoPor: v.union(v.literal("ia"), v.literal("humano")),
    modelo: v.optional(v.string()),
    /** Aprovação sem autor não é aprovação — é a segunda trava do portão. */
    decididoPorUserId: v.optional(v.id("users")),
    decididoEm: v.optional(v.number()),
    recusaMotivo: v.optional(v.string()),
    executadaEm: v.optional(v.number()),
    execucaoErro: v.optional(v.string()),
    resultadoExternalMessageId: v.optional(v.string()),
    criadoEm: v.number(),
    /** AUSENTE = TTL padrão a partir de `criadoEm` (lib/central/prazos.ts). */
    expiraEm: v.optional(v.number()),
  })
    .index("by_vertical_status", ["vertical", "status"])
    .index("by_status_criadoEm", ["status", "criadoEm"])
    .index("by_conversation", ["conversationId"]),

  // ── OUVIDORIA → PRODUTO ───────────────────────────────────────────────────
  // NÃO é espelho da conversa. Tem ciclo de vida próprio que SOBREVIVE a ela
  // (o atendimento fecha hoje; o bug segue aberto em Produto por semanas) e,
  // principalmente, tem `ocorrencias`: nove pessoas pedindo a mesma coisa
  // viram UM sinal com peso 9, e é isso que prioriza roadmap. Uma query
  // agregadora sobre conversas nunca produziria esse número.
  //
  // O merge é HUMANO na Fase 1: a IA sugere, não funde. Fundir errado apaga
  // o pedido de um cliente.
  customerVoiceSignals: defineTable({
    vertical,
    tipo: tipoDeSinal,
    titulo: v.string(),
    descricao: v.string(),
    severidade: v.optional(severidadeDeSinal),
    status: statusDeSinal,
    channel: v.optional(channel),
    conversationId: v.optional(v.id("communicationConversations")),
    contactId: v.optional(v.id("adminContacts")),
    userId: v.optional(v.id("users")),
    /** Quantas vezes o mesmo pedido chegou. Começa em 1. */
    ocorrencias: v.number(),
    ultimoRelatoEm: v.number(),
    registradoPor: v.union(v.literal("ia"), v.literal("humano")),
    registradoPorUserId: v.optional(v.id("users")),
    criadoEm: v.number(),
    atualizadoEm: v.number(),
  })
    .index("by_vertical_tipo", ["vertical", "tipo"])
    .index("by_vertical_status", ["vertical", "status"])
    .index("by_vertical_ocorrencias", ["vertical", "ocorrencias"])
    .index("by_conversation", ["conversationId"]),

  // ── IDEMPOTÊNCIA E AUDITORIA DAS INTEGRAÇÕES ──────────────────────────────
  // Mesmo molde de `asaasWebhookEvents`, que nasceu de um caso real: um
  // pagamento confirmado não ativou a assinatura e não havia COMO saber se o
  // aviso tinha chegado.
  //
  // `asaasWebhookEvents` NÃO é migrada para cá no BLOCO 1 — está no caminho
  // do dinheiro e acabou de ser endurecida. As duas convivem.
  integrationEvents: defineTable({
    vertical,
    /** "meta_cloud", "mock", ... — quem entregou. */
    provider: v.string(),
    channel: v.optional(channel),
    event: v.string(),
    /** Segunda chegada da mesma chave NÃO reprocessa. */
    dedupKey: v.string(),
    receivedAt: v.number(),
    outcome: desfechoDeIntegracao,
    externalMessageId: v.optional(v.string()),
    conversationId: v.optional(v.id("communicationConversations")),
    erro: v.optional(v.string()),
    latenciaMs: v.optional(v.number()),
  })
    .index("by_dedup_key", ["dedupKey"])
    .index("by_provider_receivedAt", ["provider", "receivedAt"])
    .index("by_vertical_outcome", ["vertical", "outcome"]),

  // ── POLÍTICA DE AUTONOMIA (preparada, inerte na Fase 1) ───────────────────
  // Um documento por (vertical, canal, departamento). AUSENTE = "sugestao",
  // o mais restritivo que ainda é útil — nenhum backfill.
  //
  // Na Fase 1 `podeEnviarSemAprovacao` devolve `false` para TODOS os níveis,
  // inclusive "autonomo": gravar o nível aqui não liga envio nenhum. A tabela
  // existe para que a Fase 2 seja mudança de DADO, não reescrita de código.
  // ── O ESCRITÓRIO DE IA DA DECORADORA ───────────────────────────────────────
  // UMA tabela, e ela é da DECORADORA — não da operação do ALTAR.
  //
  // ── POR QUE NÃO REAPROVEITAR `adminWorkItems` ──────────────────────────────
  // Porque aquela tabela é do Matheus: `requireAdmin` em todas as funções, sem
  // `userId` de tenant, e o dono dela é a operação do SaaS. Guardar o pedido da
  // decoradora ali misturaria os dois negócios numa linha só — e a primeira
  // consulta que esquecesse o filtro mostraria o trabalho de uma conta para
  // outra. São dois produtos que compartilham arquitetura, não dados.
  //
  // ── POR QUE NÃO EXISTE TABELA DE AGENTES ───────────────────────────────────
  // Agente é PRODUTO, não dado: os sete vivem em `lib/assistente/agentes.ts`.
  // Uma tabela pediria cadastro que ninguém quer fazer e obrigaria cada conta a
  // ter sete linhas semeadas, com a primeira que falhasse virando uma conta sem
  // equipe.
  assistantTasks: defineTable({
    /** A DONA. Nunca vem do navegador — é sempre a sessão. */
    userId: v.id("users"),
    /** O que ela escreveu, como escreveu. */
    pedido: v.string(),
    /**
     * Quem cuidou. Sempre preenchido, inclusive quando ela deixou o ALTAR
     * escolher — o histórico precisa dizer QUEM respondeu, não "alguém".
     */
    agenteId: v.string(),
    /**
     * O ALTAR escolheu, ou ela apontou?
     *
     * A tela diz "encaminhado para o Financeiro" só no primeiro caso. Afirmar
     * isso quando foi ela quem escolheu seria o produto se dando crédito pelo
     * trabalho dela.
     */
    roteadoAutomaticamente: v.boolean(),
    /**
     * Poucos estados, e nenhum deles é de BPM.
     *
     *   queued     criada, esperando o executor
     *   running    o executor começou
     *   completed  respondeu
     *   failed     não respondeu, e `erro` diz por quê em português
     *   refused    o semáforo recusou — ver `cor`
     */
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refused"),
    ),
    /** O veredicto do semáforo (`lib/assistente/semaforo.ts`). */
    cor: v.union(v.literal("verde"), v.literal("amarelo"), v.literal("vermelho")),
    /** O que tornou o pedido amarelo ou vermelho. Ausente = verde. */
    motivoDaCor: v.optional(v.string()),
    /** A resposta. Ausente enquanto não terminou. */
    resultado: v.optional(v.string()),
    /**
     * O erro, JÁ TRADUZIDO. Nunca a mensagem crua do provedor: ela pode
     * carregar URL de gateway, nome de modelo e — no pior caso — pedaço de
     * chave. Ver `erroSeguro` no executor.
     */
    erro: v.optional(v.string()),
    /**
     * As fontes consultadas, pelos ids de `lib/assistente/agentes.ts`.
     *
     * A tela traduz por `ROTULO_DA_FONTE`. Guardar o id e não o rótulo permite
     * mudar o texto sem reescrever histórico.
     */
    fontesConsultadas: v.optional(v.array(v.string())),
    /**
     * Quem redigiu: o modelo, ou o redator determinístico local.
     *
     * Gravado SEMPRE, e mostrado quando é `mock`. A decoradora precisa poder
     * distinguir — os NÚMEROS são reais nos dois casos (vêm das mesmas
     * consultas), mas o texto de um não passou por modelo nenhum.
     */
    provedor: v.optional(v.union(v.literal("modelo"), v.literal("local"))),
    /** Tokens, quando o provedor informa. Sem provedor, ausente. */
    tokensEntrada: v.optional(v.number()),
    tokensSaida: v.optional(v.number()),
    criadoEm: v.number(),
    iniciadoEm: v.optional(v.number()),
    concluidoEm: v.optional(v.number()),
  })
    // "Meus trabalhos recentes", que é a única leitura que a tela faz.
    .index("by_user", ["userId"]),

  adminAutonomyPolicy: defineTable({
    vertical,
    channel,
    departamento: departamentoCentral,
    nivel: nivelDeAutonomia,
    alteradoPorUserId: v.id("users"),
    alteradoEm: v.number(),
  }).index("by_vertical_channel_departamento", ["vertical", "channel", "departamento"]),
});
