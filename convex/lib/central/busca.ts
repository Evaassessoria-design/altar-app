// ─────────────────────────────────────────────────────────────────────────────
// BUSCA DA CENTRAL — o texto que o índice enxerga
//
// A caixa de entrada precisa responder a três perguntas com UM campo só:
// "Helena", "5511999998888" e "quero conhecer o ALTAR". Elas moram em tabelas
// diferentes — contato, identidade e conversa —, e um índice de busca só
// enxerga UM campo de UM documento.
//
// Por isso a conversa carrega `buscaTexto`: a junção normalizada do que a
// pessoa digitaria para encontrá-la. É DERIVADO, nunca autoridade — quem vale
// continua sendo `assunto`, `adminContacts.displayName` e
// `communicationIdentities.externalId`. Se este campo se perder, nada de
// operacional quebra: só a busca deixa de achar aquela linha.
//
// ── POR QUE NORMALIZAR ──────────────────────────────────────────────────────
// "Helena", "helena" e "HELENA" são a mesma pessoa; "(11) 99999-8888" e
// "+5511999998888" são o mesmo aparelho. Sem normalizar, a busca acha só quem
// digitou exatamente como está gravado — que é o mesmo que não achar.
// ─────────────────────────────────────────────────────────────────────────────

/** Tamanho máximo do campo derivado. Protege o documento de crescer sem limite. */
const LIMITE_DE_TEXTO = 600;

/** Abaixo disso a busca devolveria a caixa inteira — melhor não buscar. */
const MINIMO_DO_TERMO = 2;

/**
 * Minúsculas, sem acento, sem pontuação — só palavras e dígitos.
 *
 * `NFD` separa a letra do acento e a faixa `̀-ͯ` remove só a marca,
 * preservando a letra. É o mesmo princípio de `lib/supplierIdentity.ts`, que
 * já normaliza nomes de fornecedor no app da decoradora.
 */
export function normalizarTexto(bruto: string | undefined | null): string {
  if (!bruto) return "";
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Texto de busca de uma conversa.
 *
 * Recebe tudo o que identifica a conversa para um humano e devolve uma linha
 * só, sem repetição. A ordem das partes não importa para o índice; a
 * deduplicação importa, porque repetir "helena" quatro vezes não a torna mais
 * encontrável e ocupa espaço do que ainda cabe.
 */
export function textoDeBusca(partes: readonly (string | undefined | null)[]): string {
  const palavras: string[] = [];
  for (const parte of partes) {
    for (const palavra of normalizarTexto(parte).split(" ")) {
      if (palavra && !palavras.includes(palavra)) palavras.push(palavra);
    }
  }

  const junto = palavras.join(" ");
  return junto.length <= LIMITE_DE_TEXTO ? junto : junto.slice(0, LIMITE_DE_TEXTO).trimEnd();
}

/**
 * Termo digitado, pronto para o índice — ou `null` quando não há busca.
 *
 * `null` é o que diz a quem chama "liste normalmente". Um termo de uma letra
 * devolve `null` de propósito: buscar "a" traria tudo e daria a impressão de
 * que o filtro não funciona.
 */
export function termoDeBusca(bruto: string | undefined | null): string | null {
  const limpo = normalizarTexto(bruto);
  if (limpo.length < MINIMO_DO_TERMO) return null;
  return limpo;
}
