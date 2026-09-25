import { estagioDe, type EstagioDoInteressado, type InteressadoNoFunil } from "../campanha";
import { proximaAcao, type FatosDoInteressado, type ProximaAcao } from "../proximaAcao";
import type { Capacidade } from "./autonomia";
import type { Suspeita } from "../duplicidade";

// ─────────────────────────────────────────────────────────────────────────────
// O CICLO DO ESCRITÓRIO — O QUE FAZER, DECIDIDO ANTES DE FAZER
//
// ── POR QUE PLANO E EXECUÇÃO SÃO SEPARADOS ──────────────────────────────────
// Este módulo não escreve no banco, não chama modelo e não conhece `ctx`. Ele
// recebe o retrato da campanha e devolve uma LISTA DE INTENÇÕES.
//
// A separação paga três coisas:
//
//   · o plano é testável sem banco, com cem cenários em milissegundos;
//   · o plano é auditável — dá para mostrar ao dono o que SERIA feito antes de
//     fazer, que é a diferença entre um sistema autônomo e um sistema opaco;
//   · a execução vira um laço burro, e laço burro não tem onde esconder
//     decisão.
//
// ── A IDEMPOTÊNCIA NASCE AQUI ───────────────────────────────────────────────
// Cada intenção carrega uma CHAVE determinística: mesma campanha, mesma
// pessoa, mesmo tipo de trabalho produzem a mesma chave. Rodar duas vezes gera
// o mesmo plano, e o executor pula o que já existe.
//
// Sem isso, "Rodar Escritório" clicado duas vezes deixaria quarenta rascunhos
// duplicados — e alguém mandaria os quarenta.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoDeIntencao =
  /** Escrever uma mensagem e deixar na fila de revisão. */
  | "preparar_mensagem"
  /** Apontar um par que parece a mesma pessoa. Nunca funde. */
  | "revisar_duplicidade"
  /** Subir para a fila "Precisa de você". */
  | "pedir_decisao";

export type Intencao = {
  /** Determinística. É ela que impede duplicação ao rodar de novo. */
  chave: string;
  tipo: TipoDeIntencao;
  /** A capacidade que autoriza esta intenção. Sem ela ligada, não entra. */
  capacidade: Capacidade;
  /** Quem. Nome legível, para o relatório não falar em ids. */
  pessoa: string;
  leadId?: string;
  /** O modelo de mensagem, quando é `preparar_mensagem`. */
  mensagem?: string;
  /** Por que esta intenção existe. Sempre sobre dado gravado. */
  motivo: string;
  urgencia: ProximaAcao["urgencia"];
};

export type PessoaNoCiclo = InteressadoNoFunil & {
  _id: string;
  nome: string;
  fatos: FatosDoInteressado;
};

export type EntradaDoCiclo = {
  campanha: string;
  pessoas: readonly PessoaNoCiclo[];
  duplicidades: readonly Suspeita[];
  /** As capacidades ATIVAS agora. Ver `lib/escritorio/autonomia.ts`. */
  podeFazer: ReadonlySet<Capacidade>;
  /**
   * As chaves que já existem no banco — rascunhos vivos, decisões já na fila.
   *
   * Quem calcula é o executor, que é quem sabe ler o banco. O plano só precisa
   * saber o que PULAR, e recebê-lo pronto mantém este módulo puro.
   */
  jaFeito: ReadonlySet<string>;
};

/**
 * A chave de uma intenção.
 *
 * Campanha + pessoa + tipo + detalhe. Não entra data nem hora: o ponto é que
 * rodar às 8h e às 14h produza a MESMA chave, e a segunda rodada reconheça o
 * trabalho da primeira.
 */
export function chaveDaIntencao(
  campanha: string,
  tipo: TipoDeIntencao,
  alvo: string,
  detalhe = "",
): string {
  return [campanha, tipo, alvo, detalhe].filter(Boolean).join("|");
}

/** Quem já saiu da campanha de aquisição não recebe trabalho novo. */
const FORA_DO_CICLO: ReadonlySet<EstagioDoInteressado> = new Set([
  "convertido",
  "descartado",
]);

export type PlanoDoCiclo = {
  intencoes: Intencao[];
  /** Contagens do que foi OLHADO — o relatório não inventa números. */
  analisadas: number;
  /** Pulou porque a capacidade está desligada. A tela pode explicar. */
  bloqueadasPorAutonomia: number;
  /** Pulou porque já existia. É a idempotência, visível. */
  jaExistiam: number;
};

/**
 * O que o Escritório faria agora.
 *
 * Percorre as pessoas uma vez, pergunta à regra de negócio o que cada uma
 * precisa, e filtra por autonomia e por trabalho já feito. Nenhuma leitura de
 * banco, nenhuma chamada de modelo.
 */
