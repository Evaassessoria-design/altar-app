import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ═════════════════════════════════════════════════════════════════════════════
// O PREÇO DA ASSINATURA APARECE EM SETE LUGARES
//
// ── O QUE ESTA TRAVA DEFENDE ────────────────────────────────────────────────
// Quem cobra é `convex/asaas.ts`, com um número escrito na mão dentro do corpo
// da requisição. Os outros seis lugares são TEXTO: landing, paywall,
// configurações, painel admin. Nenhum deles lê o primeiro.
//
// Uma mudança de preço hoje é uma edição em sete arquivos. Esquecer um é a
// falha mais cara que este produto pode ter, porque ela não quebra nada: a
// landing anuncia um valor, o checkout cobra outro, e quem descobre é a
// cliente no extrato.
//
// ── POR QUE UM TESTE E NÃO UMA CONSTANTE COMPARTILHADA ──────────────────────
// Uma constante seria melhor, e é o que se deve fazer quando o preço deixar de
// ser um só. Hoje ela não caberia: o valor cruza a fronteira entre `convex/` e
// `src/`, aparece formatado de três jeitos diferentes (`R$119,90`,
// `R$ 119,90/mês`, e partido em dois `<span>`), e o do Asaas é número enquanto
// os outros são texto dentro de frase. Uma constante resolveria dois dos sete.
//
// O teste resolve os sete, e resolve a pergunta que importa: **todos dizem o
// mesmo?**
//
// Ele NÃO decide qual é o preço certo. Se a decisão for mudar, mude o de
// `asaas.ts` — quem cobra — e este teste aponta os outros seis.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (caminho: string) => readFileSync(caminho, "utf-8");

/**
 * As telas onde uma pessoa lê o preço.
 *
 * `admin/page.tsx` entra porque o MRR do painel é "assinantes × preço": se o
 * preço de lá divergir, o faturamento informado fica errado sem nada acusar.
 */
const TELAS = [
  "src/pages/Index.tsx",
  "src/pages/app/paywall/page.tsx",
  "src/pages/app/configuracoes/page.tsx",
  "src/pages/app/admin/page.tsx",
] as const;

/**
 * O preço "de", riscado ao lado do "por".
 *
 * Existe de propósito e não é divergência — mas precisa ser DECLARADO aqui,
 * senão qualquer valor perdido numa tela passaria por "ah, é o de antes".
 */
const PRECO_ANTERIOR = 149.9;

/** O que o Asaas realmente cobra. É a única fonte que move dinheiro. */
function precoCobrado(): number {
  const asaas = ler("convex/asaas.ts");
  const assinatura = asaas.slice(asaas.indexOf('asaasFetch("/subscriptions"'));
  const m = assinatura.match(/value:\s*([\d.]+)/);
  expect(m, "não achei o valor da assinatura em asaas.ts").not.toBeNull();
  return Number(m![1]);
}

/**
 * Os preços que um leitor VÊ numa tela.
 *
 * ── AS TRÊS ARMADILHAS, TODAS ENCONTRADAS RODANDO ISTO ────────────────────
 * 1. **O valor vem partido em dois elementos.** Landing e paywall imprimem
 *    `<span>R$ 119</span><span>,90</span>` para deixar os centavos menores.
 *    Tirando as tags sobra `R$ 119 ,90`, com espaço no lugar da tag — então a
 *    vírgula é procurada DEPOIS de espaço opcional. Sem isso o guarda lia
 *    `119` e acusava divergência numa página correta.
 * 2. **Separador de milhar.** `R$ 48.000` é exemplo de faturamento de uma
 *    decoradora, não preço de assinatura, e casava como `48`. Um valor seguido
 *    de ponto é milhar, e não interessa aqui.
 * 3. **Comentários.** Um `// R$ 119,90` que envelheceu é problema de
 *    documentação, não de vitrine. Tratá-lo como divergência faria esta trava
 *    gritar pelo motivo errado, e trava que grita errado é trava que se ignora.
 */
function precosVisiveis(fonte: string): number[] {
  const semComentario = fonte
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  const texto = semComentario.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  return [...texto.matchAll(/R\$\s?(\d{2,3})(?:\s?,\s?(\d{2}))?(?!\s?[.\d])/g)].map(
    (m) => Number(m[1]) + Number(m[2] ?? 0) / 100,
  );
}

describe("o preço é o mesmo em todo lugar", () => {
  const cobrado = precoCobrado();

  it("o Asaas cobra um valor plausível — senão o resto não significa nada", () => {
    expect(cobrado).toBeGreaterThan(0);
    expect(cobrado).toBeLessThan(PRECO_ANTERIOR);
  });

  it.each(TELAS)("%s só mostra o preço cobrado (ou o de antes, riscado)", (tela) => {
    const encontrados = precosVisiveis(ler(tela));
    expect(encontrados.length, `${tela} não mostra preço nenhum`).toBeGreaterThan(0);

    const estranhos = [...new Set(encontrados)].filter(
      (p) => p !== cobrado && p !== PRECO_ANTERIOR,
    );
    expect(
      estranhos,
      `${tela} mostra ${estranhos.join(", ")} — o Asaas cobra ${cobrado}`,
    ).toEqual([]);
  });

  it("o MRR do painel multiplica pelo valor cobrado, não por um número solto", () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // `mrr = ativos × 119.9`. Se o preço subir e este número ficar, o painel
    // informa um faturamento que não existe — e ninguém confere um número que
    // sempre esteve lá.
    const admin = ler("convex/admin.ts");
    const m = admin.match(/const mrr = active \* ([\d.]+)/);
    expect(m, "o cálculo do MRR mudou de forma; confira se ainda usa o preço").not.toBeNull();
    expect(Number(m![1]), "o MRR usa um preço diferente do cobrado").toBe(cobrado);
  });

  it("as duas telas de decisão mostram o preço cobrado, e não só o de antes", () => {
    // Landing e paywall são onde a pessoa decide pagar. Mostrar só o valor
    // riscado seria pior do que não mostrar preço.
    for (const tela of ["src/pages/Index.tsx", "src/pages/app/paywall/page.tsx"]) {
      expect(precosVisiveis(ler(tela)), tela).toContain(cobrado);
    }
  });
});

describe("o inventário fica registrado", () => {
  it("nenhuma tela nova passou a mostrar preço sem entrar nesta lista", () => {
    // ── POR QUE VARRER TUDO ───────────────────────────────────────────────
    // A trava acima só olha quatro arquivos. Uma tela nova com o preço escrito
    // dentro não seria conferida por ninguém — e é assim que o sétimo lugar
    // aparece.
    const paginas = import.meta.glob("/src/pages/**/*.tsx", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;

    const cobrado = precoCobrado();
    const fora: string[] = [];
    for (const [caminho, fonte] of Object.entries(paginas)) {
      if (caminho.includes(".test.")) continue;
      const relativo = caminho.replace(/^\//, "");
      if ((TELAS as readonly string[]).includes(relativo)) continue;
      // Só interessa preço de ASSINATURA. Valores de evento, orçamento e
      // exemplo são dado da cliente, não vitrine do ALTAR.
      if (precosVisiveis(fonte).some((p) => p === cobrado || p === PRECO_ANTERIOR)) {
        fora.push(relativo);
      }
    }
    expect(fora, `estas telas mostram o preço e não estão na lista: ${fora.join(", ")}`).toEqual(
      [],
    );
  });
});
