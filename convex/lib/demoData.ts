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
    flowerBudget: "R$ 34.000",

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

  // ── CATÁLOGO DE MATERIAIS ────────────────────────────────────────────────
  // O vocabulário técnico da empresa: do que as peças são feitas. É o que faz
  // a Ficha Técnica sair do papel — sem catálogo, "arranjo baixo" é só um nome.
  //
  // `tipo` responde UMA pergunta: o que acontece com isto depois do evento?
  // É ele que decide se a necessidade vira COMPRA (consumível, compra para o
  // evento) ou RESERVA DE ACERVO (acervo próprio, locação). Ver lib/materiais.ts.
  //
  // `margemPercentual` é a folga que a decoradora já fazia de cabeça: flor
  // quebra no transporte, fita sobra no recorte. Só nos materiais que de fato
  // se perdem — reservar 10% a mais de sousplat não faz sentido nenhum.
  materials: [
    { nome: "Rosa branca importada", unidade: "haste" as const, tipo: "consumivel" as const, categoria: "Flores", custoReferencia: 6.9, margemPercentual: 10, supplier: "Flores de Aurora" },
    { nome: "Lisianthus branco", unidade: "haste" as const, tipo: "consumivel" as const, categoria: "Flores", custoReferencia: 5.4, margemPercentual: 10, supplier: "Flores de Aurora" },
    { nome: "Astromélia creme", unidade: "haste" as const, tipo: "consumivel" as const, categoria: "Flores", custoReferencia: 3.8, margemPercentual: 10, supplier: "Flores de Aurora" },
    { nome: "Eucalipto cinerea", unidade: "maco" as const, tipo: "consumivel" as const, categoria: "Folhagens", custoReferencia: 18, margemPercentual: 8, supplier: "Flores de Aurora" },
    { nome: "Ramo de oliveira", unidade: "maco" as const, tipo: "consumivel" as const, categoria: "Folhagens", custoReferencia: 22, margemPercentual: 8, supplier: "Flores de Aurora" },
    { nome: "Espuma floral", unidade: "un" as const, tipo: "consumivel" as const, categoria: "Insumos florais", custoReferencia: 7.5, margemPercentual: 10 },
    { nome: "Vela pilar 20cm", unidade: "un" as const, tipo: "consumivel" as const, categoria: "Decoração", custoReferencia: 12.9, margemPercentual: 5 },
    { nome: "Fita de cetim dourada", unidade: "m" as const, tipo: "consumivel" as const, categoria: "Papelaria", custoReferencia: 3.5, margemPercentual: 10 },
    { nome: "Anel de guardanapo folha", unidade: "un" as const, tipo: "compra_especifica" as const, categoria: "Mesa posta", custoReferencia: 8.4 },
    // Acervo próprio: NÃO entra na lista de compras por padrão — ela já os tem.
    { nome: "Vaso de vidro âmbar 18cm", unidade: "un" as const, tipo: "reutilizavel" as const, categoria: "Vidro", custoReferencia: 26 },
    { nome: "Castiçal de vidro 25cm", unidade: "un" as const, tipo: "reutilizavel" as const, categoria: "Vidro", custoReferencia: 34 },
    { nome: "Sousplat dourado", unidade: "un" as const, tipo: "reutilizavel" as const, categoria: "Mesa posta", custoReferencia: 18 },
    { nome: "Guardanapo de linho verde-oliva", unidade: "un" as const, tipo: "reutilizavel" as const, categoria: "Têxtil", custoReferencia: 14 },
    // Locação: volta para o fornecedor, não para o galpão.
    { nome: "Estrutura curva de ferro 2,4m", unidade: "un" as const, tipo: "locacao" as const, categoria: "Estruturas", custoReferencia: 480, supplier: "Mobiliário Casa Rara" },
  ],

  // ── BIBLIOTECA DE COMPOSIÇÕES ────────────────────────────────────────────
  // As receitas que a decoradora reaproveita de evento em evento. Aplicá-las
  // num evento COPIA a receita para o item de montagem (snapshot): mudar a
  // receita mestre amanhã não pode recalcular, em silêncio, um evento que já
  // foi executado.
  //
  // `material` casa por NOME com o catálogo acima — o seed resolve o id.
  compositions: [
    {
      nome: "Centro de mesa — eucalipto e velas",
      categoria: "Arranjos",
      notes: "Vaso âmbar baixo, para não bloquear a conversa na mesa redonda.",
      receita: [
        { material: "Rosa branca importada", quantidade: 5 },
        { material: "Eucalipto cinerea", quantidade: 0.5 },
        { material: "Vela pilar 20cm", quantidade: 5 },
        { material: "Vaso de vidro âmbar 18cm", quantidade: 1 },
        { material: "Espuma floral", quantidade: 1 },
        { material: "Fita de cetim dourada", quantidade: 1 },
      ],
    },
    {
      nome: "Arranjo baixo do corredor",
      categoria: "Arranjos",
      notes: "A cada duas fileiras de cadeiras, dos dois lados do tapete.",
      receita: [
        { material: "Rosa branca importada", quantidade: 3 },
        { material: "Astromélia creme", quantidade: 4 },
        { material: "Ramo de oliveira", quantidade: 0.25 },
        { material: "Vela pilar 20cm", quantidade: 2 },
        { material: "Vaso de vidro âmbar 18cm", quantidade: 1 },
        { material: "Espuma floral", quantidade: 1 },
        { material: "Fita de cetim dourada", quantidade: 0.5 },
      ],
    },
    {
      nome: "Arco de oliveiras",
      categoria: "Estruturas",
      notes: "Assimétrico: volume no canto superior esquerdo e pé à direita.",
      receita: [
        { material: "Estrutura curva de ferro 2,4m", quantidade: 1 },
        { material: "Ramo de oliveira", quantidade: 24 },
        { material: "Rosa branca importada", quantidade: 60 },
        { material: "Lisianthus branco", quantidade: 40 },
        { material: "Fita de cetim dourada", quantidade: 12 },
      ],
    },
    {
      nome: "Mesa posta — linho e dourado",
      categoria: "Mesa posta",
      notes: "Receita POR COUVERT. Multiplicada pelo número de convidados.",
      receita: [
        { material: "Sousplat dourado", quantidade: 1 },
        { material: "Guardanapo de linho verde-oliva", quantidade: 1 },
        { material: "Anel de guardanapo folha", quantidade: 1 },
      ],
    },
  ],

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
        { date: "2026-07-14", note: "Visita técnica e levantamento dos espaços", by: "Camila" },
        { date: "2026-08-22", note: "Alinhamento da mesa posta: sousplat, taças e réchauds visíveis", by: "Camila" },
        {
          date: "2026-09-18",
          note: "Conferência de quantidades por ambiente — 180 convidados",
          by: "Camila",
          nextAction: "Enviar disposição das mesas e ilhas até 25/09",
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
      commercialInfo: "R$ 34.000 fechado · 50% na reserva",
      status: "confirmado" as const,
      nextAction: "Definir data da prévia do arranjo",
      alignments: [
        { date: "2026-08-02", note: "Definição floral do arco e da cerimônia", by: "Eva" },
        { date: "2026-09-05", note: "Paleta floral aprovada — branco, verde e tons naturais", by: "Eva" },
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
        { date: "2026-09-10", note: "Alinhamento da iluminação decorativa do jardim e do salão", by: "Eva" },
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
        { date: "2026-08-30", note: "Forminhas e composição visual da mesa de doces", by: "Camila" },
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
        { date: "2026-08-15", note: "Alinhamento da estrutura e do decor do balcão do bar", by: "Eva" },
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
  // As compras com `material` nasceram da Ficha Técnica: `necessidadeTecnica` é
  // o carimbo da necessidade consolidada NO MOMENTO da geração, e é ele que
  // permite a tela dizer "a ficha mudou desde então" sem reescrever nada.
  // Note que necessidade ≠ compra, de propósito: a ficha pede 114 velas, a
  // sugestão com margem dá 120, e foi 120 que ela comprou.
  purchases: [
    { name: "Vela pilar 20cm", category: "Decoração", quantity: 120, unit: "un", supplier: "Casa das Velas", unitPrice: 12.9, isPurchased: true, material: "Vela pilar 20cm", necessidadeTecnica: 114 },
    { name: "Fita de cetim dourada", category: "Papelaria", quantity: 40, unit: "m", supplier: "Armarinho Central", unitPrice: 3.5, isPurchased: true, material: "Fita de cetim dourada", necessidadeTecnica: 36 },
    { name: "Anel de guardanapo folha", category: "Mesa posta", quantity: 180, unit: "un", supplier: "Ateliê Folha", unitPrice: 8.4, isPurchased: false, material: "Anel de guardanapo folha", necessidadeTecnica: 180 },
    { name: "Guardanapo de linho verde-oliva", category: "Têxtil", quantity: 30, unit: "un", supplier: "Linhos do Vale", unitPrice: 14.0, isPurchased: false,
      // 30, não 180: o acervo tem 150 e a mesa posta precisa de 180. A compra
      // fecha exatamente o buraco que a reserva de acervo deixou visível.
      material: "Guardanapo de linho verde-oliva", necessidadeTecnica: 180 },
    { name: "Placas de identificação de mesa", category: "Papelaria", quantity: 18, unit: "un", supplier: "Ateliê Folha", unitPrice: 22.0, isPurchased: true },
    { name: "Almofadas verdes do lounge", category: "Têxtil", quantity: 24, unit: "un", supplier: "Linhos do Vale", unitPrice: 48.0, isPurchased: false },
    { name: "Vasos de vidro âmbar", category: "Decoração", quantity: 60, unit: "un", supplier: "Casa das Velas", unitPrice: 26.0, isPurchased: true,
      // Sem vínculo com a ficha DE PROPÓSITO: foi compra de ACERVO, não
      // necessidade deste evento. Entraram no galpão (ver `adjustments`) e
      // de lá 30 foram reservados para o casamento.
      notes: "Reposição de acervo — entraram no galpão em setembro." },
  ],

  // ── Orçamento do evento ──────────────────────────────────────────────────
  // ── CUSTO PLANEJADO DA DECORADORA ────────────────────────────────────────
  // Só o que a EMPRESA DE DECORAÇÃO vende e paga. Buffet, locação do espaço,
  // bar e som são fornecedores do CASAL: a decoradora não os paga, e lançá-los
  // aqui produziria margem inventada sobre dinheiro que nunca passou pela
  // empresa. Ver convex/lib/financeScope.ts.
  //
  // Receita 186.500 · custo 107.500 · margem prevista 79.000 (42%).
  budget: [
    { description: "Projeto de decoração — contrato", category: "Decoração", quantity: 1, unitPrice: 186_500, type: "income" as const },
    { description: "Flores e folhagens", category: "Flores", quantity: 1, unitPrice: 34_000, type: "expense" as const },
    { description: "Mobiliário e locação de peças", category: "Móveis", quantity: 1, unitPrice: 21_400, type: "expense" as const },
    { description: "Equipe de montagem e produção", category: "Equipe", quantity: 1, unitPrice: 14_200, type: "expense" as const },
    { description: "Estruturas e marcenaria (arco e painéis)", category: "Materiais", quantity: 1, unitPrice: 12_800, type: "expense" as const },
    { description: "Tecidos, toalhas e mesa posta", category: "Tecidos", quantity: 1, unitPrice: 9_600, type: "expense" as const },
    { description: "Iluminação decorativa", category: "Iluminação", quantity: 1, unitPrice: 7_400, type: "expense" as const },
    { description: "Frete e transporte da montagem", category: "Transporte", quantity: 1, unitPrice: 3_800, type: "expense" as const },
    { description: "Materiais de consumo", category: "Materiais", quantity: 1, unitPrice: 2_400, type: "expense" as const },
    { description: "Impressos e personalizados (menus e marcadores)", category: "Materiais", quantity: 1, unitPrice: 1_900, type: "expense" as const },
  ],

  // ── Financeiro — entradas e saídas, pagas e a pagar ──────────────────────
  // ── MOVIMENTO REAL DA DECORADORA ─────────────────────────────────────────
  // Entradas do contrato de decoração e saídas da execução do projeto.
  // Nenhum fornecedor do casal aparece aqui — ver financeScope.ts.
  transactions: [
    { type: "income" as const, category: "Sinal", description: "Sinal do contrato (30%)", amount: 55_950, date: "2026-06-28", isPaid: true },
    { type: "income" as const, category: "Saldo", description: "2ª parcela", amount: 43_550, date: "2026-08-10", isPaid: true },
    { type: "income" as const, category: "Saldo", description: "3ª parcela", amount: 43_500, date: "2026-09-10", isPaid: true },
    { type: "income" as const, category: "Saldo", description: "Parcela final", amount: 43_500, date: "2026-10-05", isPaid: false },
    { type: "expense" as const, category: "Flores", description: "Flores de Aurora — 50% do pedido", amount: 17_000, date: "2026-08-05", isPaid: true },
    { type: "expense" as const, category: "Móveis", description: "Mobiliário Casa Rara — locação", amount: 21_400, date: "2026-08-18", isPaid: true },
    { type: "expense" as const, category: "Materiais", description: "Estrutura do arco e painéis", amount: 12_800, date: "2026-08-22", isPaid: true },
    { type: "expense" as const, category: "Tecidos", description: "Toalhas, trilhos e guardanapos", amount: 9_600, date: "2026-09-02", isPaid: true },
    { type: "expense" as const, category: "Transporte", description: "Frete da montagem (ida e volta)", amount: 3_800, date: "2026-09-12", isPaid: true },
    { type: "expense" as const, category: "Materiais", description: "Materiais de consumo e insumos", amount: 2_400, date: "2026-09-12", isPaid: true },
    // ── A ÚNICA CONTA VENCIDA DA HISTÓRIA ────────────────────────────────
    // O saldo da floricultura venceu em 15/09 e não foi liquidado. É o que
    // faz o painel da manhã dizer "Venceu e não foi liquidado · 1 a pagar ·
    // R$ 17.000" — o alerta que o produto existe para dar.
    //
    // Data no PASSADO de propósito: ela não envelhece. O resto da semente é
    // ancorado no evento de 10/10/2026 e perde sentido depois dele; esta
    // continua verdadeira em qualquer dia em que a demonstração rodar.
    //
    // E é a decoradora devendo ao fornecedor — não a cliente devendo a ela.
    // Marina pagou as três parcelas em dia, e a narrativa do demo depende
    // disso: a parcela final vence em 05/10 e ainda está no prazo.
    { type: "expense" as const, category: "Flores", description: "Flores de Aurora — saldo do pedido", amount: 17_000, date: "2026-09-15", isPaid: false },
    { type: "expense" as const, category: "Equipe", description: "Equipe de montagem e produção", amount: 14_200, date: "2026-10-09", isPaid: false },
  ],

  // ── Carregamento / Caderno de Montagem ───────────────────────────────────
  // `area` casa com as chaves de BRIEFING_AREAS (src/lib/briefing-areas.ts).
  assembly: [
    { area: "ceremony", name: "Arco de oliveiras", model: "Estrutura curva 2,4m", quantity: 1, unit: "un", supplierName: "Flores de Aurora", ambiente: "Jardim das oliveiras", notes: "Montar até as 13h — foto dos noivos às 15h", checkOnAssembly: true, visibility: "equipe" as const, composicao: "Arco de oliveiras" },
    { area: "ceremony", name: "Tapete de linho cru", quantity: 1, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Jardim das oliveiras", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "ceremony", name: "Arranjos baixos do corredor", quantity: 12, unit: "un", supplierName: "Flores de Aurora", ambiente: "Jardim das oliveiras", checkOnAssembly: true, visibility: "cliente" as const, composicao: "Arranjo baixo do corredor" },
    { area: "party", name: "Mesa redonda 1,80m", model: "Madeira maciça", quantity: 18, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "party", name: "Cadeira Tiffany dourada", model: "Assento de linho", quantity: 180, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Salão de vidro", notes: "Conferir 6 reservas", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "party", name: "Centro de mesa — eucalipto e velas", quantity: 18, unit: "un", supplierName: "Flores de Aurora", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "cliente" as const, composicao: "Centro de mesa — eucalipto e velas" },
    { area: "furniture", name: "Sofá de vime do lounge", quantity: 4, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Lounge do jardim", checkOnAssembly: true, visibility: "equipe" as const },
    { area: "furniture", name: "Tapete natural do lounge", quantity: 2, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Lounge do jardim", checkOnAssembly: false, visibility: "equipe" as const },
    { area: "furniture", name: "Aparador do livro de assinaturas", model: "Madeira antiga", quantity: 1, unit: "un", supplierName: "Mobiliário Casa Rara", ambiente: "Entrada", checkOnAssembly: true, visibility: "cliente" as const },
    { area: "lighting", name: "Varal de luz cruzado", quantity: 120, unit: "m", supplierName: "Som & Luz Meridiano", ambiente: "Salão de vidro", notes: "Depende do fechamento da proposta", checkOnAssembly: false, visibility: "interno" as const },
    { area: "lighting", name: "Spots âmbar do jardim", quantity: 24, unit: "un", supplierName: "Som & Luz Meridiano", ambiente: "Jardim das oliveiras", checkOnAssembly: false, visibility: "interno" as const },
    // Receita POR COUVERT: quantidade 180 é o número de convidados, e é o
    // que transforma "1 sousplat" em "180 sousplats" no consolidado.
    { area: "party", name: "Mesa posta — linho, sousplat e guardanapo", quantity: 180, unit: "un", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "equipe" as const, composicao: "Mesa posta — linho e dourado" },
    { area: "cake", name: "Mesa do bolo — vidro e madeira", quantity: 1, unit: "un", supplierName: "Doces da Vila", ambiente: "Salão de vidro", checkOnAssembly: true, visibility: "cliente" as const },
  ],

  // ── ACERVO — O QUE A EMPRESA POSSUI ──────────────────────────────────────
  // Contagem por QUANTIDADE, nunca por peça numerada. `quantidadeTotal` é o
  // único número cadastrado: reservado, disponível e "falta voltar" são todos
  // derivados (lib/acervo.ts).
  //
  // Os números são escolhidos para a demonstração mostrar o produto fazendo o
  // trabalho, e não uma vitrine onde tudo fecha: há 150 guardanapos e a mesa
  // posta precisa de 180. O déficit de 30 aparece sozinho na reserva — e é
  // exatamente a compra de 30 que está na lista.
  collection: [
    { nome: "Vaso de vidro âmbar 18cm", unidade: "un" as const, quantidadeTotal: 58, categoria: "Vidro", material: "Vaso de vidro âmbar 18cm" },
    { nome: "Castiçal de vidro 25cm", unidade: "un" as const, quantidadeTotal: 36, categoria: "Vidro", material: "Castiçal de vidro 25cm" },
    { nome: "Sousplat dourado", unidade: "un" as const, quantidadeTotal: 200, categoria: "Mesa posta", material: "Sousplat dourado" },
    { nome: "Guardanapo de linho verde-oliva", unidade: "un" as const, quantidadeTotal: 150, categoria: "Têxtil", material: "Guardanapo de linho verde-oliva", notes: "Lavagem especializada — 5 dias entre eventos." },
    { nome: "Tapete natural 2x3m", unidade: "un" as const, quantidadeTotal: 6, categoria: "Têxtil" },
  ],

  // ── Reservas do acervo para este casamento ───────────────────────────────
  // Janela operacional inclusiva: sai na véspera, volta no dia seguinte.
  // Nada saiu ainda (`saiu`/`voltou` ausentes) porque o evento está no futuro —
  // inventar uma saída seria descrever uma operação que não aconteceu.
  reservations: [
    { item: "Vaso de vidro âmbar 18cm", quantidade: 30, origem: "ficha" as const, necessidadeTecnica: 30 },
    { item: "Sousplat dourado", quantidade: 180, origem: "ficha" as const, necessidadeTecnica: 180 },
    { item: "Guardanapo de linho verde-oliva", quantidade: 180, origem: "ficha" as const, necessidadeTecnica: 180, notes: "Faltam 30 — compra aberta com Linhos do Vale." },
    { item: "Castiçal de vidro 25cm", quantidade: 24, origem: "manual" as const, notes: "Pedido da noiva depois do briefing: castiçais no lounge." },
    { item: "Tapete natural 2x3m", quantidade: 2, origem: "manual" as const },
  ],

  /** Janela da reserva — véspera da montagem até o dia seguinte à desmontagem. */
  reservationWindow: { inicio: "2026-10-09", fim: "2026-10-11" },

  // ── Histórico do acervo ──────────────────────────────────────────────────
  // AUDITORIA, não fonte de verdade: explica como o estoque chegou onde está.
  // Aplicados em ordem, fecham em `quantidadeTotal` — 0 → 60 → 58.
  adjustments: [
    { item: "Vaso de vidro âmbar 18cm", tipo: "entrada" as const, delta: 60, quantidadeAntes: 0, quantidadeDepois: 60, motivo: "Compra para o casamento Marina & Gabriel", doEvento: true },
    { item: "Vaso de vidro âmbar 18cm", tipo: "quebra" as const, delta: -2, quantidadeAntes: 60, quantidadeDepois: 58, motivo: "Duas peças trincadas na conferência de recebimento", doEvento: true },
  ],

  // ── A PROPOSTA COMERCIAL QUE GANHOU ESTE CASAMENTO ───────────────────────
  //
  // É o único documento do demo escrito PARA A CLIENTE, e ele existe para
  // mostrar a diferença entre os dois papéis que o ALTAR guarda: o Orçamento
  // acima traz custo (107.500), lucro e margem; esta proposta traz escopo e
  // investimento, e nada mais.
  //
  // ── DE ONDE VEM O NÚMERO ─────────────────────────────────────────────────
  // NÃO foi inventado. Os cinco itens somam exatamente 186.500, que é a linha
  // de RECEITA do orçamento (`budget`, "Projeto de decoração — contrato") e o
  // mesmo valor de `event.budget` e do lead do casal. Um demo em que a
  // proposta e o orçamento discordam ensinaria, na primeira tela, que os
  // números do ALTAR não fecham.
  //
  // O QUE A DECOMPOSIÇÃO É: o mesmo total, apresentado por AMBIENTE — é assim
  // que a cliente entende o que está comprando, e não por categoria de custo
  // (flores, mobiliário, equipe), que é a leitura da decoradora.
  //
  // Datas FIXAS e no passado: a proposta foi enviada em junho e aceita nove
  // dias depois, coerente com "Fechado em junho" no funil. Como está aceita,
  // ela nunca "vence" — `estaVencida` não envelhece uma proposta decidida, e
  // por isso o demo não apodrece com o tempo.
  proposta: {
    titulo: "Marina & Gabriel — projeto de decoração",
    apresentacao:
      `Um casamento ao ar livre que começa no fim da tarde, entre as oliveiras, ` +
      `e termina dentro do salão de vidro com a noite inteira acesa. A paleta ` +
      `nasce do próprio terreno — âmbar, marfim e verde-oliva — e a luz é o ` +
      `material principal: ela muda três vezes ao longo da festa, e o projeto ` +
      `foi desenhado para acompanhar cada uma delas.`,
    enviadaEm: "2026-06-02T14:30:00.000Z",
    decididaEm: "2026-06-11T18:05:00.000Z",
    validadeAte: "2026-06-30",
    condicoesPagamento:
      `30% na assinatura do contrato e o saldo em 3 parcelas mensais, a ` +
      `última até 10 dias antes do evento.`,
    observacoes:
      `Os valores contemplam projeto, produção, montagem e desmontagem. ` +
      `Buffet, bebidas, som e locação do espaço são contratados diretamente ` +
      `pelos noivos com a Fazenda Aurora.`,
    // 24.500 + 41.000 + 62.000 + 33.500 + 25.500 = 186.500
    itens: [
      { descricao: "Projeto e direção de arte", detalhe: "Concepção, pranchas, visitas técnicas e acompanhamento até o dia", valor: 24_500 },
      { descricao: "Cerimônia no jardim das oliveiras", detalhe: "Altar, caminho, cadeiras e arranjos de chão", valor: 41_000 },
      { descricao: "Salão de vidro — mesas e mesa posta", detalhe: "180 convidados: centros, tecidos, louça e marcadores", valor: 62_000 },
      { descricao: "Estruturas cenográficas", detalhe: "Arco, painéis e marcenaria sob medida", valor: 33_500 },
      { descricao: "Iluminação e ambientação noturna", detalhe: "Jardim, salão e pista, com três cenas ao longo da noite", valor: 25_500 },
    ],
  },

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
