import {
  abreviarUnidade,
  ehIndivisivel,
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
  /** Categoria do material no momento da receita. Agrupa o consolidado. */
  categoria?: string;
  /** Custo de referência por unidade, copiado do catálogo. Só ESTIMATIVA. */
  custoReferencia?: number;
  /**
   * Margem de segurança em PERCENTUAL, copiada do catálogo no momento da
   * receita. Ver `SUGERIDO` abaixo: é snapshot, exatamente como o resto.
   */
  margemPercentual?: number;
};

// ── MARGEM DE SEGURANÇA ─────────────────────────────────────────────────────
//
// Flor quebra no transporte, fita sobra em recorte, vidro trinca. A decoradora
// compra mais do que a conta pede — e até aqui fazia essa correção de cabeça,
// toda vez.
//
// ── NECESSÁRIO ≠ SUGERIDO ───────────────────────────────────────────────────
// A margem NÃO entra em `necessario`. São dois números com significados
// diferentes e ambos precisam estar visíveis:
//
//     necessario = a receita, pura      → "o projeto consome 185 hastes"
//     sugerido   = necessario + margem  → "compre 203,5 para ter folga"
//
// Somar a margem dentro de `necessario` destruiria a capacidade de responder
// "quanto o projeto realmente consome?" — e a conta de custo passaria a
// incluir sobra como se fosse consumo.
//
// ── POR QUE A MARGEM É SNAPSHOT ─────────────────────────────────────────────
// Ela é copiada para a receita junto com nome, unidade e tipo. Se ficasse só
// no catálogo, mudar a margem padrão da rosa hoje mudaria a sugestão de um
// evento executado há seis meses — o papel impresso na época diria uma coisa e
// a tela outra, sem ninguém ter mexido naquele evento.

/** Teto de sanidade. 100% já é "compre o dobro"; acima disso é erro de digitação. */
export const MARGEM_MAXIMA = 100;

/** A margem é válida? `0` é válido e diferente de ausente. */
export function margemValida(valor: number | null | undefined): boolean {
  if (valor === null || valor === undefined) return false;
  return Number.isFinite(valor) && valor >= 0 && valor <= MARGEM_MAXIMA;
}

/**
 * Quanto providenciar: necessário + margem.
 *
 * Sem margem configurada devolve o próprio necessário — nunca `null`, porque
 * "providencie o que a receita pede" é uma resposta correta, não uma ausência.
 * Note que `0` é margem CONFIGURADA e vale zero: nada de truthiness aqui, que
 * transformaria `0` em "sem margem".
 */
export function sugeridoParaProvidenciar(
  necessario: number,
  margemPercentual: number | null | undefined,
): number {
  if (!margemValida(margemPercentual)) return quantidadeLimpa(necessario);
  return quantidadeLimpa(necessario * (1 + (margemPercentual as number) / 100));
}

/**
 * O número que vai para a lista de compras, respeitando a UNIDADE.
 *
 * 110,25 hastes não existe: rosa se compra em haste inteira. 110,25 metros de
 * tecido existe. A distinção já está declarada em `UNIDADES` (`decimal`), e
 * este módulo NÃO inventa uma engine de conversão — só consulta o que o
 * vocabulário já diz.
 *
 * Arredonda para CIMA quando a unidade é inteira: arredondar para baixo comeria
 * justamente a margem que a decoradora pediu para ter.
 *
 * O valor exato continua disponível em `sugerido` — nada é escondido.
 */
