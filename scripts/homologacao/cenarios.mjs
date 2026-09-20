// ─────────────────────────────────────────────────────────────────────────────
// OS OITO CENÁRIOS DA HOMOLOGAÇÃO — fonte única.
//
// Antes, a mensagem vivia no script de shell e o palpite da triagem num `.mjs`
// separado, ligados só pelo número de telefone escrito à mão nos dois lugares.
// Mudar um telefone num arquivo e esquecer do outro produzia uma conversa sem
// triagem — e o script dizia "⚠ sem identidade", sem dizer por quê.
//
// Agora a mensagem e o palpite moram no MESMO objeto. Não há como divergirem.
//
// ── TUDO AQUI É FICTÍCIO ────────────────────────────────────────────────────
// Telefones no padrão (DD) 9000X-XXXX, a mesma convenção do seed de
// demonstração (`convex/lib/demoData.ts`): número inventado, que não alcança
// ninguém. Nomes, empresas e textos também. Nenhum contato real entra aqui.
//
// ── POR QUE O PALPITE É FIXO ────────────────────────────────────────────────
// Em produção quem classifica é uma action que chama o modelo. Na homologação
// pulamos SÓ a chamada ao modelo e usamos a MESMA mutation interna com um
// palpite fixo, por três razões:
//
//   1. homologação não pode depender de rede nem de chave de IA;
//   2. o resultado precisa ser o mesmo toda vez, senão não dá para conferir;
//   3. o que se homologa aqui é a OPERAÇÃO — a qualidade do modelo é outra
//      conversa, medida por `communicationTriage.divergiu` ao longo do uso.
//
// ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
// `wamid` é fixo por cenário. O gateway trata identificador repetido como
// `duplicate` e não cria nada — rodar o script duas vezes não duplica mensagem.
// ─────────────────────────────────────────────────────────────────────────────

/** Prefixo de todo identificador de mensagem desta homologação. */
export const PREFIXO_WAMID = "wamid.HOMOLOG.";

