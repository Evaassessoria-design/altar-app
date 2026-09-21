// ─────────────────────────────────────────────────────────────────────────────
// QUANTO FALTA (OU QUANTO FAZ) PARA O EVENTO
//
// A etiqueta do painel "Precisam da sua atenção". Regra pura, fora do
// componente, para poder ser testada sem renderizar nada.
//
// ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────────────
// A conta era `em ${dias} dias`, com dois casos especiais (hoje e amanhã). O
// painel, porém, também mostra evento que JÁ ACONTECEU: é dele que nasce a
// pergunta "a peça voltou?" — durante a janela a peça está no evento, e só
// depois vira pendência (`JANELA_RETORNO_DIAS`, em convex/lib/attention.ts).
//
// Com `diasAte` negativo a etiqueta escrevia **"em -3 dias"**. E aparecia
// justamente no alerta mais valioso do produto: o casamento de sábado cujas
// peças ninguém conferiu na segunda.
//
// ── E A COR TAMBÉM MENTIA ───────────────────────────────────────────────────
// `nivel` é "urgente" só para evento nos próximos 7 dias ou compra atrasada,
// então o evento que já passou saía em âmbar de "atenção" — mesmo tom de um
// casamento que ainda vai acontecer. Passado não é atenção: é cobrança.
// ─────────────────────────────────────────────────────────────────────────────

/** Como a etiqueta deve ser lida. */
export type TomDoPrazo = "passado" | "hoje" | "proximo" | "distante";

export type PrazoDoEvento = {
  /** O texto da etiqueta, na voz de quem opera. */
  texto: string;
  tom: TomDoPrazo;
};

const plural = (n: number, um: string, muitos: string) =>
  n === 1 ? `1 ${um}` : `${n} ${muitos}`;

/**
 * A etiqueta de prazo de um evento do painel.
 *
 * `dias` é o resultado de `diasEntre(hoje, dataDoEvento)`: positivo no futuro,
 * zero hoje, **negativo no passado**.
 *
 * Nunca escreve número negativo. Data corrompida (`NaN`) vira "sem data" em
 * vez de "em NaN dias" — a tela não afirma o que não sabe.
 */
export function prazoDoEvento(dias: number): PrazoDoEvento {
  if (!Number.isFinite(dias)) return { texto: "sem data", tom: "distante" };
  const inteiro = Math.trunc(dias);

  if (inteiro === 0) return { texto: "é hoje", tom: "hoje" };
  if (inteiro === 1) return { texto: "amanhã", tom: "proximo" };
  if (inteiro === -1) return { texto: "foi ontem", tom: "passado" };
  if (inteiro < 0) {
    return { texto: `há ${plural(-inteiro, "dia", "dias")}`, tom: "passado" };
  }
  return { texto: `em ${plural(inteiro, "dia", "dias")}`, tom: inteiro <= 7 ? "proximo" : "distante" };
}
