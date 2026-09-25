// ─────────────────────────────────────────────────────────────────────────────
// "MEU ALTAR ESTÁ PRONTO?"
//
// ── TRÊS PERGUNTAS PARECIDAS QUE NÃO SÃO A MESMA ────────────────────────────
//   `saudeDoEvento`      — a OPERAÇÃO de um evento está coberta?
//   `prontidaoDoEvento`  — um evento pode ser MOSTRADO para a cliente?
//   aqui                 — a EMPRESA dela já está dentro do ALTAR?
//
// As duas primeiras respondem sobre um evento e só existem depois que ele
// existe. Esta responde no primeiro minuto da primeira sessão, quando a conta
// está vazia e ninguém sabe por onde começar.
//
// ── POR QUE NÃO BASTA `primeiros-passos.ts` ─────────────────────────────────
// Aquele módulo tem três passos (estúdio, evento, equipe) e responde "a
// configuração mínima está feita?". É o aviso do painel, e continua sendo.
//
// Só que configuração mínima não é VALOR. Uma conta com nome de estúdio e um
// evento vazio passa nos três passos e ainda não fez nada que valha a
// assinatura. Esta conta mede a JORNADA até o momento em que o ALTAR se paga —
// e diz quantos minutos faltam para lá.
//
// ── O MOMENTO AHA, NOMEADO ──────────────────────────────────────────────────
// É um só, e é mensurável: **existe um evento que pode virar um projeto para
// mandar para a cliente**. Não é "ela clicou em tudo": é que o dado que ela
// digitou uma vez virou um documento bonito sem ela reabrir o Canva.
//
// Antes disso ela está configurando. Depois disso ela está usando.
//
// ── NENHUM MARCO É UM BOTÃO DE "JÁ FIZ" ─────────────────────────────────────
// Todo marco é derivado de dado real. Caixa que a pessoa marca sozinha mente
// em duas direções: fica marcada quando ela apagou o que tinha feito, e fica
// vazia quando ela fez pelo caminho de outra tela. Aqui, apagar o último
// evento faz o marco voltar — porque é a verdade.
//
// ── O OPCIONAL NÃO REPROVA ──────────────────────────────────────────────────
// Defeito já corrigido uma vez em `src/lib/primeiros-passos.ts`: contar o
// passo opcional no progresso deixava a conta em 67% para sempre. O progresso
// aqui conta só o que é ESSENCIAL; o resto aparece, sugere, e não reprova.
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoDoMarco = "feito" | "parcial" | "pendente";

export type MarcoDaConta = {
  chave: string;
  titulo: string;
  /** Por que isto importa, na língua dela. Nunca "para completar o cadastro". */
  porque: string;
  situacao: SituacaoDoMarco;
  /** O que foi CONTADO. Sem número atrás, a tela estaria afirmando no escuro. */
  detalhe: string;
  /** A rota real onde se resolve — nunca de volta ao começo do assistente. */
  destino: string;
  /** O texto do botão. */
  acao: string;
  /**
   * Estimativa honesta, em minutos, de quem nunca viu o sistema.
   *
   * Serve para a soma "faltam ~7 minutos", que é a promessa que a tela faz.
   * Um número otimista aqui não acelera ninguém: só ensina a não acreditar no
   * próximo que o produto der.
   */
  minutos: number;
  /** Conta no progresso. O não-essencial aparece e não reprova. */
  essencial: boolean;
};

export type DadosDaConta = {
  /** Nome do estúdio no perfil. Vazio e ausente valem o mesmo. */
  studioName: string | undefined;
  temLogo: boolean;
  eventos: number;
  /** Oportunidades no funil — a porta comercial. */
  leads: number;
  propostas: number;
  materiais: number;
  materiaisComFoto: number;
  fornecedoresNoCatalogo: number;
  lancamentos: number;
  /**
   * Eventos que já passariam por `prontidaoDoEvento` sem nenhum "faltando".
   *
   * É o marco do AHA, e é o único que depende de uma conta cara — por isso
   * quem chama decide até onde olhar e diz aqui quantos conferiu.
   */
  eventosApresentaveis: number;
  /** Quantos eventos foram realmente examinados para a contagem acima. */
  eventosExaminados: number;
};

