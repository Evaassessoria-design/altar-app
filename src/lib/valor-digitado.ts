// ─────────────────────────────────────────────────────────────────────────────
// O VALOR EM REAIS QUE A PESSOA DIGITOU
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// O Financeiro fazia `parseFloat(campo)` e mandava para o servidor. Duas
// consequências, e a segunda é a grave:
//
//  1. `parseFloat("")` e `parseFloat("abc")` devolvem `NaN`. Um `NaN` gravado
//     não estraga só a própria linha: toda soma do Financeiro vira `NaN`.
//
//  2. `parseFloat("1.500,00")` devolve **1.5**. Um contrato de mil e quinhentos
//     reais entrava como um real e cinquenta — sem erro, sem aviso, e com o
//     recado "Lançamento adicionado!". É exatamente como alguém no Brasil
//     escreve dinheiro, e era o jeito de digitar que o produto punia.
//
// O campo era `type="number"`, o que esconde o problema em alguns navegadores
// e não em outros: o que `value` devolve para "1.500,00" depende do navegador
// e do idioma do sistema. Ler o texto e interpretá-lo aqui tira a conta do
// navegador.
//
// ── A REGRA DO SEPARADOR ────────────────────────────────────────────────────
// Quando há vírgula E ponto, o ÚLTIMO dos dois é o decimal: "1.500,00" é
// pt-BR, "1,500.00" é en-US, e as duas leituras dão 1500.
//
// Só ponto é ambíguo: "1.500" pode ser mil e quinhentos (pt-BR) ou um e meio.
// Três casas depois do ponto é separador de milhar — é assim que se escreve
// aqui, e é a leitura segura: errar para menos transforma um contrato em
// troco, calado; errar para mais produz um número absurdo que salta aos olhos.
// Duas casas ("0.50") é decimal, que é o que o próprio navegador devolve.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O número, ou `null` quando não dá para saber.
 *
 * `null` nunca é zero: gravar zero por não ter entendido é o erro que faz a
 * decoradora achar que lançou.
 */
export function valorDigitado(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (texto == null) return null;

  const limpo = texto
    .replace(/R\$/gi, "")
    // `\u00a0` escrito como escape: o espaço não separável copiado de uma
    // planilha é invisível no editor, e a regra de lint o proíbe cru.
    .replace(/[\s\u00a0]/g, "")
    .trim();
  if (!limpo) return null;
  // Só dígitos, separadores e um sinal à frente. "12abc" é erro de digitação,
  // não um número que começa com 12 — `parseFloat` aceitaria os dois.
  if (!/^-?[\d.,]+$/.test(limpo)) return null;

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");

  let normalizado: string;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    normalizado = limpo.split(milhar).join("").replace(decimal, ".");
  } else if (ultimaVirgula >= 0) {
    normalizado = limpo.split(",").join(".");
    // "1,500,00" — vírgula repetida: só a última é decimal.
    const partes = limpo.split(",");
    if (partes.length > 2) {
      normalizado = partes.slice(0, -1).join("") + "." + partes[partes.length - 1];
    }
  } else if (ultimoPonto >= 0) {
    const partes = limpo.split(".");
    const ultima = partes[partes.length - 1];
    // Mais de um ponto ("1.500.000") ou exatamente três casas ("1.500"):
    // separador de milhar.
    normalizado =
      partes.length > 2 || ultima.length === 3 ? partes.join("") : partes.join(".");
  } else {
    normalizado = limpo;
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/** Como o valor gravado volta para o campo: na escrita daqui. */
export function paraOCampo(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
