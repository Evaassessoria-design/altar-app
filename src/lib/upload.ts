// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVOS QUE ENTRAM NO ALTAR
//
// ── O QUE ESTE MÓDULO É E O QUE NÃO É ───────────────────────────────────────
// É uma checagem de EXPERIÊNCIA: avisar antes de gastar o 4G da pessoa
// subindo uma foto de 90 MB que o navegador depois não consegue desenhar.
//
// NÃO é a barreira de segurança. `file.type` vem do navegador e pode mentir; o
// que de fato protege é o backend, onde o `storageId` só vira registro através
// de uma mutation da própria empresa (convex/gallery.ts, leadDocuments.ts e
// companhia já conferem dono). Nada aqui afrouxa aquilo.
//
// ── POR QUE HAVIA UM BURACO ─────────────────────────────────────────────────
// Não existia limite nenhum — nem aqui nem no servidor. Um celular atual tira
// foto de dezenas de MB; várias delas de uma vez, num galpão com sinal ruim,
// era upload que nunca terminava e galeria que travava ao desenhar.
// ─────────────────────────────────────────────────────────────────────────────

/** Um megabyte, em bytes. */
const MB = 1024 * 1024;

/**
 * Teto das FOTOS. Generoso de propósito: foto de celular atual passa fácil de
 * 10 MB, e recusar o trabalho da pessoa seria pior que aceitar um arquivo
 * grande.
 */
export const TAMANHO_MAXIMO_IMAGEM = 15 * MB;

/** Teto dos DOCUMENTOS — contrato e proposta em PDF cabem de sobra. */
export const TAMANHO_MAXIMO_DOCUMENTO = 10 * MB;

export type TipoDeEnvio = "imagem" | "documento";

export type ArquivoAceito = { ok: true };
export type ArquivoRecusado = { ok: false; motivo: string };
export type ResultadoDaValidacao = ArquivoAceito | ArquivoRecusado;

/** Só o que interessa de um `File` — para o teste não precisar de DOM. */
export type ArquivoParaValidar = { name: string; type: string; size: number };

/** "3,2 MB" — para a mensagem dizer o tamanho em vez de só reclamar. */
export function tamanhoEmMB(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`;
}

export function tetoDoTipo(tipo: TipoDeEnvio): number {
  return tipo === "imagem" ? TAMANHO_MAXIMO_IMAGEM : TAMANHO_MAXIMO_DOCUMENTO;
}

/**
 * O arquivo pode subir?
 *
 * @param aceitos  Prefixos ou tipos MIME completos ("image/", "application/pdf").
 *                 Vazio = qualquer tipo, usado onde a tela já restringe pelo
 *                 `accept` do seletor.
 */
export function validarArquivo(
  arquivo: ArquivoParaValidar,
  opcoes: { tipo: TipoDeEnvio; aceitos?: readonly string[] },
): ResultadoDaValidacao {
  if (arquivo.size <= 0) {
    return { ok: false, motivo: `"${arquivo.name}" está vazio.` };
  }

  const teto = tetoDoTipo(opcoes.tipo);
  if (arquivo.size > teto) {
    return {
      ok: false,
      motivo:
        `"${arquivo.name}" tem ${tamanhoEmMB(arquivo.size)} — o limite é ` +
        `${tamanhoEmMB(teto)}. Tente uma versão menor.`,
    };
  }

  const aceitos = opcoes.aceitos ?? [];
  if (aceitos.length > 0) {
    const mime = (arquivo.type || "").toLowerCase();
    // Sem tipo declarado o navegador não soube dizer o que é. Deixamos passar
    // em vez de recusar o trabalho de alguém por causa de um palpite do
    // navegador — o backend continua sendo quem decide o que vira registro.
    const combina = mime === "" || aceitos.some((a) => (a.endsWith("/") ? mime.startsWith(a) : mime === a));
    if (!combina) {
      return { ok: false, motivo: `"${arquivo.name}" não é um tipo aceito aqui.` };
    }
  }

  return { ok: true };
}
