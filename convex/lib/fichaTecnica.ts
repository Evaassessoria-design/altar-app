import {
  abreviarUnidade,
  ehRetornavel,
  normalizeName,
  normalmenteVeraCompra,
  tipoEfetivo,
  type TipoDeMaterial,
} from "./materiais";

// ─────────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA — a conta que transforma projeto em necessidade real.
//
// A decoradora projeta "20 arranjos baixos na mesa dos convidados". A Ficha
// Técnica responde a pergunta seguinte, que hoje ela faz no papel:
//
//     20 arranjos × (5 rosas + 3 lisianthus + 2 eucaliptos + 1 vaso)
//     = 100 rosas, 60 lisianthus, 40 eucaliptos, 20 vasos
//
// E depois soma isso com a cerimônia, a mesa do bolo e o lounge, para dizer
// quanto o EVENTO INTEIRO precisa.
//
// ── ESTE MÓDULO É A FONTE ÚNICA DA MULTIPLICAÇÃO ────────────────────────────
// `quantidadeDaComposicao × quantidadePorUnidade` não pode aparecer em mais
// nenhum lugar — nem na tela, nem no PDF, nem na geração de compra. Se cada
// consumidor fizesse a própria conta, a tela mostraria 185 e o PDF 180, e a
// decoradora compraria pelo número errado.
//
// ── AS QUATRO REGRAS QUE NÃO SE NEGOCIAM ────────────────────────────────────
//
//  1. UNIDADE NÃO SE MISTURA. "Rosa branca" em haste e "rosa branca" em maço
//     são DUAS linhas do consolidado, nunca uma soma. Somar seria inventar uma
//     conversão que ninguém informou.
//  2. REFERÊNCIA VISUAL NÃO CONSOME NADA. A regra é `ehObrigacaoDeMontagem`,
//     a MESMA do Caderno de Montagem e da Folha de Carregamento — recebida por
//     parâmetro para não haver uma segunda definição de "isto é do projeto".
//  3. QUANTIDADE FÍSICA NÃO É DINHEIRO. 2,5 metros de tecido é legítimo;
//     `0.1 * 3` em ponto flutuante dá `0.30000000000000004`. Arredondamos em
//     3 casas — precisão física de sobra — e NUNCA aplicamos a regra de
//     centavos do financeiro aqui.
//  4. O CONSOLIDADO É DERIVADO, SEMPRE. Nenhum total é gravado no banco. Total
//     guardado envelhece em silêncio; total calculado não tem como divergir.
// ─────────────────────────────────────────────────────────────────────────────

/** Uma linha da receita: quanto deste material vai em UMA unidade da composição. */
export type ComponenteDaReceita = {
  /** Vínculo com o catálogo. Ausente = linha antiga ou material já apagado. */
  materialId?: string;
  /** Nome no momento em que a receita foi montada — sobrevive à exclusão. */
  nome: string;
  unidade: string;
  quantidade: number;
  tipo?: string;
  /** Custo de referência por unidade, copiado do catálogo. Só ESTIMATIVA. */
  custoReferencia?: number;
};

/** Uma composição dentro do evento: "20 arranjos baixos, mesa dos convidados". */
export type ComposicaoNoEvento = {
  _id: string;
  nome: string;
  area: string;
  ambiente?: string;
  /** Quantas unidades desta composição o evento tem. Ausente = 1. */
  quantidade?: number;
  projectScope?: string;
  receita?: readonly ComponenteDaReceita[];
};

// ── ARITMÉTICA FÍSICA ───────────────────────────────────────────────────────

/** Casas decimais que uma quantidade física guarda. Nada abaixo disso importa. */
export const CASAS_DECIMAIS = 3;

/**
 * Soma/multiplicação de quantidade física, sem lixo de ponto flutuante.
 *
 * NÃO é a regra do dinheiro: lá a tolerância é meio centavo e a pergunta é
 * "estes dois valores divergem?" (lib/custoDoEvento.ts). Aqui a pergunta é
 * "quantos metros de tecido eu preciso?", e a resposta correta para
 * `0.1 * 3` é `0.3`, não `0.30000000000000004`.
 */
export function quantidadeLimpa(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const fator = 10 ** CASAS_DECIMAIS;
  return Math.round(valor * fator) / fator;
}

/** Quantas unidades desta composição existem. Ausente/inválida = 1. */
export function unidadesDaComposicao(c: { quantidade?: number }): number {
  const q = c.quantidade;
  if (typeof q !== "number" || !Number.isFinite(q) || q < 0) return 1;
  return q;
}

/**
 * Necessidade de UM componente numa composição.
 *
 * Quantidade zero é resposta legítima: a decoradora pode zerar um ingrediente
 * sem apagar a linha, e o consolidado precisa refletir isso em vez de somar 1.
 */
export function necessidadeDoComponente(
  composicao: { quantidade?: number },
  componente: { quantidade: number },
): number {
  const porUnidade = Number.isFinite(componente.quantidade) ? componente.quantidade : 0;
  return quantidadeLimpa(unidadesDaComposicao(composicao) * porUnidade);
}

