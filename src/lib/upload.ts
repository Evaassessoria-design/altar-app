// Caminho RELATIVO, e não o alias `@/convex/…` que o resto do front usa: este
// módulo é importado por um teste de banco que roda no projeto `convex`, onde
// esse alias não está mapeado — com ele, o typecheck do backend quebra.
//
// E o alias NÃO é escrito aqui nem dentro de comentário: a barra-asterisco da
// forma curta abre um bloco de comentário para as travas que leem a fonte, e
// foi assim que este teste quebrou antes de o caminho estar certo.
import {
  cabeNoTeto,
  formatoPermitido,
  recadoDeTamanho,
  tetoDoTipo as tetoDaCategoria,
  type TipoDeEnvio as Categoria,
} from "../../convex/lib/arquivos.ts";

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

// ── OS NÚMEROS NÃO MORAM MAIS AQUI ──────────────────────────────────────────
// Moravam, e era o defeito: este módulo dizia 10 MB para documento, a tela do
// funil dizia 20 MB e o backend aplicava 1.000.000 bytes. Três fontes, três
// respostas, e a decoradora descobria qual valia sendo recusada.
//
// Agora há uma: `convex/lib/arquivos.ts`, importável pelos dois lados. Este
// módulo continua existindo porque a CHECAGEM de experiência é do front — ele
// só deixou de inventar os limites.
export {
  MB,
  TAMANHO_MAXIMO_IMAGEM,
  TAMANHO_MAXIMO_DOCUMENTO,
  tamanhoEmMB,
  tetoDoTipo,
  dicaDeTamanho,
  type TipoDeEnvio,
} from "../../convex/lib/arquivos.ts";

export type ArquivoAceito = { ok: true };
export type ArquivoRecusado = { ok: false; motivo: string };
export type ResultadoDaValidacao = ArquivoAceito | ArquivoRecusado;

/** Só o que interessa de um `File` — para o teste não precisar de DOM. */
export type ArquivoParaValidar = { name: string; type: string; size: number };

/**
 * O arquivo pode subir?
 *
 * @param aceitos    Prefixos ou MIMEs completos ("image/", "application/pdf").
 * @param extensoes  Extensões com ponto (".docx"). Entrou nesta correção: o
 *                   MIME do Office é inconfiável, e DOCX chega como
 *                   `application/octet-stream` em máquina sem Office
 *                   instalado. Basta UM dos dois reconhecer.
 *
 * Nenhuma das duas listas = qualquer formato. É o caso de Referência e "Outro
 * documento" no funil, que de propósito recebem imagem, planilha e o que mais
 * a negociação produzir.
 */
export function validarArquivo(
  arquivo: ArquivoParaValidar,
  opcoes: { tipo: Categoria; aceitos?: readonly string[]; extensoes?: readonly string[] },
): ResultadoDaValidacao {
  if (arquivo.size <= 0) {
    return { ok: false, motivo: `"${arquivo.name}" está vazio.` };
  }

  // O MESMO predicado e o MESMO teto que o backend aplica — ver
  // `convex/lib/arquivos.ts`. Enquanto os dois lados chamarem isto, não há
  // como a tela aceitar o que o servidor recusa, que era exatamente o defeito:
  // o arquivo subia e só então era rejeitado, deixando órfão no storage.
  const teto = tetoDaCategoria(opcoes.tipo);
  if (!cabeNoTeto(arquivo.size, teto)) {
    return { ok: false, motivo: recadoDeTamanho(teto, arquivo.name) };
  }

  if (!formatoPermitido(arquivo, opcoes.aceitos ?? [], opcoes.extensoes ?? [])) {
    return { ok: false, motivo: `"${arquivo.name}" não é um tipo aceito aqui.` };
  }

  return { ok: true };
}
