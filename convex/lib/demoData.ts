// ─────────────────────────────────────────────────────────────────────────────
// O CASAMENTO DE DEMONSTRAÇÃO — Marina & Gabriel, 10/10/2026, Fazenda Aurora.
//
// TUDO AQUI É FICTÍCIO. Nenhum nome, telefone, e-mail, empresa, endereço ou
// valor veio de cliente, fornecedor ou evento real.
//
// Convenções que garantem isso e que devem ser mantidas se você editar:
//   · telefones no padrão (11) 9000X-XXXX — inventado, não alcança ninguém;
//   · e-mails em @exemplo.com.br — domínio de exemplo, não registrado;
//   · empresas com nomes compostos inventados, sem referência a marcas reais.
//
// O evento é retratado EM ANDAMENTO, não concluído: checklist pela metade,
// fornecedores em estágios diferentes, compras parciais, financeiro com
// parcelas ainda a receber. É o que faz o print parecer uso real em vez de
// vitrine — e é mais honesto sobre o que o produto faz.
//
// Nenhum campo de imagem é preenchido: as fotos você sobe pela interface.
// ─────────────────────────────────────────────────────────────────────────────

/** Marca o evento como demonstração — é o que torna o seed idempotente. */
export const DEMO_MARKER = "[demo]";

