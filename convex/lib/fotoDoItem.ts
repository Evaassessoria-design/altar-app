// ─────────────────────────────────────────────────────────────────────────────
// A FOTO DE UM ITEM DE MONTAGEM — QUAL ARQUIVO VALE
//
// ── O DEFEITO QUE ORIGINOU ESTE MÓDULO ──────────────────────────────────────
// A mesma imagem entrava no ALTAR duas vezes. A decoradora subia a foto da
// cadeira na Galeria (onde ela ganha ambiente, escopo, legenda e uma versão
// leve de 1400 px) e depois subia A MESMA FOTO de novo dentro do item de
// montagem — porque o item só sabia receber arquivo próprio.
//
// A segunda cópia custava três coisas: espaço no storage, que é cobrado; o
// contexto, que ela tinha acabado de preencher e que não viajava junto; e a
// versão leve, que não existia nesse caminho — a miniatura de 40 px do item
// baixava o ORIGINAL, que pode ter 15 MB.
//
// ── A REGRA, EM UMA FRASE ───────────────────────────────────────────────────
// O ponteiro para a Galeria manda QUANDO RESOLVE. Senão, vale o arquivo
// próprio do item.
//
// "Quando resolve" é a parte que importa. Um ponteiro pode apontar para uma
// foto que já não existe — `gallery.deletePhoto` limpa os ponteiros antes de
// apagar, mas uma exclusão interrompida, um dado anterior a esta rodada ou um
// bug futuro produzem o estado mesmo assim. Nesses casos o item NÃO fica sem
// foto se ele ainda tiver a dele: degradar para o arquivo próprio é o
// comportamento seguro, e é o mesmo princípio da regra 3 de `lib/responsavel.ts`
// e da capa em `events.coverPhotoId`.
//
// ── POR QUE AQUI, E NÃO NA CONSULTA ─────────────────────────────────────────
// Porque a precedência é lida em cinco lugares — a listagem, a tela do item,
// o Projeto Visual, o Caderno e o PDF dos noivos. Escrita cinco vezes, ela
// diverge; e a versão que divergir vai ser justamente a do documento impresso.
// ─────────────────────────────────────────────────────────────────────────────

/** De onde veio a imagem que a tela está desenhando. */
export type OrigemDaFoto = "galeria" | "proprio";

export type FotoResolvida = {
  /** O arquivo ORIGINAL. Tela cheia, download e impressão usam este. */
  url: string | null;
  /** A versão leve (1400 px), quando existe. Miniatura e grade usam esta. */
  previewUrl: string | null;
  /** `null` quando o item não tem foto nenhuma neste papel. */
  origem: OrigemDaFoto | null;
  /** A linha da Galeria, quando a foto veio de lá. Serve para "abrir na Galeria". */
  photoId?: string;
};

/** Vazio — o item não tem foto neste papel. */
export const SEM_FOTO: FotoResolvida = { url: null, previewUrl: null, origem: null };

/** O que a Galeria devolveu para o ponteiro, já lido do banco por quem chama. */
export type FotoDaGaleria = {
  _id: string;
  url: string | null;
  previewUrl: string | null;
};

/**
 * Decide entre o ponteiro e o arquivo próprio.
 *
 * @param daGaleria  a foto apontada, ou `null` quando o ponteiro não resolve
 *                   (apagada, de outro evento, nunca existiu).
 * @param urlPropria url do arquivo que o próprio item guarda, ou `null`.
 */
export function resolverFotoDoItem(
  daGaleria: FotoDaGaleria | null | undefined,
  urlPropria: string | null | undefined,
): FotoResolvida {
  if (daGaleria && daGaleria.url) {
    return {
      url: daGaleria.url,
      // A versão leve é opcional em TODA foto da galeria: as anteriores a ela
      // não têm, e HEIC no Android nunca gera. Ausente aqui não é erro — quem
      // desenha cai no original, que é o que sempre aconteceu.
      previewUrl: daGaleria.previewUrl ?? null,
      origem: "galeria",
      photoId: daGaleria._id,
    };
  }
  if (urlPropria) {
    // O caminho antigo não tem versão leve, e não vamos inventar uma: dizer
    // `previewUrl: urlPropria` faria a tela acreditar que baixou 250 KB quando
    // baixou 15 MB, e a medição de peso passaria a mentir.
    return { url: urlPropria, previewUrl: null, origem: "proprio" };
  }
  return SEM_FOTO;
}

/**
 * A foto que representa o item, entre as duas.
 *
 * Mesma precedência do Caderno de Montagem desde sempre: O CONTRATADO MANDA.
 * A referência é o que foi aprovado; o contratado é o que vai chegar. Quando
 * os dois existem, quem monta precisa ver o que vai chegar.
 */
export function fotoPrincipal(
  referencia: FotoResolvida,
  contratada: FotoResolvida,
): { foto: FotoResolvida; ehReferencia: boolean } {
  if (contratada.origem) return { foto: contratada, ehReferencia: false };
  if (referencia.origem) return { foto: referencia, ehReferencia: true };
  return { foto: SEM_FOTO, ehReferencia: false };
}

/**
 * O que desenhar numa MINIATURA.
 *
 * Preview quando há; original só como último recurso. É a mesma decisão que
 * `src/lib/imagem-reduzida.ts` já toma para a Galeria — repetida aqui porque
 * o item tem duas fontes e a da Galeria pode ou não ter versão leve.
 */
export function urlDeMiniatura(foto: FotoResolvida): string | null {
  // Verdade, não nulidade: `getUrl` devolve `string | null`, mas uma string
  // VAZIA atravessando `??` viraria `src=""`, que o navegador resolve como
  // "recarregue a página atual" e desenha um quadrado quebrado.
  return foto.previewUrl || foto.url || null;
}
