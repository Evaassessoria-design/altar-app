// ─────────────────────────────────────────────────────────────────────────────
// A DATA DE HOJE, EM "AAAA-MM-DD"
//
// ── O DEFEITO QUE ESTE MÓDULO EXISTE PARA IMPEDIR ───────────────────────────
// `events.date` e `transactions.date` são strings de DIA: "2026-09-02". Três
// consultas comparavam esses campos com `new Date().toISOString()`, que é uma
// string de INSTANTE: "2026-09-02T14:33:00.000Z".
//
// A comparação é textual. "2026-09-02" é PREFIXO de "2026-09-02T14:33:…" e,
// sendo mais curta, ordena ANTES. Ou seja:
//
//     "2026-09-02" >= "2026-09-02T14:33:00.000Z"   →   false
//
// O evento que acontece HOJE não era "próximo": sumia do Dashboard, da
// contagem de eventos e da lista "Em andamento" — exatamente no dia em que
// mais precisava aparecer. Pelo mesmo motivo, um lançamento datado no dia 1º
// ficava de fora de "este mês" no Dashboard, enquanto o Financeiro (que já
// cortava a string em 10 caracteres) o incluía. Duas telas, dois números.
//
// ── POR QUE UTC EXPLÍCITO ───────────────────────────────────────────────────
// O código anterior usava `getFullYear/getMonth/getDate`, que dependem do
// fuso do servidor. No Convex isso é UTC, então o resultado é o mesmo — mas
// implícito. Aqui é declarado, para a resposta não mudar se o ambiente mudar.
//
// NOTA CONHECIDA, deliberadamente NÃO alterada aqui: com UTC, "hoje" vira
// "amanhã" às 21h no horário de Brasília. Corrigir isso exige saber o fuso da
// empresa — decisão de produto, não de refactor.
// ─────────────────────────────────────────────────────────────────────────────

/** "AAAA-MM-DD" de um instante. Sempre 10 caracteres, sempre comparável. */
export function dataDoDia(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" de `dias` dias à frente (ou atrás, com número negativo). */
export function dataEmDias(dias: number, agora: Date = new Date()): string {
  return dataDoDia(new Date(agora.getTime() + dias * 86_400_000));
}

/** "AAAA-MM-01" do mês do instante dado. */
export function primeiroDiaDoMes(agora: Date = new Date()): string {
  return `${dataDoDia(agora).slice(0, 7)}-01`;
}

/** Último dia do mês do instante dado, em "AAAA-MM-DD". */
export function ultimoDiaDoMes(agora: Date = new Date()): string {
  const proximo = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1),
  );
  return dataDoDia(new Date(proximo.getTime() - 86_400_000));
}

/** O mês do instante, deslocado em `meses`. Devolve o par do mês inteiro. */
export function faixaDoMes(
  meses: number,
  agora: Date = new Date(),
): { inicio: string; fim: string; rotulo: string } {
  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + meses, 1));
  return {
    inicio: dataDoDia(alvo),
    fim: ultimoDiaDoMes(alvo),
    rotulo: alvo.toLocaleString("pt-BR", { month: "short", timeZone: "UTC" }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// "HOJE" NO FUSO DO NEGÓCIO
//
// A NOTA acima esperava uma decisão de produto, e ela veio (06/10/2026): para
// dinheiro — vencimento, atraso, data de recebimento — "hoje" é o dia no fuso
// da EMPRESA, não do servidor (UTC) nem do aparelho de quem abre a tela.
//
// O fuso é o que a decoradora escolheu em Configurações (`users.timezone`);
// ausente ou inválido = America/Sao_Paulo, o mesmo padrão daquela tela.
//
// `dataDoDia` (UTC) continua existindo para quem já a usa — agenda e eventos
// do Dashboard. Trocar tudo de uma vez seria mexer em telas que não fazem
// parte desta decisão.
// ─────────────────────────────────────────────────────────────────────────────

/** O fuso de negócio quando a conta não escolheu nenhum. */
export const FUSO_PADRAO_DO_NEGOCIO = "America/Sao_Paulo";

/** O fuso da conta, validado. Fuso que o runtime não conhece cai no padrão. */
export function fusoDoNegocio(escolhido: string | undefined | null): string {
  if (!escolhido) return FUSO_PADRAO_DO_NEGOCIO;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: escolhido });
    return escolhido;
  } catch {
    return FUSO_PADRAO_DO_NEGOCIO;
  }
}

/**
 * "AAAA-MM-DD" do instante no fuso dado.
 *
 * Se o runtime não tiver os dados de fuso, cai em UTC−3 fixo — que é
 * Brasília desde o fim do horário de verão (2019). Nunca cai em UTC, que é
 * exatamente o erro que esta função existe para não cometer.
 */
export function dataDoDiaNoFuso(agora: Date = new Date(), fuso: string = FUSO_PADRAO_DO_NEGOCIO): string {
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: fusoDoNegocio(fuso),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(agora);
    const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
    const dia = `${p("year")}-${p("month")}-${p("day")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) return dia;
  } catch {
    // segue para o fixo
  }
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}
