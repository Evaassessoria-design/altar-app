import type { Doc } from "@/convex/_generated/dataModel.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE das áreas do Briefing.
//
// Antes desta refatoração a definição existia duplicada em dois lugares — a UI
// (briefing/page.tsx) e o PDF (generate-event-pdf.ts) — e já tinha divergido:
// `insuranceInfo` não aparecia em nenhum dos dois (campo órfão no banco) e
// `referenceImages` sumia do PDF. Agora UI, PDF do evento e Caderno de Montagem
// consomem este módulo.
//
// REGRA: nenhuma chave de campo muda. A reorganização é de APRESENTAÇÃO — o
// schema de `briefings` continua exatamente como está e nenhum dado se move.
// ─────────────────────────────────────────────────────────────────────────────

export type BriefingDoc = Doc<"briefings">;
export type BriefingFields = Omit<
  BriefingDoc,
  "_id" | "_creationTime" | "eventId" | "userId"
>;
export type BriefingFieldKey = keyof BriefingFields;

/** Audiências dos relatórios. Hoje só "equipe" tem PDF; as outras já são filtráveis. */
export type Audience = "interno" | "cliente" | "equipe";

const ALL: Audience[] = ["interno", "cliente", "equipe"];
const TEAM_ONLY: Audience[] = ["interno", "equipe"];
const INTERNAL_ONLY: Audience[] = ["interno"];

/** Uma resposta curta: Sim / Não / A definir / Não se aplica, conforme o contexto. */
export type OpcaoDeEscolha = { valor: string; rotulo: string };

export const SIM_NAO_A_DEFINIR: OpcaoDeEscolha[] = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "a_definir", rotulo: "A definir" },
];

export const SIM_NAO_A_CONFIRMAR: OpcaoDeEscolha[] = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "a_confirmar", rotulo: "A confirmar" },
];

export type BriefingField = {
  key: BriefingFieldKey;
  label: string;
  /** "escolha" = botões de resposta curta (`opcoes`), gravada como texto. */
  type?: "text" | "textarea" | "escolha";
  opcoes?: OpcaoDeEscolha[];
  /** Uma linha de ajuda embaixo do rótulo. */
  dica?: string;
  /** Quem pode ver. Financeiro e jurídico ficam restritos a "interno". */
  visibility: Audience[];
};

/**
 * Os itens de um bloco do briefing. NÃO é um cadastro novo: são
 * `assemblyItems` com `bloco` preenchido — os mesmos que o Caderno, a Folha
 * de Carregamento e o Projeto Visual leem. Ver `convex/lib/itemDoBriefing.ts`.
 */
export type ItensDoBloco = {
  /** Gravado em `assemblyItems.bloco`. Nunca muda depois de publicado. */
  bloco: string;
  /** Um toque cria o item com este nome. */
  sugestoes: string[];
  /** O ambiente com que o item nasce (editável). */
  ambiente?: string;
  /** Aparece na conferência de Mobiliário. */
  mobiliario?: boolean;
  /**
   * Muda as perguntas do item:
   *  · "flor" pergunta natural ou permanente;
   *  · "iluminacao" fala de origem como "incluída / fornecedor da cliente /
   *    do espaço";
   *  · "personalizacao" nasce "Em avaliação" — pedido que ainda não virou
   *    obrigação de montagem.
   */
  tipo?: "flor" | "iluminacao" | "personalizacao";
};

export type BriefingGroup = {
  /** Chave estável do bloco (para abrir/fechar). Ausente nos grupos antigos. */
  key?: string;
  /** Subtítulo dentro da área (ex.: "Conceito do Evento"). */
  label?: string;
  /** Uma frase dizendo o que o bloco cobre. */
  descricao?: string;
  fields: BriefingField[];
  itens?: ItensDoBloco;
  /**
   * Mostra o bloco só quando este campo tem este valor — o cantinho das
   * crianças só abre os detalhes quando a resposta é "Sim".
   */
  mostrarSe?: { campo: BriefingFieldKey; valor: string };
  /** O conteúdo que não é o centro da aba: começa recolhido. */
  complementar?: boolean;
  /** Fotos de referência da Galeria, para marcar Inspiração × Modelo aprovado. */
  referencias?: { ambiente?: string };
};

