// ─────────────────────────────────────────────────────────────────────────────
// REUNIÕES DO EVENTO — AS REGRAS, SEM BANCO
//
// Vale para o servidor (convex/reunioes.ts, convex/reunioesIa.ts) e para a
// tela, que importa daqui o mesmo vocabulário e a mesma validação. Uma regra
// só, testada sem banco (reunioes.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoDaReuniao = "agendada" | "realizada" | "cancelada";

export const ROTULO_DA_SITUACAO: Record<SituacaoDaReuniao, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

/** Tetos. Um registro de reunião não é um livro; o teto barra o dado patológico. */
export const LIMITES = {
  titulo: 200,
  participantes: 1000,
  link: 2000,
  /** pauta, anotações e resumo */
  texto: 30000,
  itemDeLista: 1000,
  itens: 60,
} as const;

/** "AAAA-MM-DD" de calendário real (30/02 não passa). */
export function ehData(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "HH:MM" de 00:00 a 23:59. */
export function ehHorario(valor: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

/**
 * O link da sala, ou o motivo de recusá-lo.
 *
 * Só http(s). O link vira `<a href>` na tela da decoradora — `javascript:`
 * colado de algum lugar seria código rodando na sessão dela. Sem esquema
 * ("meet.google.com/abc") é o jeito como as pessoas copiam: ganha https.
 */
export function normalizarLink(bruto: string): { ok: true; link: string } | { ok: false; motivo: string } {
  const texto = bruto.trim();
  if (!texto) return { ok: false, motivo: "Link vazio." };
  if (texto.length > LIMITES.link) return { ok: false, motivo: "Link longo demais." };
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return { ok: false, motivo: "Não parece um link. Cole o endereço da sala (Meet, Zoom…)." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, motivo: "Use um link que comece com https://." };
  }
  if (!url.hostname.includes(".")) {
    return { ok: false, motivo: "Não parece um link. Cole o endereço da sala (Meet, Zoom…)." };
  }
  return { ok: true, link: url.toString() };
}

/** Onde a sala está, para a tela dizer "Google Meet" em vez de um endereço. */
export function servicoDoLink(link: string): string {
  let host = "";
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return "Link externo";
  }
  if (host === "meet.google.com") return "Google Meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Microsoft Teams";
  if (host.endsWith("whereby.com")) return "Whereby";
  return "Link externo";
}

/** Texto aparado, ou `undefined` quando vazio — vazio não é valor gravado. */
export function textoOuNada(valor: string | null | undefined, teto: number): string | undefined {
  const t = (valor ?? "").trim();
  return t ? t.slice(0, teto) : undefined;
}

/** Lista limpa: sem vazios, sem repetição exata, com teto. */
export function listaLimpa(itens: readonly string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of itens) {
    const t = bruto.trim().slice(0, LIMITES.itemDeLista);
    const chave = t.toLocaleLowerCase("pt-BR");
    if (!t || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
    if (saida.length >= LIMITES.itens) break;
  }
  return saida;
}

type ReuniaoOrdenavel = { data: string; horario?: string; criadaEm: string };

/**
 * Próximas primeiro (da mais perto para a mais longe), depois as passadas
 * (da mais recente para a mais antiga). É a pergunta de quem abre a tela:
 * "qual é a próxima?" e, logo abaixo, "o que ficou decidido na última?".
 */
export function ordenarReunioes<T extends ReuniaoOrdenavel>(lista: readonly T[], hoje: string): T[] {
  const chave = (r: T) => `${r.data} ${r.horario ?? "99:99"} ${r.criadaEm}`;
  const futuras = lista.filter((r) => r.data >= hoje).sort((a, b) => chave(a).localeCompare(chave(b)));
  const passadas = lista.filter((r) => r.data < hoje).sort((a, b) => chave(b).localeCompare(chave(a)));
  return [...futuras, ...passadas];
}

/**
 * "Agendada" com data que já passou: a tela pergunta se aconteceu, em vez de
 * continuar dizendo "agendada" para sempre. Derivado, não gravado.
 */
