import { ROTULO_CURTO_DA_CONDICAO, type Condicao } from "@/convex/lib/condicaoDoAcervo.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O ITEM DO ACERVO, EM TRÊS LINHAS
//
// ── OS DOIS EIXOS NÃO SE SOMAM ──────────────────────────────────────────────
// Condição é do ITEM: pronto, para limpar, em reparo, indisponível, em
// conferência. Lugar é das RESERVAS: no galpão, fora num evento, reservado
// adiante. Um castiçal pode estar "pronto" E "fora"; outro "em reparo" E "no
// galpão". Somar os dois produz número que não existe.
//
// ── O DEFEITO QUE ISTO CORRIGE NA TELA (B7 da auditoria de 30/09) ───────────
// A lista mostrava `condicoes.pronto` como o número de destaque — e ele conta
// peça que está PRONTA mas FORA, num evento que ainda não devolveu. A
// decoradora lia "28 prontas", ia carregar o caminhão e encontrava 24.
//
// O número de destaque passa a ser `prontasNoGalpao`: prontas E no galpão, o
// que de fato pode ir para o caminhão agora. O backend já calculava
// (`lib/logisticaDoAcervo.ts`) desde a rodada do PC da Eva; nenhuma tela lia.
//
// ── POR QUE TRÊS LINHAS, E NÃO SEIS ────────────────────────────────────────
// Esta lista é usada em pé, no galpão, no telefone. Seis contagens empilhadas
// viram parede de número e ninguém lê nenhuma. Cada linha responde uma
// pergunta, e só aparece quando tem resposta:
//
//   1. o que posso carregar agora?
//   2. o que está fora do meu alcance ou precisa de cuidado?
//   3. o que já está prometido — e corro risco de não ter?
// ─────────────────────────────────────────────────────────────────────────────

/** As condições que pedem atenção. "pronto" é o destaque; não entra aqui. */
const CONDICOES_DE_ATENCAO = ["limpeza", "reparo", "indisponivel", "conferencia"] as const;

export type TomDaLinha = "destaque" | "atencao" | "neutro";

export type LinhaDoItem = { chave: string; texto: string; tom: TomDaLinha };

export type ItemNaTela = {
  unidade: string;
  quantidadeTotal: number;
  condicoes: Record<Condicao, number> & { foraDeUso: number };
  logistica: {
    noGalpao: number;
    fora: number;
    prontasNoGalpao: number;
    reservadoAFrente: number;
    eventosAFrente: number;
  };
  pico: { deficit: number; pico: number; dia: string | null };
};

/**
 * As linhas do item, na ordem em que a decoradora precisa delas.
 *
 * @param abreviar  Como escrever a unidade ("un", "pç") — vem da tela, que já
 *                  tem a função; este módulo não decide vocabulário de unidade.
 * @param formatarDia  Como escrever a data do déficit. Mesmo motivo.
 */
export function linhasDoItem(
  item: ItemNaTela,
  abreviar: (unidade: string) => string,
  formatarDia: (dia: string) => string,
): LinhaDoItem[] {
  const linhas: LinhaDoItem[] = [];
  const un = abreviar(item.unidade);

  // ── 1. O QUE POSSO CARREGAR AGORA ────────────────────────────────────
  // Sempre presente, inclusive quando é zero: "0 prontas no galpão" é
  // exatamente o que alguém precisa ler antes de prometer.
  linhas.push({
    chave: "prontas",
    texto: `${item.logistica.prontasNoGalpao} ${un} prontas no galpão`,
    tom: "destaque",
  });

  // ── 2. O QUE ESTÁ FORA OU PEDE CUIDADO ───────────────────────────────
  // Lugar e condição na mesma linha, mas cada um com o próprio rótulo e
  // nunca somados num total.
  const pedacos: string[] = [];
  if (item.logistica.fora > 0) pedacos.push(`${item.logistica.fora} fora`);
  for (const c of CONDICOES_DE_ATENCAO) {
    if (item.condicoes[c] > 0) pedacos.push(`${item.condicoes[c]} ${ROTULO_CURTO_DA_CONDICAO[c]}`);
  }
  if (pedacos.length > 0) {
    linhas.push({ chave: "atencao", texto: pedacos.join(" · "), tom: "atencao" });
  }

  // ── 3. O QUE JÁ ESTÁ PROMETIDO ───────────────────────────────────────
  // O déficit VENCE a contagem de reservas: saber que falta peça num dia é
  // mais urgente do que saber quantos eventos a querem. As duas juntas
  // seriam a terceira e a quarta linha, e a quarta ninguém lê.
  if (item.pico.deficit > 0 && item.pico.dia) {
    linhas.push({
      chave: "deficit",
      texto:
        `Faltam ${item.pico.deficit} ${un} em ${formatarDia(item.pico.dia)} — ` +
        `${item.pico.pico} prometidas, ${item.quantidadeTotal} no acervo` +
        (item.condicoes.foraDeUso > 0 ? `, ${item.condicoes.foraDeUso} fora de uso` : ""),
      tom: "atencao",
    });
  } else if (item.logistica.reservadoAFrente > 0) {
    const n = item.logistica.eventosAFrente;
    linhas.push({
      chave: "reservado",
      texto:
        `${item.logistica.reservadoAFrente} ${un} reservadas em ${n} ` +
        (n === 1 ? "evento" : "eventos"),
      tom: "neutro",
    });
  }

  return linhas;
}
