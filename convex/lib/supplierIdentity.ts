// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDADE DE FORNECEDOR — normalização e critério de deduplicação.
//
// Módulo PURO, sem banco: é aqui que mora a única pergunta difícil do catálogo
// central — "estes dois cadastros são o mesmo fornecedor?".
//
// A decisão de produto foi explícita: em caso de dúvida, PREFERIR DUPLICIDADE
// TEMPORÁRIA a fundir fornecedores diferentes. Fundir é irreversível; duplicar
// é um incômodo que a decoradora resolve depois, quando quiser.
//
// Por isso a regra é deliberadamente estreita: só consideramos o mesmo
// fornecedor quando nome normalizado E telefone normalizado batem, e ambos
// existem. Nome parecido não basta. Nome igual sem telefone não basta —
// "Buffet Silva" pode ser duas empresas diferentes em cidades diferentes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nome em forma comparável: minúsculo, sem acento, sem pontuação, espaços
 * colapsados. "Flores & Cia." e "flores e cia" NÃO viram iguais — só tiramos
 * ruído tipográfico, não interpretamos sinônimos.
 */
export function normalizeName(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .toLowerCase()
    .replace(/[^\w\s&]/g, " ") // pontuação vira espaço; & é significativo
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Telefone só com dígitos, sem o código do país.
 *
 * No Brasil o mesmo número aparece como "(14) 99624-7868", "14996247868" e
 * "+55 14 99624-7868". Os três precisam colidir. Removemos o 55 inicial apenas
 * quando o resultado tem tamanho de telefone nacional (10 ou 11 dígitos) —
 * assim um número que legitimamente comece com 55 não é mutilado.
 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digitos = raw.replace(/\D/g, "");
  if (digitos.length === 12 || digitos.length === 13) {
    const semPais = digitos.startsWith("55") ? digitos.slice(2) : digitos;
    if (semPais.length === 10 || semPais.length === 11) return semPais;
  }
  return digitos;
}

/**
 * Chave de deduplicação, ou `null` quando não há evidência suficiente.
 *
 * `null` significa "trate como registro próprio" — é o caminho seguro e o mais
 * comum em cadastros incompletos.
 */
export function dedupKey(
  companyName: string | undefined | null,
  phone: string | undefined | null,
): string | null {
  const nome = normalizeName(companyName);
  const telefone = normalizePhone(phone);
  // Telefone curto demais não identifica ninguém (ramal, número truncado).
  if (!nome || telefone.length < 10) return null;
  return `${nome}|${telefone}`;
}

/**
 * Os dois cadastros são seguramente o mesmo fornecedor?
 * Só `true` quando ambos produzem a MESMA chave — nunca por semelhança.
 */
export function isSameSupplier(
  a: { companyName?: string | null; phone?: string | null },
  b: { companyName?: string | null; phone?: string | null },
): boolean {
  const chaveA = dedupKey(a.companyName, a.phone);
  const chaveB = dedupKey(b.companyName, b.phone);
  if (chaveA === null || chaveB === null) return false;
  return chaveA === chaveB;
}