// ── CONSOLIDADO DO EVENTO ───────────────────────────────────────────────────

/** De onde veio parte da necessidade — o rastro que a decoradora confere. */
export type OrigemDaNecessidade = {
  composicaoId: string;
  composicao: string;
  area: string;
  ambiente?: string;
  /** Quantas unidades da composição. */
  unidades: number;
  /** Quanto por unidade. */
  porUnidade: number;
  /** O produto dos dois. */
  necessario: number;
};

/**
 * A CHAVE DE CONSOLIDAÇÃO — deliberada, e a pergunta mais importante deste
 * módulo: "estas duas linhas são o mesmo material?".
 *
 *   com `materialId` → o id, sempre. Dois cadastros distintos do catálogo são
 *                      materiais distintos, mesmo com nome igual: se fossem o
 *                      mesmo, a deduplicação do catálogo já os teria fundido.
 *   sem `materialId` → o nome NORMALIZADO, com a MESMA `normalizeName` do
 *                      catálogo de materiais e de fornecedores.
 *
 * A unidade entra sempre. Haste e maço nunca se somam.
 *
 * Antes desta correção o ramo sem id usava `trim().toLowerCase()`, que não
 * remove acento nem pontuação: "Eucalípto" e "Eucalipto" viravam duas linhas,
 * e "Vaso (25cm)" não encontrava "Vaso 25cm" — enquanto o catálogo, com a
 * regra completa, trataria os dois como o mesmo material. Duas normalizações
 * é duas respostas para a mesma pergunta.
 */
export function chaveDeConsolidacao(componente: {
  materialId?: string;
  nome: string;
  unidade?: string;
}): string {
  const identidade = componente.materialId
    ? `id:${componente.materialId}`
    : `nome:${normalizeName(componente.nome)}`;
  return `${identidade}|${componente.unidade ?? ""}`;
}

export type LinhaConsolidada = {
  /** Chave de agrupamento — ver `chaveDeConsolidacao`. */
  chave: string;
  materialId?: string;
  nome: string;
  unidade: string;
  tipo: TipoDeMaterial;
  /** Total que o evento inteiro precisa. */
  necessario: number;
  /** Espera-se de volta depois do evento? */
  retornavel: boolean;
  /** Entra na lista de compras por padrão? */
  normalmenteCompra: boolean;
  /**
   * Dois snapshots do MESMO material discordam sobre o tipo.
   *
   * Acontece de verdade: a ficha do ambiente A foi montada quando o vaso era
   * "consumível" e a do ambiente B depois de ele virar "acervo". Fundir as
   * duas e adotar a primeira em silêncio faria a linha prometer (ou negar)
   * devolução sem ninguém saber. A tela mostra o aviso; o dado não escolhe.
   */
  tipoAmbiguo: boolean;
  /** Custo estimado — só quando TODAS as origens tinham custo de referência. */
  custoEstimado: number | null;
  origens: OrigemDaNecessidade[];
};

/**
 * O que o evento inteiro precisa, somado por material e unidade.
 *
 * `ehObrigacao` é injetada por quem chama — na prática `ehObrigacaoDeMontagem`
 * (src/lib/decoration-project.ts). Recebida por parâmetro para este módulo,
 * que vive no backend, não duplicar a definição de escopo que já existe no
 * front: uma segunda cópia divergiria na primeira mudança.
 */
