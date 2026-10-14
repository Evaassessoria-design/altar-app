import {
  CASAS_DECIMAIS,
  ehApenasOrientacao,
  ehTotalDistribuido,
  necessidadeDoComponente,
  quantidadeTexto,
  unidadesDaComposicao,
  type ComponenteDaReceita,
  type ComposicaoNoEvento,
} from "./fichaTecnica";
import { normalizeName } from "./materiais";

// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO FLORAL — a ficha que vai para a mão do florista.
//
// A pergunta que este módulo responde: "o que eu entrego ao florista para ele
// montar os arranjos deste casamento sem me ligar seis vezes?".
//
// ── NÃO É UMA SEGUNDA FICHA TÉCNICA ─────────────────────────────────────────
// A Ficha Técnica responde "do que o projeto é feito e quanto comprar"; esta
// responde "como montar cada arranjo, com qual flor, em que cor, a que hora".
// As duas leem a MESMA receita (`assemblyItems.receita`) e a MESMA conta
// (`necessidadeDoComponente`, em lib/fichaTecnica.ts). Este arquivo não
// multiplica nada por conta própria — se multiplicasse, a tela mostraria 100
// rosas e o papel do florista 95.
//
// ── AS TRÊS COISAS QUE ELE NÃO FAZ ──────────────────────────────────────────
//  1. NÃO INVENTA TOTAL. Linha de orientação ("folhagem a gosto") sai como
//     instrução e fica fora de qualquer soma. Número inventado aqui viraria
//     compra inventada depois.
//  2. NÃO CONVERTE UNIDADE. Maço não vira haste, dúzia não vira unidade. A
//     chave de agrupamento leva a unidade, igual ao consolidado da ficha.
//  3. NÃO CARREGA DINHEIRO. Nenhuma função daqui devolve custo, margem de
//     lucro, fornecedor ou situação de compra — a ficha do florista é
//     documento de produção, e preço na mão de fornecedor é vazamento
//     comercial. O mesmo princípio da Folha de Carregamento.
// ─────────────────────────────────────────────────────────────────────────────

/** Rótulos de `componenteDaReceita.origem`, num lugar só. */
export const ROTULO_DA_ORIGEM: Record<string, string> = {
  natural: "Natural",
  permanente: "Permanente",
};

export function rotuloDaOrigem(origem: string | undefined): string | null {
  if (!origem) return null;
  return ROTULO_DA_ORIGEM[origem] ?? null;
}

/**
 * As duas quantidades que o florista precisa ler juntas, e que a decoradora
 * hoje calcula de cabeça:
 *
 *   `porArranjo` — quanto vai em CADA arranjo;
 *   `total`      — quanto o conjunto consome.
 *
 * Quando a linha é um total distribuído ("2 maços entre as 20 mesas"), não
 * existe "por arranjo": `porArranjo` vem `null` em vez de uma divisão
 * inventada. 2 ÷ 20 = 0,1 maço é um número que ninguém consegue separar na
 * bancada.
 */
export type QuantidadeDaLinha = {
  porArranjo: number | null;
  total: number;
  unidade: string;
  unidades: number;
  distribuido: boolean;
};

export function quantidadeDaLinha(
  composicao: { quantidade?: number },
  componente: ComponenteDaReceita,
): QuantidadeDaLinha {
  const distribuido = ehTotalDistribuido(componente);
  return {
    porArranjo: distribuido ? null : componente.quantidade,
    total: necessidadeDoComponente(composicao, componente),
    unidade: componente.unidade,
    unidades: unidadesDaComposicao(composicao),
    distribuido,
  };
}

/**
 * A frase que vai no papel. Escrita aqui, e não na tela nem no PDF, porque os
 * dois precisam dizer exatamente a mesma coisa.
 */
export function textoDaQuantidade(q: QuantidadeDaLinha): string {
  if (q.distribuido) {
    const entre =
      q.unidades > 1 ? ` distribuídos entre os ${q.unidades} arranjos` : "";
    return `${quantidadeTexto(q.total, q.unidade)} no total${entre}`;
  }
  const porArranjo = quantidadeTexto(q.porArranjo ?? 0, q.unidade);
  if (q.unidades <= 1) return `${porArranjo} no arranjo`;
  return `${porArranjo} por arranjo · ${quantidadeTexto(q.total, q.unidade)} no total`;
}

/**
 * Uma linha de receita como o florista a lê. Campo a campo: sem custo, e sem
 * `notes` — essa é anotação INTERNA da decoradora e pode citar fornecedor ou
 * preço. O único texto da linha que vai para o florista é
 * `orientacaoFlorista`, escrito para ele.
 */