export type BriefingArea = {
  key: string;
  label: string;
  emoji: string;
  /**
   * Nome do ESPAÇO quando o item não tem ambiente próprio. O rótulo da aba
   * ("Iluminação e conexão elétrica") é longo demais para um título de bloco
   * no caderno.
   */
  rotuloDoAmbiente?: string;
  /** Área aceita itens físicos estruturados (assemblyItems). */
  supportsItems: boolean;
  /** A aba mostra a conferência consolidada de mobiliário do evento inteiro. */
  conferenciaDeMobiliario?: boolean;
  groups: BriefingGroup[];
};

// ─────────────────────────────────────────────────────────────────────────────
// A REORGANIZAÇÃO DE 14/10
//
// As abas continuam as mesmas, na mesma ordem e com as mesmas CHAVES (`key`).
// Dentro de cada uma, os campos viraram BLOCOS recolhíveis, e cada bloco tem
// itens com sugestões de um toque — em vez de uma tela inteira de campos de
// texto em que "Arco da Cerimônia" e "Decoração do Corredor" carregavam tudo.
//
// NENHUMA CHAVE DE CAMPO MUDOU E NENHUM CAMPO SAIU. Os que não têm mais lugar
// natural ficam em "Informações complementares" do bloco ou da aba, com o
// texto antigo intacto. O teste `briefing-reorganizado.test.ts` confere que
// toda chave do schema continua aparecendo exatamente uma vez.
// ─────────────────────────────────────────────────────────────────────────────

