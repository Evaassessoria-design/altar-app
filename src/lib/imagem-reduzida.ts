// ─────────────────────────────────────────────────────────────────────────────
// A VERSÃO LEVE DA FOTO
//
// ── O PROBLEMA, EM NÚMEROS ──────────────────────────────────────────────────
// O teto de envio é 15 MB (`upload.ts`), e foto de celular atual chega perto
// disso. Nada reduzia nada: a grade da Galeria desenha um quadrado de 138 px
// num telefone de 320 e, para isso, baixava o ORIGINAL inteiro. Cinquenta
// fotos de um casamento eram, no pior caso, 750 MB para rolar uma tela.
//
// Depois desta rodada a mesma tela baixa ~250 KB por foto.
//
// ── POR QUE NO NAVEGADOR, ANTES DE SUBIR ────────────────────────────────────
// Reduzir no servidor exigiria decodificar imagem no Convex: `sharp` tem
// binário nativo e não roda lá; um decodificador em JS puro seria lento e
// caro; e transformar sob demanda exigiria serviço de imagem ou CDN novos.
// Qualquer um dos três é infraestrutura nova para um problema que o navegador
// que já tem o arquivo aberto resolve de graça.
//
// E a técnica não é nova aqui: `generate-assembly-pdf.ts` já reduz imagem
// exatamente assim (`createImageBitmap` → canvas → JPEG) desde que o Caderno
// passou a levar foto. Este módulo é aquela mesma ideia, movida para o momento
// do envio e escrita uma vez só.
//
// ── UM TAMANHO, NÃO DOIS ────────────────────────────────────────────────────
// A tentação é gerar miniatura (grade) E preview (capa). Foi medido antes de
// decidir:
//
//   grade da Galeria    138 px no telefone  → ~414 px de tela em DPR 3
//   prateleira do Projeto  77–120 px        → ~360 px
//   capa no telefone     até 430 px         → ~1290 px
//   capa no computador   720 px             → ~1440 px em DPR 2
//
// Um arquivo de 1400 px atende o MAIOR desses usos com nitidez e serve os
// outros de sobra. Dois arquivos economizariam banda na grade — e custariam um
// terceiro upload por foto, no pior momento possível: ela subindo trinta fotos
// do sítio, no 4G. Upload é o gargalo dela; download é o nosso.
//
// Se a grade um dia provar-se lenta, cabe acrescentar uma miniatura sem mexer
// em nada disto: o campo é opcional e a regra de exibição é uma função só.
//
// ── O ORIGINAL NUNCA É TOCADO ───────────────────────────────────────────────
// O arquivo que ela enviou sobe inteiro, sempre, primeiro. A versão leve é
// ADICIONAL e opcional: se a geração falhar — formato que o navegador não
// decodifica, canvas indisponível, memória — a foto é salva exatamente como
// antes desta rodada. Nada silenciosamente substitui o trabalho dela.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lado maior da versão leve, em pixels.
 *
 * 1400 é o mesmo número que o Caderno de Montagem já usa para a planta — a
 * maior imagem que aquele documento desenha. Repetir a escolha mantém uma
 * decisão só no produto em vez de duas parecidas.
 */
export const LADO_MAIOR_PREVIEW = 1400;

/** Qualidade do JPEG. 0,72 é o ponto em que o artefato deixa de ser visível. */
export const QUALIDADE_PREVIEW = 0.72;

/**
 * Abaixo disto não vale ter dois arquivos.
 *
 * Uma foto de 300 KB não melhora nada ao ganhar uma cópia de 250 KB: dobra o
 * storage, dobra o upload e economiza quase nada de banda.
 */
export const GANHO_MINIMO = 0.5;

/**
 * As dimensões da versão leve, preservando a PROPORÇÃO.
 *
 * Imagem já menor que o teto não é ampliada: `scale` nunca passa de 1. Esticar
 * uma foto pequena só produziria um arquivo maior e borrado.
 */
export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMaior: number = LADO_MAIOR_PREVIEW,
): { largura: number; altura: number } {
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) {
    return { largura: 0, altura: 0 };
  }
  const escala = Math.min(1, ladoMaior / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/** A versão leve compensa o segundo arquivo? */
export function valeAPena(bytesOriginal: number, bytesPreview: number): boolean {
  if (!Number.isFinite(bytesOriginal) || !Number.isFinite(bytesPreview)) return false;
  if (bytesOriginal <= 0 || bytesPreview <= 0) return false;
  return bytesPreview <= bytesOriginal * GANHO_MINIMO;
}

/**
 * Qual URL a tela deve desenhar.
 *
 * UMA função, e é de propósito: Galeria, prateleiras do Projeto e capa fazem a
 * mesma pergunta, e três cópias desta linha divergiriam — uma tela mostraria a
 * versão leve e outra continuaria baixando o original, sem ninguém notar.
 *
 * Foto antiga não tem versão leve e cai no original. É o fallback, e é por ele
 * que não existe backfill: nada precisa ser reprocessado para o produto
 * funcionar.
 */
export function urlDeExibicao(foto: {
  url?: string | null;
  previewUrl?: string | null;
}): string | null {
  return foto.previewUrl ?? foto.url ?? null;
}

/**
 * A versão leve de uma imagem, ou `null` quando não deu.
 *
 * `null` NÃO é erro a mostrar para a usuária: é "esta foto vai sem versão
 * leve", e a tela segue igual. Os motivos legítimos são vários e nenhum deles
 * é culpa dela:
 *
 *   · HEIC/HEIF vindo do Files do iPhone — o Safari decodifica, o Chrome no
 *     Android não. (Escolhendo pela câmera ou pelo álbum, o iOS costuma
 *     entregar JPEG convertido, e aí funciona.)
 *   · canvas indisponível, memória insuficiente, arquivo corrompido;
 *   · imagem que já é pequena — aí a cópia não compensa (`valeAPena`).
 *
 * Roda no navegador. `createImageBitmap` decodifica FORA da thread principal,
 * então a interface não trava enquanto a foto é processada.
 */
export async function gerarPreview(arquivo: File): Promise<File | null> {
  try {
    if (!arquivo.type.startsWith("image/")) return null;
    if (typeof createImageBitmap !== "function") return null;

    // `from-image` respeita a orientação do EXIF. Sem isto, foto de retrato do
    // iPhone é desenhada deitada no canvas — o canvas ignora o EXIF que o
    // `<img>` respeita, e a versão leve sairia girada enquanto o original não.
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });

    const { largura, altura } = dimensoesReduzidas(bitmap.width, bitmap.height);
    if (largura === 0) {
      bitmap.close();
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    // Fundo branco: JPEG não tem transparência, e sem isto um PNG com fundo
    // transparente vira uma mancha preta.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE_PREVIEW),
    );
    if (!blob) return null;
    if (!valeAPena(arquivo.size, blob.size)) return null;

    return new File([blob], nomeDoPreview(arquivo.name), { type: "image/jpeg" });
  } catch {
    // Nenhuma falha aqui pode impedir o envio da foto.
    return null;
  }
}

/** "mesa-do-bolo.heic" → "mesa-do-bolo.preview.jpg" */
export function nomeDoPreview(nome: string): string {
  const semExtensao = nome.replace(/\.[^.]+$/, "") || "foto";
  return `${semExtensao}.preview.jpg`;
}