export function consolidarMateriais(
  composicoes: readonly ComposicaoNoEvento[],
  ehObrigacao: (item: { projectScope?: string }) => boolean,
): LinhaConsolidada[] {
  const porChave = new Map<string, LinhaConsolidada>();

  for (const composicao of composicoes) {
    // Referência visual e "não incluso" não consomem material nenhum: são
    // conversa com o cliente, não obrigação de execução.
    if (!ehObrigacao(composicao)) continue;

    const unidades = unidadesDaComposicao(composicao);

    for (const componente of composicao.receita ?? []) {
      const unidade = componente.unidade ?? "";
      // A unidade entra na chave: somar haste com maço seria inventar uma
      // conversão que ninguém informou.
      const chave = chaveDeConsolidacao({ ...componente, unidade });
      const necessario = necessidadeDoComponente(composicao, componente);

      const origem: OrigemDaNecessidade = {
        composicaoId: composicao._id,
        composicao: composicao.nome,
        area: composicao.area,
        ambiente: composicao.ambiente,
        unidades,
        porUnidade: componente.quantidade,
        necessario,
      };

      const existente = porChave.get(chave);
      if (existente) {
        existente.necessario = quantidadeLimpa(existente.necessario + necessario);
        existente.origens.push(origem);
        if (tipoEfetivo(componente) !== existente.tipo) existente.tipoAmbiguo = true;
        // O custo só continua sendo afirmável enquanto TODA origem tiver
        // referência. Uma linha sem custo torna a estimativa incompleta — e
        // incompleta a gente não mostra como se fosse total.
        if (existente.custoEstimado !== null) {
          existente.custoEstimado =
            typeof componente.custoReferencia === "number"
              ? quantidadeLimpa(existente.custoEstimado + necessario * componente.custoReferencia)
              : null;
        }
        continue;
      }

      const tipo = tipoEfetivo(componente);
      porChave.set(chave, {
        chave,
        materialId: componente.materialId,
        nome: componente.nome,
        unidade,
        tipo,
        necessario,
        retornavel: ehRetornavel(componente),
        normalmenteCompra: normalmenteVeraCompra(componente),
        tipoAmbiguo: false,
        custoEstimado:
          typeof componente.custoReferencia === "number"
            ? quantidadeLimpa(necessario * componente.custoReferencia)
            : null,
        origens: [origem],
      });
    }
  }

  return [...porChave.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type ResumoDoConsolidado = {
  materiais: number;
  /** Quantos têm custo de referência em todas as origens. */
  comCusto: number;
  /** Estimativa do que TEM custo. Nunca apresentada como custo do evento. */
  custoEstimado: number;
  /** A estimativa cobre todos os materiais? */
  estimativaCompleta: boolean;
  retornaveis: number;
};

/**
 * Números de cabeçalho do consolidado.
 *
 * `custoEstimado` soma só o que tem referência, e `estimativaCompleta` diz se
 * isso é o evento inteiro. A tela precisa dos dois para não apresentar
 * "R$ 3.400" como se fosse o custo, quando metade dos materiais não tem preço.
 */
export function resumirConsolidado(linhas: readonly LinhaConsolidada[]): ResumoDoConsolidado {
  const comCusto = linhas.filter((l) => l.custoEstimado !== null);
  return {
    materiais: linhas.length,
    comCusto: comCusto.length,
    custoEstimado: quantidadeLimpa(comCusto.reduce((s, l) => s + (l.custoEstimado ?? 0), 0)),
    estimativaCompleta: linhas.length > 0 && comCusto.length === linhas.length,
    retornaveis: linhas.filter((l) => l.retornavel).length,
  };
}

/** "185 haste", "2,5 m", "20 un". Números limpos, sem zeros à toa. */
export function quantidadeTexto(quantidade: number, unidade: string): string {
  const limpo = quantidadeLimpa(quantidade);
  const numero = Number.isInteger(limpo)
    ? String(limpo)
    : limpo.toFixed(CASAS_DECIMAIS).replace(/0+$/, "").replace(".", ",");
  const un = abreviarUnidade(unidade);
  return un ? `${numero} ${un}` : numero;
}

// ── PONTE COM AS COMPRAS ────────────────────────────────────────────────────

/** O que uma compra já registrada representa para uma linha do consolidado. */
export type CompraVinculada = {
  materialId?: string;
  unit?: string;
  quantity?: number;
  cancelada: boolean;
  /** Necessidade no momento em que a compra foi gerada. */
  necessidadeTecnica?: number;
};

export type CoberturaDaLinha = {
  necessario: number;
  /** Somado das compras vinculadas NÃO canceladas. */
  comprado: number;
  /** Falta comprar. Nunca negativo — sobra não é falta. */
  faltam: number;
  /** `null` quando não há necessidade (divisão por zero não vira 0%). */
  percentual: number | null;
  /** Existe compra vinculada a esta linha? */
  temCompra: boolean;
  /**
   * A necessidade mudou depois que a compra foi gerada?
   *
   * `null` quando não há como saber (compra sem o carimbo da necessidade).
   * Nunca reescrevemos a compra: a decoradora decide.
   */
  necessidadeMudou: boolean | null;
};

/**
 * Cobertura de UMA linha do consolidado pelas compras já registradas.
 *
 * NECESSIDADE ≠ COMPRA, e este módulo não força igualdade: precisar de 185 e
 * comprar 200 é perfeitamente correto (o florista vende por maço, sobra é
 * segurança). A cobertura informa, não cobra.
 *
 * Compra CANCELADA não cobre nada — é a mesma regra do resto do sistema
 * (lib/purchaseStatus.ts).
 */
export function coberturaDaLinha(
  linha: { necessario: number },
  compras: readonly CompraVinculada[],
): CoberturaDaLinha {
  const validas = compras.filter((c) => !c.cancelada);
  const comprado = quantidadeLimpa(
    validas.reduce((s, c) => s + (Number.isFinite(c.quantity ?? NaN) ? (c.quantity as number) : 0), 0),
  );
  const necessario = quantidadeLimpa(linha.necessario);
  const faltam = quantidadeLimpa(Math.max(0, necessario - comprado));

  const comCarimbo = validas.filter((c) => typeof c.necessidadeTecnica === "number");
  const necessidadeMudou =
    comCarimbo.length === 0
      ? null
      : comCarimbo.some(
          (c) => Math.abs((c.necessidadeTecnica as number) - necessario) > 1 / 10 ** CASAS_DECIMAIS,
        );

  return {
    necessario,
    comprado,
    faltam,
    percentual: necessario > 0 ? Math.round((comprado / necessario) * 100) : null,
    temCompra: validas.length > 0,
    necessidadeMudou,
  };
}