export const BRIEFING_AREAS: BriefingArea[] = [
  {
    key: "general",
    label: "Informações Gerais",
    emoji: "📋",
    supportsItems: false,
    groups: [
      {
        fields: [
          { key: "guestCount", label: "Número de Convidados", visibility: ALL },
          { key: "theme", label: "Tema do Evento", visibility: ALL },
          { key: "venueContact", label: "Contato do Espaço", visibility: TEAM_ONLY },
          { key: "venueRules", label: "Regras do Espaço", type: "textarea", visibility: ALL },
        ],
      },
      {
        label: "Conceito do Evento",
        fields: [
          { key: "colorPalette", label: "Paleta de Cores", visibility: ALL },
          { key: "decorStyle", label: "Estilo da Decoração", visibility: ALL },
          { key: "atmosphereDescription", label: "Atmosfera", type: "textarea", visibility: ALL },
          { key: "referenceImages", label: "Imagens de Referência (URLs)", visibility: ALL },
        ],
      },
      {
        label: "Operação",
        fields: [
          { key: "setupTime", label: "Horário de Montagem", visibility: TEAM_ONLY },
          { key: "teardownTime", label: "Horário de Desmontagem", visibility: TEAM_ONLY },
          { key: "parkingInfo", label: "Estacionamento", visibility: TEAM_ONLY },
          { key: "accessibilityNeeds", label: "Necessidades de Acessibilidade", visibility: ALL },
          { key: "emergencyContact", label: "Contato de Emergência", visibility: TEAM_ONLY },
          // Recuperado: existia no banco mas não aparecia em lugar nenhum.
          { key: "insuranceInfo", label: "Seguro / Apólice", visibility: INTERNAL_ONLY },
        ],
      },
      {
        label: "Observações",
        fields: [
          { key: "restrictions", label: "Restrições / Limitações", type: "textarea", visibility: ALL },
          { key: "vendorContacts", label: "Contatos dos Fornecedores", type: "textarea", visibility: TEAM_ONLY },
          { key: "generalNotes", label: "Notas Gerais", type: "textarea", visibility: ALL },
          { key: "otherNotes", label: "Outras Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "ceremony",
    label: "Cerimônia",
    emoji: "💒",
    supportsItems: true,
    groups: [
      {
        key: "cerimonia_geral",
        label: "Horário, local e montagem",
        fields: [
          { key: "ceremonyTime", label: "Horário da Cerimônia", visibility: ALL },
          { key: "ceremonyLocation", label: "Local da cerimônia", visibility: ALL },
          { key: "ceremonySetupDeadline", label: "Prazo de montagem", dica: "Até quando a cerimônia precisa estar pronta.", visibility: TEAM_ONLY },
          {
            key: "ceremonyReuse",
            label: "Peças que vão da cerimônia para a festa",
            type: "textarea",
            dica: "Para cada peça, registre também o reaproveitamento no próprio item.",
            visibility: ALL,
          },
        ],
      },
      {
        key: "altar",
        label: "Altar",
        descricao: "Arranjos, arco ou estrutura de fundo, floreiras e genuflexório.",
        fields: [
          // A CHAVE antiga continua: o texto de quem já preencheu aparece aqui.
          { key: "ceremony_arch", label: "Arco ou estrutura de fundo (anotação)", visibility: ALL },
        ],
        itens: {
          bloco: "altar",
          ambiente: "Altar",
          sugestoes: ["Arranjos do altar", "Arco de flores", "Estrutura de fundo", "Floreiras", "Vasos", "Pedestais", "Genuflexório"],
        },
      },
      {
        key: "entrada",
        label: "Entrada e corredor",
        descricao: "Arco da entrada, passadeira, arranjos nos bancos e ao longo do corredor.",
        fields: [{ key: "aisle_decor", label: "Decoração do corredor (anotação)", visibility: ALL }],
        itens: {
          bloco: "entrada",
          ambiente: "Entrada e corredor",
          sugestoes: ["Arco de flores na entrada", "Passadeira", "Carpete", "Arranjos nos bancos", "Arranjos do corredor", "Floreiras"],
        },
      },
      {
        key: "assentos",
        label: "Assentos e apoios",
        descricao: "Cadeiras, bancos, lugares dos pais e padrinhos, mesa de assinatura.",
        fields: [],
        itens: {
          bloco: "assentos",
          ambiente: "Cerimônia",
          mobiliario: true,
          sugestoes: ["Cadeiras", "Bancos", "Lugares dos pais", "Lugares dos padrinhos", "Mesa de assinatura", "Mesa de apoio"],
        },
      },
      {
        key: "flores_pessoais",
        label: "Flores pessoais",
        descricao: "Buquês, buquezinhos das daminhas, lapelas e corsages.",
        fields: [],
        itens: {
          bloco: "flores_pessoais",
          tipo: "flor",
          sugestoes: ["Buquê da noiva", "Buquê para jogar", "Buquezinhos das daminhas", "Lapelas", "Corsages"],
        },
      },
      {
        key: "cantinho",
        label: "Cantinho das crianças",
        descricao: "Comum em cerimônias em fazenda — vale para qualquer local.",
        fields: [
          { key: "kidsCorner", label: "Haverá cantinho das crianças?", type: "escolha", opcoes: SIM_NAO_A_DEFINIR, visibility: ALL },
        ],
      },
      {
        key: "cantinho_detalhes",
        label: "Detalhes do cantinho",
        mostrarSe: { campo: "kidsCorner", valor: "sim" },
        fields: [
          { key: "kidsCornerLocation", label: "Localização", visibility: ALL },
          { key: "kidsCornerResponsible", label: "Responsável pela montagem", visibility: TEAM_ONLY },
        ],
        itens: {
          bloco: "cantinho",
          ambiente: "Cantinho das crianças",
          sugestoes: ["Tapete", "Almofadas", "Mesinha", "Cestos de brinquedos"],
        },
      },
    ],
  },
  {
    key: "party",
    label: "Festa",
    emoji: "🎉",
    supportsItems: true,
    groups: [
      {
        key: "festa_geral",
        label: "Horário, toalhas e guardanapos",
        fields: [
          { key: "receptionTime", label: "Horário da Recepção", visibility: ALL },
          { key: "tableClothColor", label: "Cor da Toalha de Mesa", visibility: ALL },
          { key: "napkinStyle", label: "Estilo do Guardanapo", visibility: ALL },
        ],
      },
      {
        key: "mesas",
        label: "Mesas de convidados",
        descricao: "Mesas, cadeiras, toalhas, arranjos, velas e identificação. Cadastre um item para cada modelo de arranjo.",
        fields: [
          // O "Arranjo Central" antigo: o texto continua aqui; os modelos
          // (A, B…) passam a ser itens, cada um com quantidade e foto.
          { key: "centerpiece", label: "Arranjo central (anotação)", visibility: ALL },
        ],
        itens: {
          bloco: "mesas",
          ambiente: "Salão",
          mobiliario: true,
          sugestoes: ["Mesas redondas", "Mesas retangulares", "Cadeiras", "Toalhas", "Guardanapos", "Arranjo de mesa — modelo A", "Arranjo de mesa — modelo B", "Velas", "Identificação das mesas"],
        },
      },
      {
        key: "gastronomia",
        label: "Áreas gastronômicas",
        descricao: "Aparadores da ilha gastronômica, do jantar, do café e das sobremesas.",
        fields: [],
        itens: {
          bloco: "gastronomia",
          mobiliario: true,
          sugestoes: ["Aparador da ilha gastronômica", "Aparador do jantar", "Aparador do café", "Aparador de sobremesas", "Arranjos dos aparadores"],
        },
      },
      {
        key: "bar",
        label: "Bar",
        descricao: "Móvel, fundo decorativo, arranjos e acabamento.",
        fields: [
          { key: "drinkService", label: "Serviço de bebidas (informação complementar)", visibility: ALL },
        ],
        itens: {
          bloco: "bar",
          ambiente: "Bar",
          mobiliario: true,
          sugestoes: ["Móvel do bar", "Fundo decorativo do bar", "Arranjos do bar", "Acabamento do bar"],
        },
      },
      {
        key: "convivencia",
        label: "Convivência",
        descricao: "Lounges, sofás, poltronas, mesas de apoio, bistrôs e banquetas.",
        fields: [],
        itens: {
          bloco: "convivencia",
          ambiente: "Lounge",
          mobiliario: true,
          sugestoes: ["Lounge", "Sofá", "Poltronas", "Mesas de apoio", "Bistrôs", "Banquetas"],
        },
      },
      {
        key: "outros_ambientes",
        label: "Outros ambientes",
        descricao: "Entrada da recepção, banheiros, ponto instagramável, painéis e carpetes.",
        fields: [],
        itens: {
          bloco: "outros_ambientes",
          sugestoes: ["Entrada da recepção", "Arranjos dos banheiros", "Ponto instagramável", "Painel", "Carpete"],
        },
      },
    ],
  },
  {
    key: "furniture",
    label: "Mobiliário e conferência",
    rotuloDoAmbiente: "Mobiliário",
    emoji: "🪑",
    supportsItems: true,
    conferenciaDeMobiliario: true,
    groups: [
      {
        key: "moveis_avulsos",
        label: "Outros móveis e apoios",
        descricao: "O que não pertence a um bloco da cerimônia, da festa ou da mesa do bolo.",
        fields: [],
        itens: {
          bloco: "moveis_avulsos",
          mobiliario: true,
          sugestoes: ["Aparador", "Mesa de apoio", "Painel", "Biombo"],
        },
      },
      {
        key: "mobiliario_complementar",
        label: "Anotações do mobiliário (texto antigo)",
        complementar: true,
        fields: [
          { key: "guestTableType", label: "Tipo das Mesas dos Convidados", visibility: ALL },
          { key: "guestTableCount", label: "Quantidade de Mesas", visibility: ALL },
          { key: "guestChairType", label: "Tipo das Cadeiras", visibility: ALL },
          { key: "guestChairCount", label: "Quantidade de Cadeiras", visibility: ALL },
          { key: "sweetTableIncluded", label: "Mesa de Doces? (Sim/Não)", visibility: ALL },
          { key: "sweetTableStyle", label: "Estilo da Mesa de Doces", visibility: ALL },
          { key: "loungeIncluded", label: "Lounge? (Sim/Não)", visibility: ALL },
          { key: "loungeDescription", label: "Descrição do Lounge", type: "textarea", visibility: ALL },
          { key: "signTable", label: "Mesa de Assinar / Welcome Table", visibility: ALL },
          { key: "furnitureSupplier", label: "Fornecedor de Móveis", visibility: TEAM_ONLY },
          { key: "furnitureNotes", label: "Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "flowers",
    label: "Flores e referências florais",
    rotuloDoAmbiente: "Flores",
    emoji: "🌸",
    supportsItems: true,
    groups: [
      {
        key: "flores_direcao",
        label: "Direção visual",
        fields: [
          { key: "flowerColors", label: "Paleta das flores", visibility: ALL },
          { key: "flowersPreferred", label: "Flores preferidas", visibility: ALL },
          { key: "flowersAvoid", label: "Flores que a cliente não deseja", visibility: ALL },
          { key: "flowerInspirations", label: "Inspirações", type: "textarea", visibility: ALL },
        ],
        referencias: {},
      },
      {
        key: "flores_contratadas",
        label: "Flores contratadas",
        descricao: "Espécie, cor ou variedade, natural ou permanente.",
        fields: [
          { key: "flowerTypes", label: "Tipos de flores (anotação)", visibility: ALL },
          { key: "flowerSubstitutions", label: "Substituições aprovadas", type: "textarea", visibility: ALL },
        ],
        itens: {
          bloco: "flores_contratadas",
          tipo: "flor",
          sugestoes: ["Rosas", "Hortênsias", "Lisianthus", "Folhagens", "Flores nobres"],
        },
      },
      {
        key: "flores_aplicacoes",
        label: "Aplicações",
        descricao: "Buquê, lapela, corsage e buquezinhos. Os arranjos do altar, do corredor, das mesas e da mesa do bolo ficam nos blocos de cada ambiente.",
        fields: [
          { key: "bouquetStyle", label: "Estilo do Buquê", visibility: ALL },
          { key: "boutonniere", label: "Boutonnière / Lapela", visibility: ALL },
          { key: "corsage", label: "Corsage", visibility: ALL },
        ],
      },
      {
        key: "flores_complementar",
        label: "Informações complementares",
        complementar: true,
        fields: [
          { key: "flowerSupplier", label: "Fornecedor de Flores", visibility: TEAM_ONLY },
          // Financeiro: nunca sai em relatório de equipe ou de cliente.
          { key: "flowerBudget", label: "Orçamento de Flores (R$)", visibility: INTERNAL_ONLY },
          { key: "flowersNotes", label: "Observações sobre Flores", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "cake",
    label: "Mesa do bolo e doces",
    // O nome do ESPAÇO continua o de sempre: os cadernos e o Projeto Visual
    // de quem já cadastrou item sem ambiente agrupam por ele.
    rotuloDoAmbiente: "Bolo e Doces",
    emoji: "🎂",
    supportsItems: true,
    groups: [
      {
        key: "bolo_composicao",
        label: "Composição",
        descricao: "Mesas e aparadores, painel ou fundo, carpete e disposição.",
        fields: [],
        itens: {
          bloco: "bolo_composicao",
          ambiente: "Mesa do bolo",
          mobiliario: true,
          sugestoes: ["Mesa do bolo", "Aparadores", "Painel de fundo", "Carpete"],
        },
      },
      {
        key: "bolo_decoracao",
        label: "Decoração",
        fields: [],
        itens: {
          bloco: "bolo_decoracao",
          ambiente: "Mesa do bolo",
          sugestoes: ["Arranjos", "Folhagens", "Vasos", "Velas", "Elementos suspensos"],
        },
      },
      {
        key: "bolo_pecas",
        label: "Peças para doces",
        fields: [],
        itens: {
          bloco: "bolo_pecas",
          ambiente: "Mesa do bolo",
          sugestoes: ["Bandejas", "Boleira", "Pratos", "Pedestais", "Suportes para doces"],
        },
      },
      {
        key: "bolo",
        label: "Bolo",
        fields: [
          {
            key: "cakeType",
            label: "Bolo verdadeiro ou fake?",
            type: "escolha",
            opcoes: [
              { valor: "verdadeiro", rotulo: "Verdadeiro" },
              { valor: "fake", rotulo: "Fake" },
              { valor: "a_definir", rotulo: "A definir" },
            ],
            visibility: ALL,
          },
          { key: "cakeDesign", label: "Modelo / decoração do bolo", visibility: ALL },
          { key: "cakeDimensions", label: "Dimensões", visibility: ALL },
          { key: "cakeLayers", label: "Andares / Camadas", visibility: ALL },
          { key: "cakeSupport", label: "Suporte do bolo", visibility: ALL },
        ],
      },
      {
        key: "bolo_montagem",
        label: "Referências e montagem",
        fields: [
          { key: "cakeDeliveryResponsible", label: "Quem entrega o bolo e os doces", visibility: TEAM_ONLY },
          { key: "sweetsLayoutResponsible", label: "Quem dispõe os doces", visibility: TEAM_ONLY },
          { key: "cakeFinishResponsible", label: "Quem faz a finalização", visibility: TEAM_ONLY },
        ],
        referencias: { ambiente: "Mesa do bolo" },
      },
      {
        key: "bolo_complementar",
        label: "Informações complementares",
        complementar: true,
        fields: [
          { key: "cakeSupplier", label: "Fornecedor do Bolo", visibility: TEAM_ONLY },
          { key: "cakeFlavor", label: "Sabor do Bolo", visibility: ALL },
          { key: "sweetsIncluded", label: "Inclui Docinhos? (Sim/Não)", visibility: ALL },
          { key: "sweetsDescription", label: "Descrição dos Docinhos", visibility: ALL },
          { key: "cakeNotes", label: "Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "lighting",
    label: "Iluminação e conexão elétrica",
    rotuloDoAmbiente: "Iluminação",
    emoji: "💡",
    supportsItems: true,
    groups: [
      {
        key: "iluminacao_pontos",
        label: "Pontos de luz",
        descricao: "Para cada ponto, diga de onde vem: incluída na decoração, fornecedor da cliente ou disponível no espaço.",
        fields: [],
        itens: {
          bloco: "iluminacao",
          tipo: "iluminacao",
          sugestoes: ["Cordões de luz", "Lustres", "Luminárias", "Iluminação de arranjos", "Iluminação cênica", "Projeção", "Velas naturais", "Velas LED"],
        },
      },
      {
        key: "conexao",
        label: "Quem instala e conecta?",
        descricao: "A decoração não presume que fará a conexão elétrica.",
        fields: [
          { key: "electricInstaller", label: "Quem instala", visibility: ALL },
          {
            key: "electricConnector",
            label: "Quem conecta",
            type: "escolha",
            opcoes: [
              { valor: "eletricista", rotulo: "Eletricista" },
              { valor: "som_e_luz", rotulo: "Empresa de som e luz" },
              { valor: "equipe_do_espaco", rotulo: "Equipe do espaço" },
              { valor: "a_confirmar", rotulo: "A confirmar" },
            ],
            visibility: ALL,
          },
          { key: "electricianNeeded", label: "Precisa de eletricista?", type: "escolha", opcoes: SIM_NAO_A_CONFIRMAR, visibility: ALL },
          { key: "electricConfirmResponsible", label: "Quem confirma", visibility: ALL },
          { key: "electricSchedule", label: "Horários", visibility: ALL },
          { key: "electricNotes", label: "Observações da conexão", type: "textarea", visibility: TEAM_ONLY },
        ],
      },
      {
        key: "iluminacao_complementar",
        label: "Informações complementares",
        complementar: true,
        fields: [
          { key: "lightingType", label: "Tipo de Iluminação", visibility: ALL },
          { key: "lightingEffects", label: "Efeitos de Iluminação", visibility: ALL },
          { key: "uplighting", label: "Uplighting (cor/intensidade)", visibility: ALL },
          { key: "stringLights", label: "Cordões de Luz?", visibility: ALL },
          { key: "candleUse", label: "Uso de Velas?", visibility: ALL },
          { key: "lightingSupplier", label: "Fornecedor de Iluminação", visibility: TEAM_ONLY },
          { key: "lightingNotes", label: "Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "custom",
    label: "Personalização / Itens Especiais",
    rotuloDoAmbiente: "Personalização / Itens Especiais",
    emoji: "✨",
    supportsItems: true,
    groups: [
      {
        key: "identidade",
        label: "Identidade",
        descricao: "Monograma, nomes, frases, placas e sinalização. Pedido em avaliação não vira obrigação de montagem.",
        fields: [],
        itens: { bloco: "identidade", tipo: "personalizacao", sugestoes: ["Monograma", "Placa com os nomes", "Frases", "Sinalização"] },
      },
      {
        key: "experiencias",
        label: "Experiências e inovação",
        fields: [],
        itens: { bloco: "experiencias", tipo: "personalizacao", sugestoes: ["Experiência sensorial", "Projeção mapeada", "Estação interativa"] },
      },
      {
        key: "sob_medida",
        label: "Peças e estruturas sob medida",
        fields: [],
        itens: { bloco: "sob_medida", tipo: "personalizacao", sugestoes: ["Estrutura sob medida", "Peça sob medida"] },
      },
      {
        key: "lembrancas",
        label: "Lembranças e ponto de entrega",
        // Movido de "Bolo e Doces": lembrancinha é personalização. A CHAVE do
        // campo não mudou — nenhum dado existente foi tocado.
        fields: [{ key: "weddingFavors", label: "Lembranças para Convidados", visibility: ALL }],
        itens: { bloco: "lembrancas", tipo: "personalizacao", sugestoes: ["Lembranças", "Decoração do ponto de entrega"] },
      },
      {
        key: "pedidos",
        label: "Pedidos adicionais",
        fields: [{ key: "specialRequests", label: "Pedidos Especiais", type: "textarea", visibility: ALL }],
        itens: { bloco: "pedidos", tipo: "personalizacao", sugestoes: [] },
      },
    ],
  },
];

/** Os blocos de itens de uma área, na ordem da tela. */
export function blocosDaArea(area: BriefingArea): ItensDoBloco[] {
  return area.groups.flatMap((g) => (g.itens ? [g.itens] : []));
}

/** Os blocos cujos itens entram na conferência de Mobiliário, em todas as abas. */
export function blocosDeMobiliario(): Set<string> {
  return new Set(
    BRIEFING_AREAS.flatMap((a) => blocosDaArea(a).filter((b) => b.mobiliario).map((b) => b.bloco)),
  );
}

/** O rótulo de uma resposta curta gravada ("a_definir" → "A definir"). */
export function rotuloDaEscolha(field: BriefingField, valor: string): string {
  return field.opcoes?.find((o) => o.valor === valor)?.rotulo ?? valor;
}

// ── Visibilidade ─────────────────────────────────────────────────────────────

/**
 * Hierarquia da visibilidade de um ITEM de montagem:
 *  · "interno" → só relatório interno;
 *  · "equipe"  → equipe e interno (padrão dos itens de montagem);
 *  · "cliente" → todo mundo (se é seguro para o cliente, é seguro para todos).
 */
const ITEM_VISIBILITY: Record<string, Audience[]> = {
  interno: ["interno"],
  equipe: ["interno", "equipe"],
  cliente: ["interno", "cliente", "equipe"],
};

export function itemVisibleTo(itemVisibility: string, audience: Audience): boolean {
  return (ITEM_VISIBILITY[itemVisibility] ?? ["interno"]).includes(audience);
}

export function fieldVisibleTo(field: BriefingField, audience: Audience): boolean {
  return field.visibility.includes(audience);
}

// ── Consultas usadas por UI e relatórios ─────────────────────────────────────

export function allBriefingFields(): BriefingField[] {
  return BRIEFING_AREAS.flatMap((a) => a.groups.flatMap((g) => g.fields));
}

export function areaByKey(key: string): BriefingArea | undefined {
  return BRIEFING_AREAS.find((a) => a.key === key);
}

export type ResolvedField = { label: string; value: string };
export type ResolvedGroup = { label?: string; fields: ResolvedField[] };
export type ResolvedArea = { key: string; label: string; groups: ResolvedGroup[] };

/**
 * Aplica as duas regras absolutas do relatório condicional:
 *  1. campo vazio (ou fora da audiência) NÃO aparece;
 *  2. grupo/área sem nenhum campo restante NÃO aparece.
 * Devolve apenas o que deve ser impresso.
 */
export function resolveAreasForAudience(
  briefing: Partial<BriefingFields> | null | undefined,
  audience: Audience,
): ResolvedArea[] {
  if (!briefing) return [];

  const areas: ResolvedArea[] = [];
  for (const area of BRIEFING_AREAS) {
    const groups: ResolvedGroup[] = [];

    for (const group of area.groups) {
      const fields: ResolvedField[] = [];
      for (const field of group.fields) {
        if (!fieldVisibleTo(field, audience)) continue;
        const raw = briefing[field.key];
        const value = typeof raw === "string" ? raw.trim() : "";
        if (!value) continue;
        // Resposta curta sai pelo rótulo ("A definir"), nunca pelo valor de
        // banco ("a_definir").
        fields.push({ label: field.label, value: field.type === "escolha" ? rotuloDaEscolha(field, value) : value });
      }
      if (fields.length > 0) groups.push({ label: group.label, fields });
    }

    if (groups.length > 0) areas.push({ key: area.key, label: area.label, groups });
  }
  return areas;
}


/**
 * A área tem texto escrito nos campos antigos?
 *
 * ── A CONTRADIÇÃO SILENCIOSA QUE ISTO EXPÕE ─────────────────────────────────
 * O convite "criar itens a partir do briefing" é idempotente: depois que
 * "Cadeira Dior" virou item, ele para de oferecer. Correto — e cria um estado
 * novo que ninguém comenta.
 *
 * "Quantidade de Cadeiras: 120" continua escrito ali. Ela ajusta o ITEM para
 * 130, e o campo de texto segue dizendo 120, para sempre, sem nada na tela
 * apontando qual dos dois o produto usa. O Caderno sai com 130, a Folha de
 * Carregamento sai com 130, o PDF dos noivos sai com 130 — e o relatório
 * interno do evento sai com 120.
 *
 * A correção NÃO é apagar o texto: é anotação dela, e pode conter o que o item
 * não comporta ("as douradas, as prateadas ficam de reserva"). É DIZER que
 * aquilo é anotação.
 */
export function areaTemTextoAntigo(
  area: BriefingArea,
  briefing: Partial<BriefingFields> | null | undefined,
): boolean {
  if (!briefing || !area.supportsItems) return false;
  return area.groups.some((g) =>
    g.fields.some((f) => {
      const v = briefing[f.key];
      return typeof v === "string" && v.trim().length > 0;
    }),
  );
}