export type LinhaFloral = {
  nome: string;
  variedade?: string;
  cor?: string;
  origem?: string;
  quantidade: QuantidadeDaLinha;
  orientacaoFlorista?: string;
};

/** Uma orientação sem quantidade — instrução, nunca total. */
export type OrientacaoFloral = {
  nome: string;
  cor?: string;
  origem?: string;
  orientacaoFlorista?: string;
};

/**
 * Separa a receita em MATERIAIS (com quantidade) e ORIENTAÇÕES (sem).
 *
 * Campo a campo nos dois: um `...componente` aqui publicaria `custoReferencia`
 * e `margemPercentual` na ficha do fornecedor. Já aconteceu em outro
 * documento deste repositório, e a correção foi esta.
 */
export function linhasDaComposicao(composicao: ComposicaoNoEvento): {
  materiais: LinhaFloral[];
  orientacoes: OrientacaoFloral[];
} {
  const materiais: LinhaFloral[] = [];
  const orientacoes: OrientacaoFloral[] = [];

  for (const componente of composicao.receita ?? []) {
    const nome = componente.nome?.trim();
    if (!nome) continue;
    if (ehApenasOrientacao(componente)) {
      orientacoes.push({
        nome,
        cor: componente.cor?.trim() || undefined,
        origem: componente.origem,
        orientacaoFlorista: componente.orientacaoFlorista?.trim() || undefined,
      });
      continue;
    }
    materiais.push({
      nome,
      variedade: componente.variedade?.trim() || undefined,
      cor: componente.cor?.trim() || undefined,
      origem: componente.origem,
      quantidade: quantidadeDaLinha(composicao, componente),
      orientacaoFlorista: componente.orientacaoFlorista?.trim() || undefined,
    });
  }

  return { materiais, orientacoes };
}

/** Os campos de instrução de uma composição, já limpos. */
export type InstrucoesFlorais = {
  formato?: string;
  altura?: string;
  montagem?: string;
  substituicoes?: string;
  cuidados?: string;
  horario?: string;
  observacoes?: string;
};

const CAMPOS_DE_INSTRUCAO = [
  "formato",
  "altura",
  "montagem",
  "substituicoes",
  "cuidados",
  "horario",
  "observacoes",
] as const;

/** Rótulos dos campos de instrução, na ordem em que se lê na bancada. */
export const ROTULO_DA_INSTRUCAO: Record<
  (typeof CAMPOS_DE_INSTRUCAO)[number],
  string
> = {
  formato: "Formato",
  altura: "Altura",
  montagem: "Montagem",
  substituicoes: "Substituições permitidas",
  cuidados: "Cuidados",
  horario: "Horário",
  observacoes: "Observações para o florista",
};

export function instrucoesDaComposicao(
  floral: InstrucoesFlorais | undefined,
): InstrucoesFlorais {
  const limpo: InstrucoesFlorais = {};
  if (!floral) return limpo;
  for (const campo of CAMPOS_DE_INSTRUCAO) {
    const valor = floral[campo]?.trim();
    if (valor) limpo[campo] = valor;
  }
  return limpo;
}

/** Tem alguma instrução escrita? Bloco vazio não entra no papel. */
export function temInstrucoes(floral: InstrucoesFlorais | undefined): boolean {
  return Object.keys(instrucoesDaComposicao(floral)).length > 0;
}

/**
 * Cuidados e horários de todas as composições, reunidos.
 *
 * Eles aparecem DUAS vezes na ficha de propósito: no bloco da composição,
 * onde o florista monta, e num bloco destacado no começo, porque "hortênsia
 * não pode faltar água" e "o arranjo do bolo chega 16h" são as duas coisas
 * que arruínam o evento se alguém ler tarde.
 */
export type AvisoFloral = {
  composicaoId: string;
  composicao: string;
  ambiente: string;
  cuidados?: string;
  horario?: string;
};

export function avisosDaFicha(
  composicoes: readonly (ComposicaoNoEvento & {
    floral?: InstrucoesFlorais;
    rotuloDoAmbiente?: string;
  })[],
): AvisoFloral[] {
  const avisos: AvisoFloral[] = [];
  for (const c of composicoes) {
    const i = instrucoesDaComposicao(c.floral);
    if (!i.cuidados && !i.horario) continue;
    avisos.push({
      composicaoId: c._id,
      composicao: c.nome,
      ambiente: c.rotuloDoAmbiente ?? c.ambiente ?? c.area,
      cuidados: i.cuidados,
      horario: i.horario,
    });
  }
  return avisos;
}