export const DEMO_WEDDING = {
  event: {
    name: "Marina & Gabriel",
    type: "wedding" as const,
    date: "2026-10-10",
    location: "Fazenda Aurora — Itu, SP",
    clientName: "Marina Duarte e Gabriel Rocha",
    clientPhone: "(11) 90001-2233",
    budget: 186_500,
    status: "confirmed" as const,
    notes:
      `Casamento ao ar livre, cerimônia no jardim das oliveiras e festa no ` +
      `salão de vidro. 180 convidados. Chuva: plano B no celeiro. ${DEMO_MARKER}`,
  },

  // ── Briefing — os campos que aparecem nas oito áreas da tela ──────────────
  briefing: {
    // Informações gerais
    guestCount: "180",
    theme: "Jardim ao entardecer",
    venueContact: "Fazenda Aurora — Renata Amaral · (11) 90002-4455",
    venueRules:
      "Som encerra à meia-noite. Montagem só a partir das 7h. Proibido fixar na estrutura de vidro.",
    colorPalette: "Branco, verde-oliva e dourado envelhecido",
    decorStyle: "Rústico refinado, com muito verde e velas",
    atmosphereDescription:
      "Fim de tarde dourado no jardim, transição para uma festa quente e intimista à noite.",
    setupTime: "07:00",
    teardownTime: "23:30",
    parkingInfo: "Estacionamento próprio para 90 carros + manobrista",
    accessibilityNeeds: "Rampa no acesso ao jardim; 2 convidados cadeirantes",
    emergencyContact: "Camila Prado (coordenação) · (11) 90003-6677",
    restrictions: "Sem fogos de artifício. Buffet sem frutos do mar (alergia na família).",

    // Cerimônia
    ceremonyTime: "16:30",
    ceremony_arch: "Arco de oliveiras com pé de flores brancas nas laterais",
    aisle_decor: "Tapete de linho cru com arranjos baixos a cada duas fileiras",

    // Festa
    receptionTime: "18:30",
    tableClothColor: "Linho off-white com sousplat dourado",
    napkinStyle: "Guardanapo de linho verde-oliva com anel de folha",
    centerpiece: "Arranjo baixo de eucalipto, rosas brancas e velas em vidro âmbar",

    // Mobiliário
    guestTableType: "Redonda de madeira, 1,80m",
    guestTableCount: "18",
    guestChairType: "Cadeira Tiffany dourada com assento de linho",
    guestChairCount: "180",
    loungeIncluded: "Sim",
    loungeDescription: "Dois lounges no jardim: sofás de vime, tapetes e almofadas verdes",
    signTable: "Aparador antigo com livro de assinaturas e caneta dourada",
    furnitureSupplier: "Mobiliário Casa Rara",

    // Flores
    flowerTypes: "Rosa branca, eucalipto, oliveira, astromélia",
    flowerColors: "Branco, verde-oliva, toques de bege",
    bouquetStyle: "Buquê cascata desestruturado",
    boutonniere: "Ramo de oliveira com botão de rosa branca",
    flowerSupplier: "Flores de Aurora",
    flowerBudget: "R$ 24.000",

    // Bolo e doces
    cakeSupplier: "Doces da Vila",
    cakeFlavor: "Naked cake de baunilha com frutas vermelhas",
    cakeLayers: "3 andares",
    cakeDesign: "Naked cake com folhas de oliveira e flores frescas",
    sweetsIncluded: "Sim",
    sweetsDescription: "8 tipos · 15 unidades por convidado · mesa de vidro e madeira",

    // Iluminação
    lightingType: "Varal de luz + spots quentes",
    lightingEffects: "Luz âmbar no jardim, cênica na pista",
    stringLights: "Varal cruzado sobre o salão de vidro",
    candleUse: "Velas em todas as mesas e no corredor da cerimônia",
    lightingSupplier: "Som & Luz Meridiano",

    // Personalização
    generalNotes:
      "Primeira dança logo após o jantar. Surpresa: coral entra durante a valsa.",
    specialRequests: "Cantinho para os avós, longe da caixa de som",
  },

  // ── Fornecedores — deliberadamente em estágios diferentes ─────────────────
  suppliers: [
    {
      companyName: "Buffet Terra Nova",
      category: "buffet",
      contactName: "Rodrigo Sampaio",
      phone: "(11) 90010-1122",
      email: "contato@terranova.exemplo.com.br",
      instagram: "@buffetterranova.exemplo",
      city: "Itu",
      state: "SP",
      differentials: "Cozinha no local, menu degustação incluso",
      commercialInfo: "R$ 320 por convidado · 40% na assinatura, saldo em 3x",
      status: "contratado" as const,
      nextAction: "Confirmar menu final após degustação",
      notes: "Sem frutos do mar — alergia na família da noiva.",
      alignments: [
        { date: "2026-07-14", note: "Primeira reunião e proposta", by: "Camila" },
        { date: "2026-08-22", note: "Degustação com os noivos — aprovado o menu 2", by: "Camila" },
        {
          date: "2026-09-18",
          note: "Ajuste de quantidade para 180 convidados",
          by: "Camila",
          nextAction: "Enviar mapa de mesas até 25/09",
        },
      ],
    },
    {
      companyName: "Flores de Aurora",
      // Categoria livre: o app tem 6 slugs fixos e aceita texto para o resto,
      // exibindo o próprio texto como rótulo. Escrito com inicial maiúscula
      // porque é assim que aparece na tela.
      category: "Flores",
      contactName: "Beatriz Nogueira",
      phone: "(11) 90011-2233",
      email: "beatriz@floresdeaurora.exemplo.com.br",
      instagram: "@floresdeaurora.exemplo",
      city: "São Roque",
      state: "SP",
      differentials: "Cultivo próprio de oliveiras e eucalipto",
      commercialInfo: "R$ 24.000 fechado · 50% na reserva",
      status: "confirmado" as const,
      nextAction: "Definir data da prévia do arranjo",
      alignments: [
        { date: "2026-08-02", note: "Visita ao espaço e definição do arco", by: "Eva" },
        { date: "2026-09-05", note: "Paleta aprovada pelos noivos", by: "Eva" },
      ],
    },
    {
      companyName: "Som & Luz Meridiano",
      category: "som_ilum",
      contactName: "Anderson Vieira",
      phone: "(11) 90012-3344",
      email: "comercial@meridiano.exemplo.com.br",
      city: "Sorocaba",
      state: "SP",
      differentials: "Iluminação cênica e gerador reserva",
      commercialInfo: "Proposta em análise · R$ 18.500",
      status: "em_negociacao" as const,
      nextAction: "Renegociar valor do gerador extra",
      alignments: [
        { date: "2026-09-10", note: "Proposta recebida — acima do orçado", by: "Eva" },
      ],
    },
    {
      companyName: "Doces da Vila",
      category: "doces",
      contactName: "Helena Marques",
      phone: "(11) 90013-4455",
      email: "helena@docesdavila.exemplo.com.br",
      instagram: "@docesdavila.exemplo",
      city: "Itu",
      state: "SP",
      differentials: "Naked cake e docinhos artesanais",
      commercialInfo: "R$ 9.800 · pagamento em 2x",
      status: "confirmado" as const,
      nextAction: "Provar os 8 sabores em 28/09",
      alignments: [
        { date: "2026-08-30", note: "Escolha do bolo de 3 andares", by: "Camila" },
      ],
    },
    {
      companyName: "Bar Alquimia",
      category: "bar",
      contactName: "Tiago Ferraz",
      phone: "(11) 90014-5566",
      email: "tiago@baralquimia.exemplo.com.br",
      city: "Campinas",
      state: "SP",
      differentials: "Coquetelaria autoral com dois bartenders",
      commercialInfo: "R$ 14.200 · open bar 6 horas",
      status: "contratado" as const,
      nextAction: "Fechar carta de drinks autorais",
      alignments: [
        { date: "2026-08-15", note: "Degustação de drinks — 3 autorais aprovados", by: "Eva" },
      ],
    },
    {
      companyName: "Mobiliário Casa Rara",
      category: "Mobiliário",
      contactName: "Sofia Bertolli",
      phone: "(11) 90015-6677",
      email: "locacao@casarara.exemplo.com.br",
      instagram: "@casarara.exemplo",
      city: "São Paulo",
      state: "SP",
      differentials: "Peças de garimpo e madeira maciça",
      commercialInfo: "R$ 21.400 · entrega e retirada inclusas",
      status: "cotacao" as const,
      nextAction: "Confirmar disponibilidade das cadeiras Tiffany",
      alignments: [
        { date: "2026-09-02", note: "Orçamento pedido para 18 mesas e 180 cadeiras", by: "Camila" },
      ],
    },
    {
      companyName: "Fazenda Aurora",
      category: "local",
      contactName: "Renata Amaral",
      phone: "(11) 90002-4455",
      email: "eventos@fazendaaurora.exemplo.com.br",
      city: "Itu",
      state: "SP",
      differentials: "Jardim de oliveiras e salão de vidro; plano B no celeiro",
      commercialInfo: "Locação R$ 32.000 · inclui limpeza e segurança",
      status: "finalizado" as const,
      alignments: [
        { date: "2026-06-28", note: "Visita técnica e reserva da data", by: "Eva" },
      ],
    },
  ],

  // ── Equipe — horários repetidos de propósito, para a Agenda agrupar ───────
  team: [
    { name: "Camila Prado", role: "Coordenação", phone: "(11) 90003-6677", scheduledTime: "07:00", notes: "Chega com a equipe de montagem" },
    { name: "Rafael Nunes", role: "Montagem", phone: "(11) 90004-7788", scheduledTime: "07:00" },
    { name: "Beatriz Lima", role: "Florista", phone: "(11) 90005-8899", scheduledTime: "09:30" },
    { name: "Tiago Farias", role: "Produção", phone: "(11) 90006-9900", scheduledTime: "09:30" },
    { name: "Helena Castro", role: "Apoio", phone: "(11) 90007-1011", scheduledTime: "14:00", notes: "Recepção dos convidados" },
  ],

  // ── Checklist — pré e pós, PARCIALMENTE concluído ────────────────────────
  checklist: [
    { phase: "pre" as const, name: "Cadeiras Tiffany douradas", category: "Mobiliário", quantity: 180, unit: "un", isChecked: true },
    { phase: "pre" as const, name: "Mesas redondas 1,80m", category: "Mobiliário", quantity: 18, unit: "un", isChecked: true },
    { phase: "pre" as const, name: "Toalhas de linho off-white", category: "Têxtil", quantity: 18, unit: "un", isChecked: true },
    { phase: "pre" as const, name: "Sousplat dourado", category: "Mesa posta", quantity: 180, unit: "un", isChecked: true },
    { phase: "pre" as const, name: "Guardanapos verde-oliva", category: "Têxtil", quantity: 180, unit: "un", isChecked: false },
    { phase: "pre" as const, name: "Anéis de guardanapo folha", category: "Mesa posta", quantity: 180, unit: "un", isChecked: false },
    { phase: "pre" as const, name: "Vasos de vidro âmbar", category: "Decoração", quantity: 60, unit: "un", isChecked: true },
    { phase: "pre" as const, name: "Velas pilar 20cm", category: "Decoração", quantity: 120, unit: "un", isChecked: false },
    { phase: "pre" as const, name: "Tapete de linho do corredor", category: "Decoração", quantity: 1, unit: "un", isChecked: true },
    { phase: "pre" as const, name: "Aparador para livro de assinaturas", category: "Mobiliário", quantity: 1, unit: "un", isChecked: false },
    { phase: "pre" as const, name: "Sofás de vime do lounge", category: "Mobiliário", quantity: 4, unit: "un", isChecked: false },
    { phase: "pre" as const, name: "Almofadas verdes", category: "Têxtil", quantity: 24, unit: "un", isChecked: false },
    { phase: "post" as const, name: "Conferir vasos de vidro", category: "Decoração", quantity: 60, unit: "un", isChecked: false },
    { phase: "post" as const, name: "Recolher tapete do corredor", category: "Decoração", quantity: 1, unit: "un", isChecked: false },
    { phase: "post" as const, name: "Devolver cadeiras ao fornecedor", category: "Mobiliário", quantity: 180, unit: "un", isChecked: false },
    { phase: "post" as const, name: "Conferir almofadas do lounge", category: "Têxtil", quantity: 24, unit: "un", isChecked: false },
  ],

  // ── Compras — parcialmente concluídas ────────────────────────────────────
  purchases: [
    { name: "Velas pilar 20cm", category: "Decoração", quantity: 120, unit: "un", supplier: "Casa das Velas", unitPrice: 12.9, isPurchased: true },
    { name: "Fita de cetim dourada", category: "Papelaria", quantity: 40, unit: "m", supplier: "Armarinho Central", unitPrice: 3.5, isPurchased: true },
    { name: "Anéis de guardanapo folha", category: "Mesa posta", quantity: 180, unit: "un", supplier: "Ateliê Folha", unitPrice: 8.4, isPurchased: false },
    { name: "Guardanapos de linho", category: "Têxtil", quantity: 180, unit: "un", supplier: "Linhos do Vale", unitPrice: 14.0, isPurchased: false },
    { name: "Placas de identificação de mesa", category: "Papelaria", quantity: 18, unit: "un", supplier: "Ateliê Folha", unitPrice: 22.0, isPurchased: true },
    { name: "Almofadas verdes do lounge", category: "Têxtil", quantity: 24, unit: "un", supplier: "Linhos do Vale", unitPrice: 48.0, isPurchased: false },
    { name: "Vasos de vidro âmbar", category: "Decoração", quantity: 60, unit: "un", supplier: "Casa das Velas", unitPrice: 26.0, isPurchased: true },
  ],

  // ── Orçamento do evento ──────────────────────────────────────────────────
  budget: [
    { description: "Projeto de decoração — contrato", category: "Decoração", quantity: 1, unitPrice: 186_500, type: "income" as const },
    { description: "Buffet Terra Nova (180 convidados)", category: "Buffet", quantity: 180, unitPrice: 320, type: "expense" as const },
    { description: "Locação Fazenda Aurora", category: "Local", quantity: 1, unitPrice: 32_000, type: "expense" as const },
    { description: "Flores e arranjos", category: "Flores", quantity: 1, unitPrice: 24_000, type: "expense" as const },
    { description: "Bar Alquimia — open bar 6h", category: "Bar", quantity: 1, unitPrice: 14_200, type: "expense" as const },
    { description: "Bolo e mesa de doces", category: "Doces", quantity: 1, unitPrice: 9_800, type: "expense" as const },
    { description: "Som e iluminação (em negociação)", category: "Som e Luz", quantity: 1, unitPrice: 18_500, type: "expense" as const },
    { description: "Mobiliário e locações", category: "Mobiliário", quantity: 1, unitPrice: 21_400, type: "expense" as const },
    { description: "Equipe de montagem e produção", category: "Equipe", quantity: 1, unitPrice: 8_600, type: "expense" as const },
  ],

  // ── Financeiro — entradas e saídas, pagas e a pagar ──────────────────────
  transactions: [
    { type: "income" as const, category: "Contrato", description: "Sinal do contrato (30%)", amount: 55_950, date: "2026-06-28", isPaid: true },
    { type: "income" as const, category: "Contrato", description: "2ª parcela", amount: 43_550, date: "2026-08-10", isPaid: true },
    { type: "income" as const, category: "Contrato", description: "3ª parcela", amount: 43_500, date: "2026-09-10", isPaid: true },
    { type: "income" as const, category: "Contrato", description: "Parcela final", amount: 43_500, date: "2026-10-05", isPaid: false },
    { type: "expense" as const, category: "Local", description: "Locação Fazenda Aurora", amount: 32_000, date: "2026-07-01", isPaid: true },
    { type: "expense" as const, category: "Buffet", description: "Buffet Terra Nova — 40%", amount: 23_040, date: "2026-07-20", isPaid: true },
    { type: "expense" as const, category: "Flores", description: "Flores de Aurora — 50%", amount: 12_000, date: "2026-08-05", isPaid: true },
    { type: "expense" as const, category: "Bar", description: "Bar Alquimia — entrada", amount: 7_100, date: "2026-08-18", isPaid: true },
    { type: "expense" as const, category: "Buffet", description: "Buffet Terra Nova — saldo", amount: 34_560, date: "2026-10-03", isPaid: false },
    { type: "expense" as const, category: "Flores", description: "Flores de Aurora — saldo", amount: 12_000, date: "2026-10-03", isPaid: false },
    { type: "expense" as const, category: "Doces", description: "Doces da Vila", amount: 9_800, date: "2026-10-05", isPaid: false },
    { type: "expense" as const, category: "Compras", description: "Compras de decoração", amount: 4_180, date: "2026-09-12", isPaid: true },
  ],

  // ── Carregamento / Caderno de Montagem ───────────────────────────────────
  // `area` casa com as chaves de BRIEFING_AREAS (src/lib/briefing-areas.ts).
  assembly: [
    { area: "ceremony", name: "Arco de oliveiras", model: "Estrutura curva 2,4m", quantity: 1, unit: "un", supplierName: "Flores de Aurora", ambiente: "Jardim das oliveiras", notes: "Montar até as 13h — foto dos noivos às 15h", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "ceremony", name: "Tapete de linho cru", quantity: 1, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Jardim das oliveiras", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "ceremony", name: "Arranjos baixos do corredor", quantity: 12, unit: "un", supplierName: "Flores de Aurora", ambiente: "Jardim das oliveiras", checkOnAssembly: true, visibility: "cliente" as const },
    { area: "party", name: "Mesa redonda 1,80m", model: "Madeira maciça", quantity: 18, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "party", name: "Cadeira Tiffany dourada", model: "Assento de linho", quantity: 180, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Salão de vidro", notes: "Conferir 6 reservas", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "party", name: "Centro de mesa — eucalipto e velas", quantity: 18, unit: "un", supplierName: "Flores de Aurora", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "cliente" as const },
    { area: "furniture", name: "Sofá de vime do lounge", quantity: 4, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Lounge do jardim", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "furniture", name: "Tapete natural do lounge", quantity: 2, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Lounge do jardim", checkOnAssembly: false, visibility: "equipe" as const },
    { area: "furniture", name: "Aparador do livro de assinaturas", model: "Madeira antiga", quantity: 1, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Entrada", checkOnAssembly: true, visibility: "cliente" as const },
    { area: "lighting", name: "Varal de luz cruzado", quantity: 120, unit: "m", supplierName: "Som & Luz Meridiano", ambiente: "Salão de vidro", notes: "Depende do fechamento da proposta", checkOnAssembly: false, visibility: "interno" as const },
    { area: "lighting", name: "Spots âmbar do jardim", quantity: 24, unit: "un", supplierName: "Som & Luz Meridiano", ambiente: "Jardim das oliveiras", checkOnAssembly: false, visibility: "interno" as const },
    { area: "cake", name: "Mesa do bolo — vidro e madeira", quantity: 1, unit: "un", supplierName: "Doces da Vila", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "cliente" as const },
  ],

  // ── Funil — o casal já convertido, mais volume nas outras colunas ────────
  leads: [
    { clientName: "Marina Duarte e Gabriel Rocha", clientPhone: "(11) 90001-2233", eventType: "Casamento", eventDate: "2026-10-10", budget: 186_500, stage: "contracted" as const, notes: "Fechado em junho. Indicação da Fazenda Aurora.", isMainEvent: true },
    { clientName: "Luiza e Otávio", clientPhone: "(11) 90020-1122", eventType: "Casamento", eventDate: "2027-03-20", budget: 145_000, stage: "quote_sent" as const, notes: "Proposta enviada 12/09. Retornar dia 25.", isMainEvent: false },
    { clientName: "Bianca e Henrique", clientPhone: "(11) 90021-2233", eventType: "Casamento", eventDate: "2027-05-15", budget: 210_000, stage: "quote_sent" as const, notes: "Querem visita ao espaço antes de decidir.", isMainEvent: false },
    { clientName: "Aniversário 60 anos — Sra. Vitória", clientPhone: "(11) 90022-3344", eventType: "Aniversário", eventDate: "2026-12-06", budget: 42_000, stage: "contact" as const, notes: "Primeiro contato por Instagram.", isMainEvent: false },
    { clientName: "Confraternização Grupo Nórdica", clientPhone: "(11) 90023-4455", eventType: "Corporativo", eventDate: "2026-12-12", budget: 68_000, stage: "contact" as const, notes: "Aguardando briefing do RH.", isMainEvent: false },
    { clientName: "Camila e Rafael", clientPhone: "(11) 90024-5566", eventType: "Casamento", eventDate: "2027-01-30", budget: 90_000, stage: "discarded" as const, notes: "Orçamento acima do que buscavam.", isMainEvent: false },
  ],
};