export function precisaDeDesfecho(r: { situacao: SituacaoDaReuniao; data: string }, hoje: string): boolean {
  return r.situacao === "agendada" && r.data < hoje;
}

// ═════════════════════════════════════════════════ SUGESTÃO DA IA

/**
 * O que a IA devolve: cada item vem com o TRECHO das anotações que o sustenta.
 */
export type SugestaoBruta = {
  resumo?: unknown;
  decisoes?: unknown;
  pendencias?: unknown;
};

export type SugestaoDaReuniao = {
  resumo: string;
  decisoes: { texto: string; trecho: string }[];
  pendencias: { texto: string; responsavel?: string; trecho: string }[];
  /** Quantos itens a IA propôs sem trecho que exista nas notas — descartados. */
  descartados: number;
};

/** Comparação tolerante a caixa, acento e espaço — não a palavras novas. */
function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/["“”'‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filtra a sugestão da IA pelo que está ESCRITO nas anotações.
 *
 * ── POR QUE O TRECHO ────────────────────────────────────────────────────────
 * "Não inventar decisões" não se garante pedindo com educação ao modelo. Cada
 * decisão e pendência precisa citar o trecho das notas de onde saiu, e o
 * trecho precisa EXISTIR nas notas. A que não cita, ou cita algo que ninguém
 * escreveu, é descartada aqui — e a tela conta quantas foram, para a pessoa
 * saber que houve corte.
 *
 * O resumo não tem trecho (é paráfrase por natureza); por isso ele chega como
 * texto editável, e só é gravado se a pessoa aceitar.
 */
export function filtrarSugestao(bruta: SugestaoBruta, anotacoes: string): SugestaoDaReuniao {
  const notas = normalizar(anotacoes);
  let descartados = 0;

  const sustentado = (trecho: unknown): trecho is string =>
    typeof trecho === "string" && normalizar(trecho).length >= 3 && notas.includes(normalizar(trecho));

  const lerLista = (valor: unknown) => (Array.isArray(valor) ? valor : []);

  const decisoes: SugestaoDaReuniao["decisoes"] = [];
  for (const d of lerLista(bruta.decisoes)) {
    const item = (d ?? {}) as { texto?: unknown; trecho?: unknown };
    const texto = typeof item.texto === "string" ? item.texto.trim().slice(0, LIMITES.itemDeLista) : "";
    if (!texto || !sustentado(item.trecho)) {
      descartados += 1;
      continue;
    }
    decisoes.push({ texto, trecho: item.trecho.trim() });
    if (decisoes.length >= LIMITES.itens) break;
  }

  const pendencias: SugestaoDaReuniao["pendencias"] = [];
  for (const p of lerLista(bruta.pendencias)) {
    const item = (p ?? {}) as { texto?: unknown; responsavel?: unknown; trecho?: unknown };
    const texto = typeof item.texto === "string" ? item.texto.trim().slice(0, LIMITES.itemDeLista) : "";
    if (!texto || !sustentado(item.trecho)) {
      descartados += 1;
      continue;
    }
    // Responsável só se o NOME aparece nas notas: a IA não atribui trabalho a
    // quem ninguém citou.
    const responsavel =
      typeof item.responsavel === "string" &&
      item.responsavel.trim() &&
      notas.includes(normalizar(item.responsavel))
        ? item.responsavel.trim().slice(0, 200)
        : undefined;
    pendencias.push({ texto, responsavel, trecho: item.trecho.trim() });
    if (pendencias.length >= LIMITES.itens) break;
  }

  const resumo = typeof bruta.resumo === "string" ? bruta.resumo.trim().slice(0, LIMITES.texto) : "";
  return { resumo, decisoes, pendencias, descartados };
}

/** Lê o JSON do modelo, tolerando cerca de código. Nunca lança. */
export function lerJsonDoModelo(bruto: string): SugestaoBruta {
  const semCerca = bruto.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    const v: unknown = JSON.parse(semCerca);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as SugestaoBruta) : {};
  } catch {
    return {};
  }
}