export function planejarCiclo(e: EntradaDoCiclo): PlanoDoCiclo {
  const intencoes: Intencao[] = [];
  let bloqueadasPorAutonomia = 0;
  let jaExistiam = 0;

  const registrar = (i: Intencao) => {
    if (!e.podeFazer.has(i.capacidade)) {
      bloqueadasPorAutonomia++;
      return;
    }
    if (e.jaFeito.has(i.chave)) {
      jaExistiam++;
      return;
    }
    intencoes.push(i);
  };

  for (const p of e.pessoas) {
    // Cliente e descartado saem antes de qualquer regra: continuar abordando
    // quem assinou faz o cliente novo receber convite para conhecer o produto
    // que acabou de comprar.
    if (FORA_DO_CICLO.has(estagioDe(p))) continue;

    const acao = proximaAcao(p.fatos);

    // ── PRECISA DE GENTE ─────────────────────────────────────────────
    if (acao.precisaDeHumano) {
      registrar({
        chave: chaveDaIntencao(e.campanha, "pedir_decisao", p._id, acao.acao),
        tipo: "pedir_decisao",
        // A fila humana faz parte do relatório do dia, e é a capacidade que a
        // autoriza — não "preparar mensagem", que é outra coisa.
        capacidade: "relatorio_diario",
        pessoa: p.nome,
        leadId: p._id,
        motivo: acao.motivo,
        urgencia: acao.urgencia,
      });
      continue;
    }

    // ── ESCREVER ALGUMA COISA ────────────────────────────────────────
    if (!acao.mensagem) continue;

    // A capacidade depende do QUE vai ser escrito. Quem desligou "escrever
    // follow-up" não desligou "escrever o primeiro contato".
    const capacidade: Capacidade =
      acao.mensagem === "convite"
        ? "preparar_primeiro_contato"
        : acao.mensagem === "lembrete_24h" || acao.mensagem === "lembrete_30min"
          ? "organizar_agenda"
          : "preparar_follow_up";

    registrar({
      chave: chaveDaIntencao(e.campanha, "preparar_mensagem", p._id, acao.mensagem),
      tipo: "preparar_mensagem",
      capacidade,
      pessoa: p.nome,
      leadId: p._id,
      mensagem: acao.mensagem,
      motivo: acao.motivo,
      urgencia: acao.urgencia,
    });
  }

  // ── DUPLICIDADES ───────────────────────────────────────────────────
  for (const d of e.duplicidades) {
    registrar({
      chave: chaveDaIntencao(e.campanha, "revisar_duplicidade", d.ids.join("+")),
      tipo: "revisar_duplicidade",
      capacidade: "deduplicar",
      pessoa: `${d.nomes[0]} e ${d.nomes[1]}`,
      motivo: `${d.motivo}. Podem ser a mesma pessoa.`,
      // Apontar é sempre "quando der": ninguém perde negócio por não olhar
      // uma duplicidade hoje, e tratá-la como urgente empurraria trabalho de
      // verdade para baixo.
      urgencia: d.forca === "alta" ? "esta_semana" : "quando_der",
    });
  }

  return {
    intencoes,
    analisadas: e.pessoas.length,
    bloqueadasPorAutonomia,
    jaExistiam,
  };
}

// ── O RELATÓRIO ─────────────────────────────────────────────────────────────

export type ResumoDoCiclo = {
  analisadas: number;
  mensagensPreparadas: number;
  duplicidadesApontadas: number;
  decisoesParaVoce: number;
  jaExistiam: number;
  bloqueadasPorAutonomia: number;
  /** Nada a fazer. É resposta legítima, e a mais comum depois da primeira rodada. */
  semTrabalhoNovo: boolean;
};

export function resumirCiclo(p: PlanoDoCiclo): ResumoDoCiclo {
  const conta = (t: TipoDeIntencao) => p.intencoes.filter((i) => i.tipo === t).length;
  const mensagensPreparadas = conta("preparar_mensagem");
  const duplicidadesApontadas = conta("revisar_duplicidade");
  const decisoesParaVoce = conta("pedir_decisao");

  return {
    analisadas: p.analisadas,
    mensagensPreparadas,
    duplicidadesApontadas,
    decisoesParaVoce,
    jaExistiam: p.jaExistiam,
    bloqueadasPorAutonomia: p.bloqueadasPorAutonomia,
    semTrabalhoNovo:
      mensagensPreparadas + duplicidadesApontadas + decisoesParaVoce === 0,
  };
}

/**
 * A frase de abertura do relatório.
 *
 * ── POR QUE "NADA NOVO" É UMA BOA NOTÍCIA ───────────────────────────────────
 * Depois da primeira rodada do dia, o normal é não haver trabalho novo. Um
 * relatório que tratasse isso como falha ("0 mensagens preparadas") ensinaria
 * o dono a duvidar do sistema justamente quando ele está em dia.
 */
export function fraseDoCiclo(r: ResumoDoCiclo): string {
  if (r.analisadas === 0) return "Não há ninguém nesta campanha ainda.";
  if (r.semTrabalhoNovo) {
    return r.jaExistiam > 0
      ? `Olhei ${r.analisadas} ${r.analisadas === 1 ? "pessoa" : "pessoas"}. O trabalho já estava pronto.`
      : `Olhei ${r.analisadas} ${r.analisadas === 1 ? "pessoa" : "pessoas"}. Nada pedindo ação agora.`;
  }
  const partes: string[] = [];
  if (r.mensagensPreparadas > 0) {
    partes.push(
      `${r.mensagensPreparadas} ${r.mensagensPreparadas === 1 ? "mensagem escrita" : "mensagens escritas"}`,
    );
  }
  if (r.duplicidadesApontadas > 0) {
    partes.push(
      `${r.duplicidadesApontadas} ${r.duplicidadesApontadas === 1 ? "possível repetida" : "possíveis repetidas"}`,
    );
  }
  if (r.decisoesParaVoce > 0) {
    partes.push(
      `${r.decisoesParaVoce} ${r.decisoesParaVoce === 1 ? "decisão sua" : "decisões suas"}`,
    );
  }
  return `Olhei ${r.analisadas} ${r.analisadas === 1 ? "pessoa" : "pessoas"}: ${partes.join(", ")}.`;
}
