import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { cabeNoTeto, recadoDeTamanho, TAMANHO_MAXIMO_DOCUMENTO } from "./arquivos";

// ─────────────────────────────────────────────────────────────────────────────
// O TAMANHO QUE VALE É O DO ARQUIVO GUARDADO, NÃO O QUE O NAVEGADOR DIZ
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// `leadDocuments.save` conferia `fileSize`, um número que o navegador manda e
// que ninguém confere: quem chama a mutation direto declara 1 byte e anexa o
// que quiser. E `contracts.saveContract` — a pasta do evento — não conferia
// tamanho NENHUM. O teto de documento existia só na tela.
//
// Com a URL de upload do Convex, o servidor não consegue barrar o POST pelo
// tamanho: o arquivo chega inteiro ao storage antes de qualquer função nossa
// rodar. O que ele PODE fazer é recusar transformar esse arquivo em documento,
// e para isso precisa do tamanho verdadeiro — que está na tabela de sistema
// `_storage`, gravado pelo próprio Convex no fim do upload.
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não apaga o arquivo recusado. `_storage` não tem dono, e apagar por um
// `storageId` vindo do navegador apagaria o de outra empresa — ver
// docs/upload/arquivo-orfao.md, backlog UPLOAD-ORFAO-01.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confere o arquivo no storage e devolve o tamanho REAL, em bytes.
 *
 * Chame DEPOIS de conferir o dono do registro (lead, evento): a ordem das
 * travas do repositório é posse primeiro, para que dado de outra conta
 * responda `NOT_FOUND` antes de qualquer outra coisa.
 */
export async function exigirArquivoGuardadoNoTeto(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  teto: number = TAMANHO_MAXIMO_DOCUMENTO,
): Promise<number> {
  const guardado = await ctx.db.system.get("_storage", storageId);
  if (!guardado) {
    // O POST não terminou, ou o id não é de um arquivo. Para a pessoa, as duas
    // coisas são "o envio não chegou" — e a ação certa é a mesma: tentar de novo.
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "O arquivo não chegou ao servidor. Tente enviar de novo.",
    });
  }
  if (guardado.size === 0) {
    throw new ConvexError({ code: "VALOR_INVALIDO", message: "O arquivo está vazio." });
  }
  if (!cabeNoTeto(guardado.size, teto)) {
    throw new ConvexError({ code: "VALOR_INVALIDO", message: recadoDeTamanho(teto) });
  }
  return guardado.size;
}
