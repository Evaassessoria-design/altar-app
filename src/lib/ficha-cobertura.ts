import { quantidadeLimpa, type SituacaoDaCobertura } from "@/convex/lib/fichaTecnica.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A LINHA DA FICHA TÉCNICA MOSTRA — e o que ela se recusa a mostrar.
//
// Isto é APRESENTAÇÃO. Nenhuma conta acontece aqui: todos os números já vêm
// calculados de `convex/lib/fichaTecnica.ts`. Este módulo só decide QUAIS
// deles aparecem, e existe fora do componente para ser testável sem renderizar.
//
// ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────────────
// A tela mostrava `cobertura.comprado` sob o rótulo "Providenciado". Mas o
// backend calcula `providenciado = comprado + doAcervo`. Resultado: 14 vasos
// reservados do acervo e 0 comprados apareciam como "Providenciado: 0" — o
// acervo, que é o diferencial do produto, era invisível justamente na tela
// que existe para mostrá-lo. Pior: só aparecia quando havia compra
// (`temCompra`), então a cobertura vinda SÓ do acervo não aparecia nunca.
//
// ── A REGRA QUE NÃO SE NEGOCIA: QUANDO NÃO MOSTRAR "FALTAM" ─────────────────
// `coberturaDaLinha` devolve `faltam = alvo - comprado` quando não há item de
// acervo vinculado. Para um material reutilizável sem compra, isso é o ALVO
// INTEIRO: 20 de 20.
//
// Exibir esse número diria "faltam 20 vasos" para quem talvez tenha 40 no
// galpão — e mandaria comprar de novo o que ela já tem. É exatamente a mentira
// que `acervo_nao_informado` foi criado para impedir (ver o comentário de
// `SituacaoDaCobertura`). Por isso "faltam" só aparece nas duas situações em
// que ele é VERDADE:
//
//   parcial          existe providência e ela não alcança o alvo
//   sem_providencia  consumível/compra específica sem compra nenhuma
//
// Em `acervo_nao_informado` e `sem_vinculo` o rótulo da situação já diz a
// coisa certa, e o número seria pior que o silêncio.
// ─────────────────────────────────────────────────────────────────────────────

/** Só o que a apresentação lê. Espelha `CoberturaDaLinha` sem depender dela. */
export type CoberturaLida = {
  necessario: number;
  alvo: number;
  providenciado: number;
  /** Reservado do acervo. `null` = disponibilidade não informada. */
  doAcervo: number | null;
  faltam: number;
  situacao: SituacaoDaCobertura;
};

export type ResumoVisivel = {
  necessario: number;
  /** O alvo com margem. Só vale mostrar quando difere do necessário. */
  sugerido: number;
  mostrarSugerido: boolean;
  /** comprado + acervo, como o backend calcula. */
  providenciado: number;
  mostrarProvidenciado: boolean;
  /** Quanto do providenciado veio do galpão. `null` = não informado. */
  doAcervo: number | null;
  /** O acervo cobre parte da necessidade — vale dizer de onde veio. */
  mostrarOrigemAcervo: boolean;
  faltam: number;
  mostrarFaltam: boolean;
  /** O sistema não sabe se a peça existe no galpão. Não é falta. */
  acervoDesconhecido: boolean;
};

/** Situações em que afirmar "faltam N" é verdade. */
const FALTA_E_VERDADE: readonly SituacaoDaCobertura[] = ["parcial", "sem_providencia"];

/**
 * O que exibir numa linha do consolidado.
 *
 * @param cobertura vinda do backend, já calculada.
 * @param sugerido  `sugeridoOperacional` da linha — o número arredondado para a
 *                  unidade, que é o que a decoradora de fato providencia.
 */
export function resumoVisivel(cobertura: CoberturaLida, sugerido: number): ResumoVisivel {
  const acervoDesconhecido = cobertura.situacao === "acervo_nao_informado";
  const doAcervo = cobertura.doAcervo;

  // ── DOIS NÚMEROS PARA A MESMA COISA ────────────────────────────────────────
  // `cobertura.faltam` é medido contra `alvo`, que é o sugerido CRU. A tela,
  // porém, anuncia o sugerido OPERACIONAL — o arredondado pela unidade, que é
  // o que ela de fato vai providenciar.
  //
  // Com 48 hastes de necessidade e 10% de margem, a linha dizia:
  //     "Providenciar 53 haste · Falta 52,8 haste"
  // Dois números para a mesma coisa, e um deles uma quantidade que não existe:
  // não se compra 0,8 de haste. É a regra que este módulo já aplica em
  // `sugeridoOperacional` — a falta só não a obedecia.
  //
  // A falta passa a ser medida contra o MESMO alvo que a tela anuncia. Nunca
  // cria falta onde o backend não viu: o sugerido operacional é sempre maior
  // ou igual ao cru, e `mostrarFaltam` continua obedecendo à situação.
  const faltam = quantidadeLimpa(Math.max(0, sugerido - cobertura.providenciado));

  return {
    necessario: cobertura.necessario,
    sugerido,
    // Repetir o mesmo número sob dois rótulos não informa nada e ocupa a linha
    // inteira num celular. Sem margem configurada, sugerido == necessário.
    mostrarSugerido: sugerido > cobertura.necessario,
    providenciado: cobertura.providenciado,
    // Aparece por VALOR, não por existência de compra: cobertura vinda só do
    // acervo é providência igual.
    mostrarProvidenciado: cobertura.providenciado > 0,
    doAcervo,
    mostrarOrigemAcervo: typeof doAcervo === "number" && doAcervo > 0,
    faltam,
    mostrarFaltam: cobertura.faltam > 0 && FALTA_E_VERDADE.includes(cobertura.situacao),
    acervoDesconhecido,
  };
}