/**
 * O checklist de produção: uma linha por composição, com o que conferir antes
 * de sair da bancada.
 *
 * É DERIVADO, não um cadastro à parte. Checklist gravado envelhece sozinho —
 * a decoradora muda a receita e a caixinha continua falando da antiga.
 */
export type ItemDeChecklist = {
  composicaoId: string;
  composicao: string;
  ambiente: string;
  unidades: number;
  /** Quantas linhas de material esta composição tem. */
  materiais: number;
  /** Tem cuidado ou horário específico para conferir? */
  comAviso: boolean;
};

export function checklistDeProducao(
  composicoes: readonly (ComposicaoNoEvento & {
    floral?: InstrucoesFlorais;
    rotuloDoAmbiente?: string;
  })[],
): ItemDeChecklist[] {
  return composicoes.map((c) => {
    const { materiais } = linhasDaComposicao(c);
    const i = instrucoesDaComposicao(c.floral);
    return {
      composicaoId: c._id,
      composicao: c.nome,
      ambiente: c.rotuloDoAmbiente ?? c.ambiente ?? c.area,
      unidades: unidadesDaComposicao(c),
      materiais: materiais.length,
      comAviso: Boolean(i.cuidados || i.horario),
    };
  });
}

/**
 * O RESUMO DE MATERIAIS da ficha do florista.
 *
 * ── UMA LINHA POR COISA QUE SE COMPRA SEPARADO ──────────────────────────────
 * A chave é material (ou nome, sem vínculo) + VARIEDADE + COR + ORIGEM +
 * UNIDADE. A versão anterior juntava só por material e unidade e, quando as
 * linhas divergiam, apagava a cor e a origem: 100 rosas brancas naturais e 48
 * rosas rosê permanentes viravam "Rosa 148 hastes". Para o florista são duas
 * compras — rosa de seda não sai da CEASA. Agora nada diferente se soma.
 *
 * Maiúsculas e espaços não separam ("Branca" e "branca " são a mesma cor);
 * a grafia mostrada é a da primeira linha.
 *
 * ── POR QUE NÃO REAPROVEITA `consolidarMateriais` DIRETO ────────────────────
 * Aquela função devolve custo estimado, margem, tipo ambíguo, cobertura de
 * compra e sugestão de providência — tudo informação interna, e três delas
 * financeiras. A CONTA, que é o que não pode divergir, é a mesma:
 * `necessidadeDoComponente`.
 *
 * ── RESUMO NÃO COMPRA, NÃO RESERVA, NÃO MOVIMENTA ───────────────────────────
 * Isto é papel. Nada aqui cria compra, mexe em estoque ou reserva acervo.
 */
export type LinhaDoResumo = {
  chave: string;
  /** Material do catálogo, quando a linha tem vínculo. A foto vem por ele. */
  materialId: string | null;
  nome: string;
  variedade: string | null;
  cor: string | null;
  origem: string | null;
  unidade: string;
  total: number;
  /** Em que composições este material entra. */
  origens: { composicao: string; ambiente: string }[];
};

const paraChave = (texto: string | undefined) => normalizeName(texto?.trim() ?? "");

export function chaveDoResumo(componente: {
  materialId?: string;
  nome: string;
  variedade?: string;
  cor?: string;
  origem?: string;
  unidade?: string;
}): string {
  const identidade = componente.materialId
    ? `id:${componente.materialId}`
    : `nome:${normalizeName(componente.nome.trim())}`;
  return [
    identidade,
    `var:${paraChave(componente.variedade)}`,
    `cor:${paraChave(componente.cor)}`,
    `origem:${componente.origem ?? ""}`,
    `un:${componente.unidade ?? ""}`,
  ].join("|");
}

