import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

const txType = v.union(v.literal("income"), v.literal("expense"));

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
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_better_auth_id", ["betterAuthId"])
    .index("by_email", ["email"])
    .index("by_asaas_customer", ["asaasCustomerId"])
    .index("by_asaas_subscription", ["asaasSubscriptionId"]),

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
  }).index("by_event", ["eventId"]),

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
    .index("by_event_phase", ["eventId", "phase"]),

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
    .index("by_member", ["teamMemberId"]),

  // Documentos do evento (contrato, adendo, orçamento, referência, outros).
  // `kind` ausente = contrato legado (compatibilidade com dados existentes).
  // Preparação para "Pasta do Evento" — hoje só o contrato principal tem UI de
  // upload; os demais tipos existem no schema para suportar a próxima etapa.
  contracts: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    filename: v.string(),
    uploadedAt: v.string(),
    kind: v.optional(
      v.union(
        v.literal("contract"),
        v.literal("addendum"),
        v.literal("budget"),
        v.literal("reference"),
        v.literal("other"),
      ),
    ),
  }).index("by_event", ["eventId"]),

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
    .index("by_user", ["userId"]),

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
  })
    .index("by_event", ["eventId"])
    .index("by_event_category", ["eventId", "category"]),

  transactions: defineTable({
    userId: v.id("users"),
    eventId: v.optional(v.id("events")),
    type: txType,
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    isPaid: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_event", ["eventId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("event_soon"),
      v.literal("trial_expiring"),
      v.literal("purchase_pending"),
      v.literal("checklist_incomplete"),
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
    status: v.optional(
      v.union(
        v.literal("novo"),
        v.literal("contatado"),
        v.literal("convertido"),
        v.literal("descartado"),
      ),
    ),
  }).index("by_email", ["email"]),

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
    .index("by_supplier", ["supplierId"]),

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
    // Duas fotos com papéis distintos: o que foi aprovado × o que foi contratado.
    referencePhotoStorageId: v.optional(v.id("_storage")),
    contractedPhotoStorageId: v.optional(v.id("_storage")),
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
    .index("by_composition", ["compositionId"]),

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
});
