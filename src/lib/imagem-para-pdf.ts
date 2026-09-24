// ─────────────────────────────────────────────────────────────────────────────
// IMAGEM DA WEB → IMAGEM DENTRO DO PDF
//
// ── POR QUE UM MÓDULO, PARA TRINTA LINHAS ───────────────────────────────────
// Porque a versão que existia dentro do Caderno de Montagem tinha um defeito
// que ninguém encontra lendo o código: `createImageBitmap(blob)` IGNORA a
// orientação EXIF por padrão. Toda foto tirada com o iPhone em retrato entra
// no papel DEITADA — o navegador mostra certo na tela, porque o `<img>` aplica
// a orientação, e o PDF sai errado.
//
// O produto todo é feito de fotos tiradas no celular. Uma segunda cópia desta
// função em outro gerador repetiria o mesmo defeito, e ninguém ligaria os dois
// fatos. `imageOrientation: "from-image"` é a correção, e ela mora aqui.
//
// ── E POR QUE ELA NUNCA LANÇA ───────────────────────────────────────────────
// Imagem indisponível — rede caiu, URL expirou, formato que o navegador não
// decodifica — não pode derrubar um documento inteiro. Devolve `null`, e quem
// desenha decide o que fazer com o espaço.
// ─────────────────────────────────────────────────────────────────────────────

export type ImagemDoPdf = {
  dataUrl: string;
  /** Pixels, já reduzidos. A proporção é o que o layout usa. */
  w: number;
  h: number;
};

/**
 * Baixa, reduz e devolve a imagem pronta para `doc.addImage`.
 *
 * @param maxPx  o lado maior em pixels. Num A4 de 150 dpi, 1200 px cobre meia
 *               página com folga; pedir mais engorda o arquivo sem aparecer.
 */
export async function carregarImagemParaPdf(
  url: string,
  maxPx: number,
  qualidade = 0.72,
): Promise<ImagemDoPdf | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // A linha que importa. Ver o cabeçalho.
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });

    const escala = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG não tem transparência: sem o fundo branco, um PNG com alfa sai com
    // as áreas transparentes em preto.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    return { dataUrl: canvas.toDataURL("image/jpeg", qualidade), w, h };
  } catch {
    return null;
  }
}

/**
 * A caixa em que a imagem cabe, preservando a proporção.
 *
 * Devolve largura, altura e o deslocamento para centralizar no espaço dado.
 * Esticar foto de decoração é a diferença entre um documento de apresentação e
 * um relatório — e é irreversível na impressão.
 */
export function caixaProporcional(
  img: { w: number; h: number },
  larguraMax: number,
  alturaMax: number,
): { w: number; h: number; dx: number; dy: number } {
  const escala = Math.min(larguraMax / img.w, alturaMax / img.h);
  const w = img.w * escala;
  const h = img.h * escala;
  return { w, h, dx: (larguraMax - w) / 2, dy: (alturaMax - h) / 2 };
}