export function resumoDeMateriais(
  composicoes: readonly (ComposicaoNoEvento & { rotuloDoAmbiente?: string })[],
): LinhaDoResumo[] {
  const porChave = new Map<string, LinhaDoResumo>();

  for (const composicao of composicoes) {
    for (const componente of composicao.receita ?? []) {
      if (ehApenasOrientacao(componente)) continue;
      const nome = componente.nome?.trim();
      if (!nome) continue;

      const chave = chaveDoResumo({ ...componente, nome });
      const total = necessidadeDoComponente(composicao, componente);
      const ambiente =
        composicao.rotuloDoAmbiente ?? composicao.ambiente ?? composicao.area;

      const existente = porChave.get(chave);
      if (!existente) {
        porChave.set(chave, {
          chave,
          materialId: componente.materialId ?? null,
          nome,
          variedade: componente.variedade?.trim() || null,
          cor: componente.cor?.trim() || null,
          origem: componente.origem ?? null,
          unidade: componente.unidade ?? "",
          total,
          origens: [{ composicao: composicao.nome, ambiente }],
        });
        continue;
      }
      existente.total = Number((existente.total + total).toFixed(CASAS_DECIMAIS));
      existente.origens.push({ composicao: composicao.nome, ambiente });
    }
  }

  return [...porChave.values()].sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR") ||
      (a.variedade ?? "").localeCompare(b.variedade ?? "", "pt-BR") ||
      (a.cor ?? "").localeCompare(b.cor ?? "", "pt-BR") ||
      (a.origem ?? "").localeCompare(b.origem ?? "") ||
      a.unidade.localeCompare(b.unidade),
  );
}

/**
 * A LEGENDA DAS FLORES — nome, variedade, cor, quantidade, origem e a foto.
 *
 * ── FOTO DA FLOR ≠ REFERÊNCIA DO ARRANJO ────────────────────────────────────
 * São duas imagens com papéis diferentes, e misturá-las é o erro que esta
 * separação existe para impedir:
 *
 *   FOTO DA FLOR      — "é esta flor que estou chamando de lisianthus".
 *                       Vem do catálogo (`materials.fotoStorageId`), uma por
 *                       insumo, reaproveitada em todos os eventos da conta.
 *   REFERÊNCIA DO     — "é assim que o arranjo deve ficar". Vem da Galeria do
 *   ARRANJO             evento (`assemblyItems.referencePhotoId`), e é do
 *                       arranjo, não da flor.
 *
 * A legenda abaixo é só a primeira. A referência do arranjo entra no bloco da
 * composição, com o próprio rótulo.
 *
 * ── A FOTO PODE NÃO SER DA COR PEDIDA ───────────────────────────────────────
 * A foto do catálogo é da FLOR, e a cor é decisão de cada projeto: a mesma
 * rosa Avalanche aparece branca na foto e é pedida rosê neste evento. Quando
 * isso acontece, `fotoIlustrativa` fica `true` e o papel precisa dizer, com
 * letra, que a imagem é só para reconhecer a flor. Sem esse aviso o florista
 * compra pela foto.
 */
export type FlorDaLegenda = {
  chave: string;
  /** Pelo ID — nunca pelo nome: dois materiais podem se chamar "Rosa". */
  materialId: string | null;
  nome: string;
  variedade: string | null;
  cor: string | null;
  origem: string | null;
  total: number;
  unidade: string;
  fotoUrl: string | null;
  /** A foto existe e a cor pedida pode não ser a dela. */
  fotoIlustrativa: boolean;
};

/**
 * `dadosDoMaterial` recebe o `materialId` da linha (ou `null`, linha sem
 * vínculo) e devolve a foto e a variedade DO CATÁLOGO. Quem chama confere o
 * dono; aqui só se junta.
 */
export function legendaDasFlores(
  resumo: readonly LinhaDoResumo[],
  dadosDoMaterial: (materialId: string | null) => { fotoUrl: string | null; variedade: string | null },
): FlorDaLegenda[] {
  return resumo.map((linha) => {
    const extra = dadosDoMaterial(linha.materialId);
    return {
      chave: linha.chave,
      materialId: linha.materialId,
      nome: linha.nome,
      // A variedade gravada na linha é o snapshot; a do catálogo só completa.
      variedade: linha.variedade ?? extra.variedade,
      cor: linha.cor,
      origem: linha.origem,
      total: linha.total,
      unidade: linha.unidade,
      fotoUrl: extra.fotoUrl,
      // Sem foto não há o que ressalvar; com foto e com cor pedida, a ressalva
      // é obrigatória, porque ninguém garante que a foto é daquela cor.
      fotoIlustrativa: Boolean(extra.fotoUrl) && Boolean(linha.cor),
    };
  });
}

/** O texto curto da legenda: "Rosa · Avalanche · branca · natural · 100 hastes". */
export function textoDaLegenda(flor: FlorDaLegenda): string {
  const partes = [flor.nome];
  if (flor.variedade) partes.push(flor.variedade);
  if (flor.cor) partes.push(flor.cor);
  const origem = rotuloDaOrigem(flor.origem ?? undefined);
  if (origem) partes.push(origem.toLowerCase());
  partes.push(quantidadeTexto(flor.total, flor.unidade));
  return partes.join(" · ");
}