export const CENARIOS = [
  {
    chave: "COMERCIAL.DECOR",
    telefone: "5511900010001",
    nome: "Helena Prado",
    minutosAtras: 18,
    texto:
      "Oi! Vi o ALTAR no Instagram. Tenho uma empresa de decoração em Campinas e " +
      "queria ver uma demonstração ainda esta semana, pode ser?",
    triagem: {
      departamento: "comercial",
      categoria: "demonstracao",
      prioridade: "alta",
      confianca: 0.93,
      assunto: "Demonstração — decoradora em Campinas",
      resumo:
        "Decoradora viu o ALTAR no Instagram e quer demonstração ainda esta semana. Sinal de compra claro.",
      sinais: ["pediu demonstração", "prazo próprio (esta semana)", "veio do Instagram"],
      respostaSugerida:
        "Oi, Helena! Que bom ter você por aqui. Consigo te mostrar o ALTAR ainda esta semana — tenho quinta às 10h ou sexta às 16h. Qual fica melhor? A demonstração leva uns 30 minutos e já saio de lá com o seu primeiro evento montado.",
      trabalho: "demonstracao",
    },
  },
  {
    chave: "COMERCIAL.BUFFET",
    telefone: "5511900010002",
    nome: "Rodrigo Tavares",
    minutosAtras: 95,
    texto:
      "Boa tarde. Sou do Buffet Villa Real. Vocês têm uma versão para buffet? " +
      "Queria entender preços e o que entra no plano.",
    triagem: {
      departamento: "comercial",
      categoria: "novo_interessado",
      prioridade: "normal",
      confianca: 0.78,
      assunto: "Buffet querendo conhecer o ALTAR Buffet",
      resumo:
        "Buffet Villa Real pergunta se existe versão para buffet, preços e o que entra no plano.",
      sinais: ["vertical buffet", "pergunta de preço", "empresa estabelecida"],
      respostaSugerida:
        "Boa tarde, Rodrigo! O ALTAR nasceu na decoração e a versão para buffet está em construção — posso te mostrar o que já existe hoje e te colocar na lista de quem entra primeiro. Te ligo amanhã de manhã?",
      trabalho: "follow_up",
    },
  },
  {
    chave: "ONBOARDING",
    telefone: "5521900010003",
    nome: "Carla Menezes",
    minutosAtras: 240,
    texto:
      "Assinei ontem e estou perdida pra começar. Por onde eu cadastro meu primeiro " +
      "evento e a equipe?",
    triagem: {
      departamento: "suporte",
      categoria: "onboarding",
      prioridade: "alta",
      confianca: 0.88,
      assunto: "Assinante nova perdida no começo",
      resumo:
        "Assinou ontem e não sabe por onde começar: quer cadastrar o primeiro evento e a equipe.",
      sinais: ["assinante nova", "risco de abandono no primeiro dia"],
      respostaSugerida:
        "Oi, Carla! Bem-vinda. O caminho mais curto é: Eventos → Novo evento (nome, data, local e cliente) e depois Equipe → Adicionar membro. Se preferir, faço isso com você numa chamada de 15 minutos hoje ainda. Quer?",
      trabalho: "onboarding",
    },
  },
  {
    chave: "SUPORTE",
    telefone: "5531900010004",
    nome: "Patrícia Lemos",
    minutosAtras: 420,
    texto:
      "A ficha técnica não está somando as flores do arranjo. Já refiz duas vezes e " +
      "continua dando o mesmo número errado.",
    triagem: {
      departamento: "suporte",
      categoria: "problema",
      prioridade: "alta",
      confianca: 0.71,
      assunto: "Ficha técnica somando errado",
      resumo:
        "Relata que a ficha técnica não soma as flores do arranjo; já refez duas vezes e o número continua errado.",
      sinais: ["possível defeito", "cliente já tentou duas vezes", "área: ficha técnica"],
      respostaSugerida:
        "Patrícia, obrigado por avisar — e desculpe o retrabalho. Pode me mandar o nome do evento e do arranjo? Vou conferir a receita item a item e te digo hoje se é ajuste de cadastro ou defeito nosso.",
      trabalho: "suporte",
      // Sem `sinalDeProduto`: a Ouvidoria só registra quando a CATEGORIA da
      // conversa é de ouvidoria (regra de `aplicarTriagem`), e esta é
      // "problema". O defeito daqui é registrado À MÃO na tela — que é
      // justamente o caminho do registro humano que a homologação exercita.
    },
  },
  {
    chave: "FINANCEIRO",
    telefone: "5541900010005",
    nome: "Juliana Berto",
    minutosAtras: 600,
    texto:
      "Bom dia! Chegou uma cobrança e eu achei que meu plano fosse o mensal antigo. " +
      "Consigo ver o que foi cobrado?",
    triagem: {
      departamento: "financeiro",
      categoria: "cobranca",
      prioridade: "normal",
      confianca: 0.84,
      assunto: "Dúvida sobre o que foi cobrado",
      resumo:
        "Cliente recebeu cobrança e achava estar no plano mensal antigo. Quer ver o detalhe do que foi cobrado.",
      // NADA de movimentação: a Central CLASSIFICA e ORIENTA. Quem mexe em
      // cobrança é o fluxo financeiro, por decisão humana, fora daqui. É esta
      // fronteira que a ETAPA 5 da homologação prova no banco.
      sinais: ["dúvida de cobrança", "sem pedido de cancelamento"],
      respostaSugerida:
        "Bom dia, Juliana! Consigo te explicar certinho. O detalhe de cada cobrança fica em Configurações → Assinatura, e eu te mando também o histórico por e-mail. Se algo estiver diferente do combinado, a gente corrige.",
      trabalho: "contato_cobranca",
    },
  },
  {
    chave: "OUVIDORIA",
    telefone: "5551900010006",
    nome: "Marina Duarte",
    minutosAtras: 1500,
    texto:
      "Estou bem chateada. Perdi a tarde toda tentando subir as fotos do casamento e " +
      "o sistema derrubou tudo duas vezes.",
    triagem: {
      departamento: "ouvidoria",
      categoria: "reclamacao",
      prioridade: "alta",
      confianca: 0.9,
      assunto: "Perdeu a tarde subindo fotos",
      resumo:
        "Cliente insatisfeita: tentou subir as fotos do casamento e o sistema derrubou o envio duas vezes.",
      sinais: ["insatisfação explícita", "perda de tempo do cliente", "upload de fotos"],
      respostaSugerida:
        "Marina, sinto muito — perder uma tarde de trabalho é sério e a culpa é nossa, não sua. Já registrei o caso e vou acompanhar pessoalmente. Pode me dizer o tamanho aproximado das fotos e se foi pelo celular ou computador?",
      trabalho: "retorno",
      sinalDeProduto: {
        titulo: "Upload de fotos falha em lote grande",
        descricao: "Envio interrompido duas vezes na mesma sessão, com perda do progresso.",
        severidade: "critica",
      },
    },
  },
  {
    chave: "PRODUTO",
    telefone: "5561900010007",
    nome: "Fernanda Rocha",
    minutosAtras: 2800,
    texto:
      "Sugestão: seria ótimo exportar o orçamento em Excel pra mandar pro contador. " +
      "Hoje só sai PDF.",
    triagem: {
      departamento: "ouvidoria",
      categoria: "funcionalidade",
      prioridade: "baixa",
      confianca: 0.95,
      assunto: "Exportar orçamento em Excel",
      resumo: "Pede exportação do orçamento em Excel para enviar ao contador; hoje só há PDF.",
      sinais: ["pedido de funcionalidade", "uso contábil"],
      respostaSugerida:
        "Fernanda, ótima ideia — anotei aqui como pedido formal. Hoje o orçamento sai em PDF; vou levar o Excel para a próxima rodada de produto e te aviso quando entrar.",
      sinalDeProduto: {
        titulo: "Exportar orçamento em Excel",
        descricao: "Cliente precisa mandar o orçamento ao contador em planilha, não em PDF.",
        severidade: "media",
      },
    },
  },
  {
    chave: "CEO",
    telefone: "5571900010008",
    nome: "Beatriz Nunes",
    minutosAtras: 35,
    texto:
      "Preciso falar com o responsável. Tenho 14 decoradoras na minha rede e quero " +
      "fechar contrato para todas, mas só se tiver condição especial e contrato " +
      "assinado esta semana.",
    triagem: {
      departamento: "comercial",
      categoria: "conversao",
      prioridade: "urgente",
      // Confiança BAIXA de propósito: é o que justifica a escalada. Uma IA
      // segura de si numa negociação fora da tabela seria o cenário errado
      // para demonstrar o portão de aprovação humana.
      confianca: 0.52,
      assunto: "Rede com 14 decoradoras quer condição especial",
      resumo:
        "Quer fechar para 14 decoradoras, com condição comercial fora da tabela e contrato assinado esta semana.",
      sinais: [
        "negociação fora da política",
        "volume alto",
        "prazo curto",
        "confiança baixa da IA",
      ],
      escalar: true,
      motivoDoEscalonamento: "Desconto fora da tabela para 14 contas — decisão é do CEO",
      respostaSugerida:
        "Beatriz, que oportunidade boa. Condição para 14 contas eu não fecho sozinho — vou falar com o Matheus hoje e te trago a proposta ainda nesta semana. Posso te ligar amanhã de manhã?",
      trabalho: "follow_up",
    },
  },
];

/** O identificador de mensagem do cenário. Fixo — é o que garante idempotência. */
export function wamidDe(cenario) {
  return `${PREFIXO_WAMID}${cenario.chave}`;
}

/** O telefone em E.164, como o gateway o normaliza e o grava na identidade. */
export function e164De(cenario) {
  return `+${cenario.telefone}`;
}
