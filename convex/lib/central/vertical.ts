// ─────────────────────────────────────────────────────────────────────────────
// VERTICAL — QUAL PRODUTO ALTAR É ESTE DEPLOYMENT
//
// ALTAR Decor e ALTAR Buffet vivem em projetos Convex SEPARADOS. O Escritório
// 3D é o hub executivo que, no futuro, agrega os dois.
//
// `admin.getOfficeSnapshot` já devolve `vertical: "altar_decor"` fixo no
// código. Este módulo generaliza aquilo: a vertical passa a vir de env, e é
// gravada em TODA entidade da Central e como PRIMEIRO componente de todo
// índice de listagem.
//
// Por que carimbar se hoje o valor é constante: o dia em que a Central virar
// hub único, `vertical` já é chave de partição real em cada índice. Sem o
// campo, seria preciso reescrever todos os índices e fazer backfill.
// ─────────────────────────────────────────────────────────────────────────────

export const VERTICAIS = ["altar_decor", "altar_buffet"] as const;

export type Vertical = (typeof VERTICAIS)[number];

/** Este deployment. Sem env, é Decor — o produto que existe hoje. */
export const VERTICAL_PADRAO: Vertical = "altar_decor";

export function ehVertical(valor: unknown): valor is Vertical {
  return typeof valor === "string" && (VERTICAIS as readonly string[]).includes(valor);
}

/**
 * Vertical deste deployment, a partir de `ALTAR_VERTICAL`.
 *
 * Valor ausente, vazio ou desconhecido cai no padrão em vez de lançar: uma
 * env mal digitada não pode derrubar o recebimento de mensagem. Quem quiser
 * saber se houve queda usa `verticalConfiguradaEhValida`.
 */
export function resolverVertical(bruto?: string | null): Vertical {
  const limpo = bruto?.trim();
  return ehVertical(limpo) ? limpo : VERTICAL_PADRAO;
}

export function verticalConfiguradaEhValida(bruto?: string | null): boolean {
  const limpo = bruto?.trim();
  return !limpo || ehVertical(limpo);
}

/** Vertical do processo atual. */
export function verticalDoAmbiente(): Vertical {
  return resolverVertical(process.env.ALTAR_VERTICAL);
}