function porContagem(valor: number, confortavel: number): SituacaoDoMarco {
  if (valor <= 0) return "pendente";
  return valor < confortavel ? "parcial" : "feito";
}

/** Abaixo disto o catálogo existe, mas ainda não substitui a pasta no Drive. */
const MATERIAIS_CONFORTAVEIS = 5;

export type ProntidaoDaConta = {
  marcos: MarcoDaConta[];
  /** Marcos essenciais já cumpridos (parcial NÃO conta como cumprido). */
  feitos: number;
  essenciais: number;
  /** 0–100 sobre os essenciais. */
  percentual: number;
  /** Todos os essenciais cumpridos. */
  pronto: boolean;
  /** O primeiro marco pendente ou parcial, essencial na frente. */
  proximo: MarcoDaConta | null;
  /** Soma dos minutos do que falta. Zero quando não falta nada. */
  minutosRestantes: number;
  /**
   * O momento em que o ALTAR se pagou: existe projeto para mandar à cliente.
   *
   * Separado do progresso de propósito. Uma conta pode ter 100% dos
   * essenciais e ainda não ter chegado lá, e é justamente essa distância que
   * a tela precisa mostrar em vez de esconder atrás de uma barra cheia.
   */
  aha: {
    alcancado: boolean;
    titulo: string;
    detalhe: string;
  };
};