export function sugeridoOperacional(sugerido: number, unidade: string): number {
  if (!ehIndivisivel(unidade)) return quantidadeLimpa(sugerido);
  return Math.ceil(quantidadeLimpa(sugerido));
}

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
  /** Categoria do snapshot, quando existe. Agrupa o consolidado no PDF. */
  categoria?: string;
  /** Total que o evento inteiro precisa. A receita pura, sem margem. */
  necessario: number;
  /**
   * Margem em percentual, quando TODAS as origens concordam.
   *
   * `null` quando não há margem OU quando duas origens discordam — dois
   * snapshots com margens diferentes não podem virar uma média inventada.
   */
  margemPercentual: number | null;
  /** `necessario` + margem. Igual a `necessario` quando não há margem. */
  sugerido: number;
  /** O sugerido arredondado pela unidade — é o que vai para a compra. */
  sugeridoOperacional: number;
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
        // Margens diferentes entre snapshots não viram média: a resposta
        // honesta é "não há uma margem para esta linha".
        const margemDaLinha = margemValida(componente.margemPercentual)
          ? (componente.margemPercentual as number)
          : null;
        if (margemDaLinha !== existente.margemPercentual) existente.margemPercentual = null;
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
        categoria: componente.categoria,
        necessario,
        margemPercentual: margemValida(componente.margemPercentual)
          ? (componente.margemPercentual as number)
          : null,
        sugerido: 0, // recalculado no fecho, depois de somar todas as origens
        sugeridoOperacional: 0,
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

  // O sugerido só pode ser calculado DEPOIS de somar todas as origens: aplicar
  // a margem parcela a parcela e somar daria outro número por arredondamento.
  for (const linha of porChave.values()) {
    linha.sugerido = sugeridoParaProvidenciar(linha.necessario, linha.margemPercentual);
    linha.sugeridoOperacional = sugeridoOperacional(linha.sugerido, linha.unidade);
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

/**
 * O que o sistema consegue AFIRMAR sobre a providência de uma linha.
 *
 * ── A HONESTIDADE QUE ESTE TIPO EXISTE PARA PROTEGER ────────────────────────
 * O ALTAR ainda NÃO tem acervo. Ele não sabe quantos vasos existem no galpão.
 * Então, para um material reutilizável sem compra nenhuma, a resposta correta
 * NÃO é "faltam 20 vasos" — é "eu não sei se você tem esses vasos".
 *
 * Dizer "faltam" mandaria a decoradora comprar vaso que ela já tem. Dizer
 * "coberto" mandaria contar com vaso que talvez esteja quebrado. As duas são
 * mentiras; a terceira opção é admitir a ignorância, e é essa que usamos.
 *
 *   coberto              o que foi providenciado alcança o sugerido
 *   parcial              existe compra, mas não chega
 *   sem_providencia      consumível/compra específica sem compra nenhuma —
 *                        aí "falta comprar" é verdade
 *   acervo_nao_informado reutilizável/locação sem compra: o sistema NÃO SABE
 *   sem_vinculo          existe compra parecida, sem vínculo técnico
 */
export type SituacaoDaCobertura =
  | "coberto"
  | "parcial"
  | "sem_providencia"
  | "acervo_nao_informado"
  | "sem_vinculo";

export const ROTULO_DA_SITUACAO: Record<SituacaoDaCobertura, string> = {
  coberto: "Providenciado",
  parcial: "Falta providenciar",
  sem_providencia: "Sem compra ainda",
  acervo_nao_informado: "Disponibilidade do acervo não informada",
  sem_vinculo: "Compra parecida sem vínculo",
};

/** Uma compra já registrada, no formato que a regra de cobertura consulta. */
export type CompraVinculada = {
  materialId?: string;
  unit?: string;
  quantity?: number;
  cancelada: boolean;
  /** Necessidade no momento em que a compra foi gerada ou vinculada. */
  necessidadeTecnica?: number;
};

export type CoberturaDaLinha = {
  necessario: number;
  /** O alvo da providência: o sugerido, não o necessário puro. */
  alvo: number;
  /** Somado das compras vinculadas NÃO canceladas. */
  comprado: number;
  /** Reservado do acervo para este evento. `null` = disponibilidade não informada. */
  doAcervo: number | null;
  /** Comprado + acervo — o que de fato está providenciado. */
  providenciado: number;
  /** Falta para alcançar o alvo. Nunca negativo — sobra não é falta. */
  faltam: number;
  /** Sobra acima do alvo, quando existe. */
  excedente: number;
  /** `null` quando não há alvo (divisão por zero não vira 0%). */
  percentual: number | null;
  temCompra: boolean;
  situacao: SituacaoDaCobertura;
  /**
   * A necessidade mudou depois que a compra foi feita?
   *
   * `null` quando não há como saber. Nunca reescrevemos a compra: a decoradora
   * decide, e pode reconhecer a nova necessidade sem mexer no que comprou.
   */
  necessidadeMudou: boolean | null;
  /** A necessidade que a compra carimbou, quando existe. Para a tela dizer "185 → 210". */
  necessidadeNaCompra: number | null;
};

/**
 * Cobertura de UMA linha do consolidado.
 *
 * NECESSIDADE ≠ COMPRA, e nada aqui força igualdade: precisar de 185 e comprar
 * 200 é correto. A cobertura informa; não cobra.
 *
 * `temSemelhanteSemVinculo` vem de fora porque é uma pergunta sobre o resto da
 * lista de compras, não sobre esta linha: existe uma compra com o mesmo nome e
 * a mesma unidade, mas sem `materialId`? Se existe, o sistema NÃO afirma que
 * falta nada — seria mandar comprar de novo o que ela já comprou à mão.
 */
export function coberturaDaLinha(
  linha: { necessario: number; sugerido?: number; tipo?: TipoDeMaterial },
  compras: readonly CompraVinculada[],
  opcoes: {
    temSemelhanteSemVinculo?: boolean;
    /**
     * Quanto o ACERVO cobre desta linha nesta janela (MASTER #8).
     *
     * `undefined` = o sistema continua sem saber, e a resposta segue sendo
     * "disponibilidade do acervo não informada". Só quando existe item de
     * acervo VINCULADO é que este número aparece.
     */
    doAcervo?: number;
  } = {},
): CoberturaDaLinha {
  const validas = compras.filter((c) => !c.cancelada);
  const comprado = quantidadeLimpa(
    validas.reduce((s, c) => s + (Number.isFinite(c.quantity ?? NaN) ? (c.quantity as number) : 0), 0),
  );
  const necessario = quantidadeLimpa(linha.necessario);
  const alvo = quantidadeLimpa(linha.sugerido ?? necessario);
  const faltam = quantidadeLimpa(Math.max(0, alvo - comprado));
  const excedente = quantidadeLimpa(Math.max(0, comprado - alvo));

  const comCarimbo = validas.filter((c) => typeof c.necessidadeTecnica === "number");
  const necessidadeMudou =
    comCarimbo.length === 0
      ? null
      : comCarimbo.some(
          (c) => Math.abs((c.necessidadeTecnica as number) - necessario) > 1 / 10 ** CASAS_DECIMAIS,
        );

  const temCompra = validas.length > 0;
  // O material JÁ É da empresa (acervo) ou volta para o fornecedor (locação).
  // Sem item de acervo vinculado, ausência de compra aqui não significa falta.
  const dependeDoAcervo = linha.tipo === "reutilizavel" || linha.tipo === "locacao";

  // ── O ACERVO ENTRA NA CONTA (MASTER #8) ──────────────────────────────────
  // Quando existe item de acervo vinculado, o que ele cobre soma com o que foi
  // comprado: 14 do acervo + 0 comprados para uma necessidade de 20 significa
  // "faltam 6", não "faltam 20". O acervo é providência tanto quanto a compra.
  const doAcervo = typeof opcoes.doAcervo === "number" ? quantidadeLimpa(opcoes.doAcervo) : null;
  const providenciado = quantidadeLimpa(comprado + (doAcervo ?? 0));
  const faltamComAcervo = quantidadeLimpa(Math.max(0, alvo - providenciado));

  const situacao: SituacaoDaCobertura =
    doAcervo !== null
      ? faltamComAcervo === 0
        ? "coberto"
        : "parcial"
      : temCompra
        ? faltam === 0
          ? "coberto"
          : "parcial"
        : opcoes.temSemelhanteSemVinculo
          ? "sem_vinculo"
          : dependeDoAcervo
            ? "acervo_nao_informado"
            : "sem_providencia";

  return {
    necessario,
    alvo,
    comprado,
    /** Reservado do acervo para este evento. `null` = ainda não informado. */
    doAcervo,
    /** Comprado + acervo. É o que de fato está providenciado. */
    providenciado,
    faltam: doAcervo !== null ? faltamComAcervo : faltam,
    excedente,
    percentual: alvo > 0 ? Math.round((comprado / alvo) * 100) : null,
    temCompra,
    situacao,
    necessidadeMudou,
    necessidadeNaCompra: comCarimbo.length > 0 ? (comCarimbo[0].necessidadeTecnica as number) : null,
  };
}

/**
 * A linha exige atenção da decoradora AGORA?
 *
 * Só o que é verdade verificável — nada de métrica decorativa. "Acervo não
 * informado" NÃO é pendência: é uma informação que o sistema ainda não tem, e
 * transformá-la em alerta seria cobrar dela uma resposta que o produto ainda
 * não sabe fazer a pergunta.
 */
export function precisaDeAtencao(cobertura: CoberturaDaLinha, tipoAmbiguo: boolean): boolean {
  if (tipoAmbiguo) return true;
  if (cobertura.necessidadeMudou === true) return true;
  if (cobertura.situacao === "sem_vinculo") return true;
  if (cobertura.situacao === "parcial") return true;
  return false;
}

/** Frase curta do que exige atenção, ou `null`. Linguagem humana, sem código. */
export function motivoDaAtencao(
  cobertura: CoberturaDaLinha,
  tipoAmbiguo: boolean,
): string | null {
  if (cobertura.necessidadeMudou === true && cobertura.necessidadeNaCompra !== null) {
    return `Necessidade mudou: ${cobertura.necessidadeNaCompra} → ${cobertura.necessario}`;
  }
  if (cobertura.situacao === "sem_vinculo") return "Existe uma compra parecida sem vínculo";
  if (cobertura.situacao === "parcial") return "Falta providenciar";
  if (tipoAmbiguo) return "Classificação divergente entre ambientes";
  return null;
}