export function prontidaoDaConta(d: DadosDaConta): ProntidaoDaConta {
  const temNome = !!d.studioName?.trim();

  const marcos: MarcoDaConta[] = [
    {
      chave: "estudio",
      titulo: "O nome do seu estúdio",
      porque: "É o que aparece no topo de toda proposta e de todo projeto que a cliente recebe.",
      situacao: temNome ? "feito" : "pendente",
      detalhe: temNome ? (d.studioName as string).trim() : "ainda em branco",
      destino: "/configuracoes",
      acao: "Escrever o nome",
      minutos: 1,
      essencial: true,
    },
    {
      chave: "logo",
      titulo: "Sua logo",
      porque: "Sem ela o PDF que vai para a noiva sai com o nome escrito, e não com a sua marca.",
      situacao: d.temLogo ? "feito" : "pendente",
      detalhe: d.temLogo ? "enviada" : "nenhuma imagem enviada",
      destino: "/configuracoes",
      acao: "Enviar a logo",
      minutos: 2,
      essencial: true,
    },
    {
      chave: "evento",
      titulo: "Seu primeiro evento",
      porque: "É a pasta onde tudo de um casamento passa a morar: briefing, fornecedor, compra, foto e dinheiro.",
      situacao: d.eventos > 0 ? "feito" : "pendente",
      detalhe:
        d.eventos > 0
          ? `${d.eventos} ${d.eventos === 1 ? "evento" : "eventos"}`
          : "nenhum evento ainda",
      destino: "/eventos",
      acao: "Criar o primeiro evento",
      minutos: 3,
      essencial: true,
    },
    {
      chave: "fotos",
      titulo: "Fotos de um evento",
      porque:
        "É o que transforma a pasta em projeto visual. Sem foto, o documento da cliente sai só com texto.",
      // Deliberadamente derivado do MESMO critério do evento: um evento
      // apresentável é, por definição, um evento com foto e capa. Contar foto
      // solta aqui faria dois lugares do produto discordarem sobre o que é
      // "ter foto".
      situacao: d.eventosApresentaveis > 0 ? "feito" : d.eventos > 0 ? "parcial" : "pendente",
      detalhe:
        d.eventosExaminados === 0
          ? "nenhum evento para examinar"
          : `${d.eventosApresentaveis} de ${d.eventosExaminados} ${
              d.eventosExaminados === 1 ? "evento pronto" : "eventos prontos"
            } para mostrar`,
      destino: "/eventos",
      acao: "Abrir um evento e subir fotos",
      minutos: 4,
      essencial: true,
    },
    {
      chave: "catalogo",
      titulo: "Flores e materiais no catálogo",
      porque:
        "Cadastradas uma vez, com foto, elas se repetem em todos os eventos — e o custo vem junto, sem redigitar.",
      situacao: porContagem(d.materiais, MATERIAIS_CONFORTAVEIS),
      detalhe:
        d.materiais === 0
          ? "catálogo vazio"
          : `${d.materiais} ${d.materiais === 1 ? "cadastrado" : "cadastrados"}, ${d.materiaisComFoto} com foto`,
      destino: "/catalogo",
      acao: "Abrir o catálogo",
      minutos: 5,
      essencial: false,
    },
    {
      chave: "fornecedores",
      titulo: "Seus fornecedores",
      porque: "Quem você já contratou fica salvo e volta pronto no próximo evento.",
      situacao: porContagem(d.fornecedoresNoCatalogo, 3),
      detalhe:
        d.fornecedoresNoCatalogo === 0
          ? "nenhum cadastrado"
          : `${d.fornecedoresNoCatalogo} ${d.fornecedoresNoCatalogo === 1 ? "fornecedor" : "fornecedores"}`,
      destino: "/fornecedores",
      acao: "Cadastrar fornecedor",
      minutos: 4,
      essencial: false,
    },
    {
      chave: "comercial",
      titulo: "Uma oportunidade no funil",
      porque:
        "A cliente entra aqui, vira proposta e, quando ela aceita, vira evento sem você digitar nada de novo.",
      situacao: d.leads > 0 || d.propostas > 0 ? "feito" : "pendente",
      detalhe:
        d.leads === 0 && d.propostas === 0
          ? "funil vazio"
          : `${d.leads} no funil, ${d.propostas} ${d.propostas === 1 ? "proposta" : "propostas"}`,
      destino: "/funil",
      acao: "Abrir o funil",
      minutos: 3,
      essencial: false,
    },
    {
      chave: "financeiro",
      titulo: "O dinheiro de um evento",
      porque: "É o que responde 'ganhei quanto nesse casamento?' sem abrir planilha.",
      situacao: d.lancamentos > 0 ? "feito" : "pendente",
      detalhe:
        d.lancamentos > 0
          ? `${d.lancamentos} ${d.lancamentos === 1 ? "lançamento" : "lançamentos"}`
          : "nenhum lançamento",
      destino: "/financeiro",
      acao: "Abrir o financeiro",
      minutos: 3,
      essencial: false,
    },
  ];

  const essenciais = marcos.filter((m) => m.essencial);
  const feitos = essenciais.filter((m) => m.situacao === "feito").length;

  // Essencial primeiro, e dentro disso a ordem em que estão escritos — que é a
  // ordem em que fazem sentido para quem nunca viu o sistema.
  const pendentes = marcos.filter((m) => m.situacao !== "feito");
  const proximo = pendentes.find((m) => m.essencial) ?? pendentes[0] ?? null;

  return {
    marcos,
    feitos,
    essenciais: essenciais.length,
    percentual: essenciais.length > 0 ? Math.round((feitos / essenciais.length) * 100) : 100,
    pronto: feitos === essenciais.length,
    proximo,
    minutosRestantes: pendentes.reduce((soma, m) => soma + m.minutos, 0),
    aha:
      d.eventosApresentaveis > 0
        ? {
            alcancado: true,
            titulo: "Você já tem um projeto para mandar para a cliente",
            detalhe:
              d.eventosApresentaveis === 1
                ? "Um evento seu já abre o Projeto Visual completo e vira PDF."
                : `${d.eventosApresentaveis} eventos seus já abrem o Projeto Visual completo e viram PDF.`,
          }
        : {
            alcancado: false,
            titulo: "Falta o momento em que o ALTAR se paga",
            detalhe:
              d.eventos === 0
                ? "Crie um evento, suba as fotos e o projeto visual se monta sozinho."
                : "Abra um evento, escolha a capa e classifique as fotos — o projeto visual se monta a partir delas.",
          },
  };
}
