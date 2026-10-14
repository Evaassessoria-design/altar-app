import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseEventDate } from "../event-date.ts";
import {
  BRIEFING_AREAS,
  fieldVisibleTo,
  itemVisibleTo,
  rotuloDaEscolha,
  type BriefingFields,
} from "../briefing-areas.ts";
import { ROTULO_DA_ORIGEM, ROTULO_DA_SITUACAO, equipeCarrega, type OrigemDoItem } from "@/convex/lib/itemDoBriefing.ts";
import {
  agruparPorAmbiente,
  chaveDoAmbiente,
  ehObrigacaoDeMontagem,
  fotoDoItem,
  fotosPresasAItens,
  type ItemDoProjeto,
} from "../decoration-project.ts";
import { ehOpcional } from "@/convex/lib/escopoDoProjeto.ts";
import { montarProjetoVisual, type FotoDoProjeto } from "../projeto-visual.ts";
import { fotoVaiParaOsNoivos, itemVaiParaOsNoivos, montarApresentacao } from "../apresentacao-do-projeto.ts";
import { conceitoDoEvento } from "../conceito-do-evento.ts";
import { campoDoItemVisivelPara, rotuloDaVersao, type VersaoDoCaderno } from "../audiencia-do-caderno.ts";
import { chaveDoNome, lerAmbientesDoTexto, lerItensDoTexto } from "./itens-do-texto.ts";
import { linhaSemValores, nomeSemValores, paragrafoSemValores } from "./sem-valores.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O CADERNO DE MONTAGEM, MONTADO UMA VEZ SÓ
//
// Duas versões, com CONTEÚDO diferente — não o mesmo documento com o valor
// escondido:
//
//   cliente → o que vamos montar: conceito, ambientes, itens, referências,
//             fichas por ambiente, decisões que faltam e opcionais.
//   equipe  → o que carregar, montar e conferir: itens com quantidade,
//             fichas operacionais, o que NÃO levar, equipe escalada, carga,
//             retorno, peças do acervo e ocorrências.
//
// ── UMA MONTAGEM PARA A PRÉVIA E PARA O PDF ─────────────────────────────────
// A tela de prévia e o gerador de PDF recebem o MESMO `CadernoMontado`. Uma
// regra aplicada só no desenho é uma regra que a prévia não mostra — e a
// prévia é onde ela confere antes de mandar.
//
// ── DINHEIRO ────────────────────────────────────────────────────────────────
// O tipo `CadernoMontado` tem UM campo que pode levar valor:
// `opcionais[].valor`. Ele só é preenchido na versão `cliente` e só com
// `incluirValores: true`. Todo texto livre passa por `sem-valores.ts`, nas
// duas versões. Custo e margem não estão em nenhuma fonte que entra aqui —
// `assemblyItems` não tem custo, e `budgetItems`, `transactions` e as
// propostas não são lidas.
//
// ── NADA SOMADO DUAS VEZES ──────────────────────────────────────────────────
//  · item de montagem e item lido do texto do briefing com o mesmo nome: vale
//    o item de montagem, o do texto sai (qualquer escopo — um "Lounge
//    adicional" opcional não reaparece como incluído pelo texto);
//  · peças do acervo ficam num bloco à parte, como na Folha de Carregamento:
//    "20 arranjos" e "60 vasos" não são a mesma conta;
//  · Compras não entram: são insumo do que já está listado.
//
// ── NADA MARCADO ────────────────────────────────────────────────────────────
// Gerar o caderno é LEITURA. As caixas de Carga/Montado/Retorno saem vazias,
// para a mão de quem confere; nenhuma situação é lida nem gravada aqui.
// ─────────────────────────────────────────────────────────────────────────────

export type { VersaoDoCaderno };

/** O item como o caderno precisa: o do Projeto Visual mais três campos. */
export type ItemDoCaderno = ItemDoProjeto & {
  includeInAssemblyReport: boolean;
  checkOnAssembly: boolean;
  /** Só tem sentido no opcional. Ver `assemblyItems.valorOpcional`. */
  valorOpcional?: number;
  // O item visto do briefing (14/10). Ver `convex/lib/itemDoBriefing.ts`.
  bloco?: string;
  situacao?: string;
  origem?: string;
  corAcabamento?: string;
  medidas?: string;
  posicao?: string;
  responsavelMontagem?: string;
  tipoFlor?: string;
  reaproveitamento?: { ambiente: string; horario?: string; responsavel?: string };
};

export type PecaReservada = {
  nome: string;
  unidade?: string;
  quantidade: number;
  saiu?: number;
  voltou?: number;
  emManutencao?: number;
  emLimpeza?: number;
  indisponivel?: number;
};

export type FontesDoCaderno = {
  evento: {
    name: string;
    type: string;
    date: string;
    location?: string;
    /** Pendências que a leitura do contrato identificou (`events.contractPendings`). */
    contractPendings?: string[];
  };
  briefing?: Partial<BriefingFields> | null;
  itens: readonly ItemDoCaderno[];
  fotos: readonly FotoDoProjeto[];
  /** Planta aprovada; sem ela, o croqui enviado. Ausente = sem layout. */
  planta?: { url: string; origem: "planta" | "croqui" } | null;
  acervo?: readonly PecaReservada[];
  equipe?: readonly { nome: string; funcao?: string; horario?: string }[];
  /** Checklist de montagem do evento (fase "pre") — o que já existe. */
  checklist?: readonly { name: string; quantity?: number; unit?: string; category?: string }[];
  convidados?: string;
  responsavel?: string;
  responsavelTelefone?: string;
};

export type OpcoesDoCaderno = {
  /** Só a versão `cliente` olha. Padrão: sem valores. */
  incluirValores?: boolean;
};

export type LinhaDoCaderno = {
  nome: string;
  /** "220", "8 arranjos". Ausente = sem quantidade (a equipe vê "—"). */
  quantidade?: string;
  detalhe?: string;
  /** O item tem ☐ de conferência marcado no cadastro (`checkOnAssembly`). */
  conferir?: boolean;
};

export type GrupoDoCaderno = {
  titulo: string;
  /** "do briefing" quando a lista veio do texto, não de itens cadastrados. */
  origem?: string;
  linhas: LinhaDoCaderno[];
};

export type ImagemDoCaderno = {
  url: string;
  legenda?: string;
  /** Inspiração, não contratação: o papel diz isso. */
  ehReferencia: boolean;
};

export type FichaDeAmbiente = {
  titulo: string;
  imagens: ImagemDoCaderno[];
  itens: (LinhaDoCaderno & {
    fotoUrl?: string | null;
    ehReferencia?: boolean;
    fornecedor?: string;
    observacao?: string;
    /** Equipe: de onde vem, medidas, posição, quem monta, reaproveitamento. */
    operacional?: string[];
  })[];
  /** Equipe: opcionais deste ambiente — "só montar se confirmado". */
  opcionais: string[];
  /** Equipe: o que não levar para este ambiente. */
  naoLevar: string[];
};

export type AvisoDoCaderno = {
  texto: string;
  /** Onde completar: rota relativa ao evento ("fotos", "planta", "projeto"…). */
  onde?: "fotos" | "planta" | "projeto" | "briefing" | "acervo";
};

export type CadernoMontado = {
  versao: VersaoDoCaderno;
  selo: string;
  titulo: string;
  subtitulo: string;
  resumo: { rotulo: string; valor: string }[];
  /** Equipe: campos de preenchimento — o valor vem do sistema quando existe. */
  preencher: { rotulo: string; valor?: string }[];
  conceito?: { destaque?: string; texto?: string };
  ambientes: string[];
  incluido: GrupoDoCaderno[];
  /** Equipe: o que confirmar antes e o que não levar. */
  atencao: { confirmar: string[]; naoLevarSemConfirmar: string[]; naoIncluso: string[] };
  informacoesDoLocal: { rotulo: string; valor: string }[];
  /** Equipe: prazos e responsáveis registrados no briefing. */
  prazosEResponsaveis: { rotulo: string; valor: string }[];
  /** Quem instala e quem conecta — as duas versões, cada uma com o que pode ver. */
  conexaoEletrica: { rotulo: string; valor: string }[];
  /**
   * Equipe: o que NÃO vai no caminhão — vem do espaço, da cliente ou da
   * locadora. Aparece para ser conferido na montagem, não carregado.
   */
  chegaNoLocal: LinhaDoCaderno[];
  layout?: { url: string; legenda: string };
  referencias: ImagemDoCaderno[];
  fichas: FichaDeAmbiente[];
  pendencias: string[];
  opcionais: { nome: string; ambiente?: string; valor?: string }[];
  equipeEscalada: { nome: string; funcao?: string; horario?: string }[];
  carga: GrupoDoCaderno[];
  pecasDoAcervo: { nome: string; reservado: string; saiu?: number; voltou?: number }[];
  checklist: LinhaDoCaderno[];
  ocorrencias: string[];
  /**
   * Equipe: itens que ficaram fora da montagem por serem só REFERÊNCIA
   * VISUAL. O papel diz quantos, para a equipe não achar que o dado sumiu.
   */
  foraDaMontagem: number;
  /** Trechos de texto livre que ficaram fora por falar de dinheiro. */
  trechosOmitidos: number;
  avisos: AvisoDoCaderno[];
};

const TIPO_CASAMENTO = "wedding";

/**
 * O selo do documento. Casamento fala com os noivos; o resto, com o cliente.
 * É o MESMO texto do menu (`rotuloDaVersao`) — o que ela escolheu é o que sai.
 */
export function seloDaVersao(versao: VersaoDoCaderno, tipoDoEvento: string): string {
  return rotuloDaVersao(versao, tipoDoEvento);
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: v % 1 ? 2 : 0 });

/** Quantidade legível, ou nada. `0` é ausência mal gravada, não quantidade. */
function quantidadeDe(q: number | undefined, unidade?: string): string | undefined {
  if (!q || q <= 0) return undefined;
  return unidade?.trim() ? `${q} ${unidade.trim()}` : String(q);
}

function dataComDiaDaSemana(valor: string): string | undefined {
  const d = parseEventDate(valor);
  if (!d) return undefined;
  const dia = format(d, "EEEE", { locale: ptBR });
  return `${format(d, "dd/MM/yyyy")} · ${dia.charAt(0).toUpperCase()}${dia.slice(1)}`;
}

function dataSimples(valor: string): string | undefined {
  const d = parseEventDate(valor);
  return d ? format(d, "dd/MM/yyyy") : undefined;
}

/** Junta listas de nomes sem repetir (comparação sem acento e sem caixa). */
function semRepetir(nomes: readonly string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const n of nomes) {
    const t = n.trim();
    const c = chaveDoAmbiente(t);
    if (!t || vistos.has(c)) continue;
    vistos.add(c);
    saida.push(t);
  }
  return saida;
}

export function montarCaderno(
  fontes: FontesDoCaderno,
  versao: VersaoDoCaderno,
  opcoes: OpcoesDoCaderno = {},
): CadernoMontado {
  const ehCliente = versao === "cliente";
  const audiencia = versao;
  const { evento, briefing } = fontes;
  let omitidos = 0;
  const conta = <T extends { omitidos: number }>(r: T): T => {
    omitidos += r.omitidos;
    return r;
  };
  const avisos: AvisoDoCaderno[] = [];

  // ── Itens: quem a versão pode ver ────────────────────────────────────────
  // `includeInAssemblyReport` e a visibilidade valem para as duas versões; a
  // regra da cliente é a MESMA do Projeto Visual (`itemVaiParaOsNoivos`).
  const doDocumento = fontes.itens.filter(
    (i) => i.includeInAssemblyReport && itemVisibleTo(i.visibility, audiencia),
  );
  const montar = doDocumento.filter(ehObrigacaoDeMontagem);
  const paraIncluido = ehCliente ? montar.filter(itemVaiParaOsNoivos) : montar;
  const opcionaisItens = doDocumento.filter(ehOpcional);
  const naoInclusos = doDocumento.filter((i) => i.projectScope === "nao_incluso");
  // Pedido que a cliente ainda não decidiu: fora da montagem, mas DITO.
  const emAvaliacao = doDocumento.filter(
    (i) => i.situacao === "em_avaliacao" && i.projectScope !== "opcional" && i.projectScope !== "nao_incluso",
  );

  // Nomes de TODOS os itens cadastrados, qualquer escopo e visibilidade: o
  // texto do briefing não reapresenta como incluído o que já tem cadastro.
  const nomesCadastrados = new Set(fontes.itens.map((i) => chaveDoNome(i.name)));

  const linhaDoItem = (i: ItemDoCaderno): LinhaDoCaderno => {
    const nome = conta(nomeSemValores(i.name)).texto!;
    const modelo = i.model?.trim();
    const partes = [
      modelo && chaveDoNome(modelo) !== chaveDoNome(i.name) ? modelo : undefined,
      i.corAcabamento?.trim(),
      i.tipoFlor === "permanente" ? "permanente" : i.tipoFlor === "natural" ? "natural" : undefined,
    ].filter((x): x is string => !!x);
    const detalhe = partes.length > 0 ? conta(linhaSemValores(partes.join(" · "))).texto : undefined;
    return {
      nome,
      quantidade: quantidadeDe(i.quantity, i.unit),
      detalhe,
      conferir: !ehCliente && i.checkOnAssembly ? true : undefined,
    };
  };

  // O cliente lê o nome do espaço; a categoria do briefing ("Festa") é
  // vocabulário de cadastro e só acrescenta para quem monta.
  const gruposDeItens: GrupoDoCaderno[] = agruparPorAmbiente(paraIncluido).map((g) => ({
    titulo: !ehCliente && g.categoria ? `${g.label} · ${g.categoria}` : g.label,
    linhas: g.itens.map(linhaDoItem),
  }));

  // ── Itens que só existem como texto no briefing ──────────────────────────
  const doTexto = lerItensDoTexto(briefing?.furnitureNotes);
  if (doTexto.repetidos.length > 0) {
    avisos.push({
      texto: `${doTexto.repetidos.length} item(ns) aparecem repetidos no texto do briefing e foram contados uma vez só.`,
      onde: "briefing",
    });
  }
  const textoNovo = doTexto.itens.filter((i) => !nomesCadastrados.has(chaveDoNome(i.nome)));
  const porCategoria = new Map<string, LinhaDoCaderno[]>();
  for (const i of textoNovo) {
    const cat = i.categoria ?? "Itens";
    const lista = porCategoria.get(cat) ?? [];
    lista.push({ nome: conta(nomeSemValores(i.nome)).texto!, quantidade: quantidadeDe(i.quantidade) });
    porCategoria.set(cat, lista);
  }
  const gruposDoTexto: GrupoDoCaderno[] = [...porCategoria].map(([titulo, linhas]) => ({
    titulo,
    origem: "do briefing",
    linhas,
  }));
  if (gruposDoTexto.length > 0 && montar.length === 0) {
    avisos.push({
      texto:
        "Os itens vêm do texto do briefing. Para fotos, ambiente e conferência por item, use \"Criar itens do briefing\".",
      onde: "briefing",
    });
  }
  // Texto que não é lista: vai como bloco, sem perder nada — mas sem dinheiro.
  const textoLivreDosItens = doTexto.textoLivre ? conta(paragrafoSemValores(doTexto.textoLivre)).texto : undefined;
  if (textoLivreDosItens) {
    gruposDoTexto.push({ titulo: "Anotações do briefing", origem: "do briefing", linhas: [{ nome: textoLivreDosItens }] });
  }

  const incluido = [...gruposDeItens, ...gruposDoTexto].filter((g) => g.linhas.length > 0);

  // ── Ambientes ────────────────────────────────────────────────────────────
  const ambientesDoTexto = lerAmbientesDoTexto(briefing?.atmosphereDescription);
  const ambientes = semRepetir([
    ...(ambientesDoTexto ?? []),
    ...agruparPorAmbiente(paraIncluido).map((g) => g.label),
  ]);

  // ── Conceito ─────────────────────────────────────────────────────────────
  // A atmosfera que é LISTA de ambientes já virou os chips; não repete aqui.
  const conceito = conceitoDoEvento({
    decorStyle: briefing?.decorStyle,
    colorPalette: briefing?.colorPalette,
    atmosphereDescription: ambientesDoTexto ? undefined : briefing?.atmosphereDescription,
  });
  const destaque = conceito?.estilo ? conta(paragrafoSemValores(conceito.estilo)).texto : undefined;
  const textoDoConceito = [conceito?.paleta, conceito?.atmosfera]
    .map((t) => (t ? conta(paragrafoSemValores(t)).texto : undefined))
    .filter((t): t is string => !!t)
    .join(" · ");

  // ── Pendências ───────────────────────────────────────────────────────────
  const pendencias = semRepetir(
    (evento.contractPendings ?? [])
      .map((p) => conta(linhaSemValores(p)).texto)
      .filter((p): p is string => !!p),
  );

  // ── Opcionais ────────────────────────────────────────────────────────────
  const incluirValores = ehCliente && opcoes.incluirValores === true;
  const opcionais = opcionaisItens
    .filter((i) => (ehCliente ? itemVisibleTo(i.visibility, "cliente") : true))
    .map((i) => {
      const nome = conta(nomeSemValores(i.name)).texto!;
      const ambiente = i.ambiente?.trim() || undefined;
      // O ÚNICO dinheiro que um caderno pode levar. Equipe: nunca.
      let valor: string | undefined;
      if (incluirValores && typeof i.valorOpcional === "number" && Number.isFinite(i.valorOpcional)) {
        valor = i.valorOpcional === 0 ? "Cortesia" : brl(i.valorOpcional);
      }
      return { nome, ambiente, valor };
    });
  if (ehCliente && opcionais.length > 0) {
    pendencias.push(
      opcionais.length === 1
        ? `Decidir se vão contratar o opcional (${opcionais[0].nome})`
        : `Decidir se vão contratar os opcionais (${opcionais.map((o) => o.nome).join(", ")})`,
    );
  }
  if (ehCliente && emAvaliacao.length > 0) {
    const nomes = emAvaliacao.filter((i) => itemVisibleTo(i.visibility, "cliente")).map((i) => conta(nomeSemValores(i.name)).texto!);
    if (nomes.length > 0) pendencias.push(`Decidir sobre os itens em avaliação (${nomes.join(", ")})`);
  }
  if (/\bopcion/i.test(briefing?.generalNotes ?? "") && opcionaisItens.length === 0) {
    avisos.push({
      texto:
        "As notas do briefing citam opcionais, mas nenhum item está marcado como \"Opcional\" no Projeto Visual. Texto livre não vira opcional sozinho.",
      onde: "projeto",
    });
  }

  // O que a equipe precisa saber do item além do nome: de onde ele vem, onde
  // fica, quem monta — e, se a peça muda de ambiente, para onde e quando.
  // A quantidade NÃO se repete aqui: a peça reaproveitada é a mesma.
  const operacionalDoItem = (i: ItemDoCaderno): string[] | undefined => {
    const r = i.reaproveitamento;
    const linhas = [
      i.origem && i.origem !== "a_definir" && !equipeCarrega(i)
        ? `Vem ${({ espaco: "do espaço", cliente: "da cliente", locadora: "da locadora" } as Record<string, string>)[i.origem]} — não carregar`
        : undefined,
      i.medidas?.trim() && `Medidas: ${i.medidas.trim()}`,
      i.posicao?.trim() && `Posição: ${i.posicao.trim()}`,
      i.responsavelMontagem?.trim() && `Monta: ${i.responsavelMontagem.trim()}`,
      r?.ambiente?.trim() &&
        `Depois vai para ${r.ambiente.trim()}${r.horario?.trim() ? ` (${r.horario.trim()})` : ""}${
          r.responsavel?.trim() ? ` — transfere: ${r.responsavel.trim()}` : ""
        }. Mesma peça, não levar a mais.`,
    ]
      .filter((x): x is string => !!x)
      .map((t) => conta(linhaSemValores(t)).texto)
      .filter((x): x is string => !!x);
    return linhas.length > 0 ? linhas : undefined;
  };

  // ── Fotos, fichas e referências ──────────────────────────────────────────
  // Cliente: a regra do Projeto Visual, inteira (`montarApresentacao`).
  // Equipe: as fotos de planejamento ("antes") que não são internas nem estão
  // fora do escopo — a equipe monta o que está nelas.
  let fichas: FichaDeAmbiente[];
  let referencias: ImagemDoCaderno[];
  if (ehCliente) {
    const projeto = montarProjetoVisual(
      agruparPorAmbiente(paraIncluido),
      fontes.fotos.filter(fotoVaiParaOsNoivos),
      fotosPresasAItens(paraIncluido),
    );
    const apresentacao = montarApresentacao(projeto, fotoDoItem);
    const legenda = (l?: string) => (l ? conta(linhaSemValores(l)).texto : undefined);
    fichas = apresentacao.ambientes.map((a) => ({
      titulo: a.titulo,
      imagens: a.imagens.map((im) => ({ ...im, legenda: legenda(im.legenda) })),
      // Sem quantidade: ela já está na lista de itens. A mesma quantidade em
      // dois lugares do papel lê como dois pedidos.
      itens: a.itens.map((it) => ({
        nome: conta(nomeSemValores(it.nome)).texto!,
        detalhe: it.detalhe ? conta(linhaSemValores(it.detalhe)).texto : undefined,
        fotoUrl: it.fotoUrl,
        ehReferencia: it.ehReferencia,
      })),
      opcionais: [],
      naoLevar: [],
    }));
    referencias = apresentacao.inspiracoes.map((im) => ({ ...im, legenda: legenda(im.legenda) }));
  } else {
    const fotosDaEquipe = fontes.fotos.filter(
      (f) => f.visibility !== "interno" && f.projectScope !== "nao_incluso" && f.category === "antes",
    );
    const projeto = montarProjetoVisual(agruparPorAmbiente(montar), fotosDaEquipe, fotosPresasAItens(montar));
    const imagem = (f: FotoDoProjeto): ImagemDoCaderno | null => {
      const url = f.previewUrl || f.url;
      if (!url) return null;
      return {
        url,
        legenda: f.caption ? conta(linhaSemValores(f.caption)).texto : undefined,
        ehReferencia: f.projectScope === "referencia",
      };
    };
    const imagensDe = (a: { referencias: FotoDoProjeto[]; contratadas: FotoDoProjeto[]; semClassificacao: FotoDoProjeto[] }) =>
      [...a.contratadas, ...a.semClassificacao, ...a.referencias]
        .map(imagem)
        .filter((x): x is ImagemDoCaderno => !!x);
    const porAmbiente = (lista: readonly ItemDoCaderno[], chave: string) =>
      lista.filter((i) => chaveDoAmbiente(i.ambiente) === chave).map((i) => conta(nomeSemValores(i.name)).texto!);
    fichas = projeto.ambientes.map((a) => ({
      titulo: a.label,
      imagens: imagensDe(a),
      itens: (a.itens as ItemDoCaderno[]).map((i) => {
        const foto = fotoDoItem(i);
        // Sem quantidade: ela está na tabela de carga, que é onde se confere.
        const { quantidade: _q, ...linha } = linhaDoItem(i);
        return {
          ...linha,
          fotoUrl: foto.url,
          ehReferencia: foto.ehReferencia,
          // A mesma regra campo a campo do caderno antigo
          // (`audiencia-do-caderno.ts`): fornecedor e observação são da equipe.
          fornecedor: campoDoItemVisivelPara("supplierName", audiencia)
            ? i.supplierName?.trim() || undefined
            : undefined,
          observacao:
            campoDoItemVisivelPara("notes", audiencia) && i.notes
              ? conta(paragrafoSemValores(i.notes)).texto
              : undefined,
          operacional: operacionalDoItem(i),
        };
      }),
      opcionais: porAmbiente(opcionaisItens, a.key),
      naoLevar: porAmbiente(naoInclusos, a.key),
    }));
    referencias = imagensDe(projeto.semAmbiente);
  }

  // A foto que já ilustra um item não se repete na grade do mesmo ambiente.
  // O ponteiro da Galeria já evita isso (`fotosPresasAItens`); a URL cobre o
  // arquivo próprio do item que é o mesmo da grade.
  fichas = fichas.map((f) => {
    const dosItens = new Set(f.itens.map((i) => i.fotoUrl).filter(Boolean));
    return { ...f, imagens: f.imagens.filter((im) => !dosItens.has(im.url)) };
  });

  // Ficha que só repetiria nomes já listados não vira página: ela existe
  // para a foto, a instrução e o que não levar.
  fichas = fichas.filter(
    (f) =>
      f.imagens.length > 0 ||
      f.opcionais.length > 0 ||
      f.naoLevar.length > 0 ||
      f.itens.some((i) => i.fotoUrl || i.observacao || i.fornecedor || (i.operacional?.length ?? 0) > 0),
  );

  // ── Layout ───────────────────────────────────────────────────────────────
  const layout = fontes.planta?.url
    ? {
        url: fontes.planta.url,
        legenda: fontes.planta.origem === "planta" ? "Planta do espaço" : "Croqui do espaço",
      }
    : undefined;
  if (!layout) avisos.push({ texto: "Sem planta ou croqui do espaço.", onde: "planta" });
  const totalDeImagens = referencias.length + fichas.reduce((s, f) => s + f.imagens.length, 0);
  if (totalDeImagens === 0) {
    avisos.push({
      texto: ehCliente
        ? "Nenhuma foto liberada para o cliente. Na Galeria, escolha o ambiente e marque como Incluso ou Referência."
        : "Nenhuma foto de referência para a equipe. Na Galeria, envie as fotos da fase \"Antes\" e escolha o ambiente.",
      onde: "fotos",
    });
  }

  // ── Equipe: atenção, local, escala, carga, acervo, checklist, ocorrências ─
  const atencao = ehCliente
    ? { confirmar: [], naoLevarSemConfirmar: [], naoIncluso: [] }
    : {
        confirmar: pendencias,
        naoLevarSemConfirmar: [
          ...opcionais.map((o) => o.nome),
          ...emAvaliacao.map((i) => `${conta(nomeSemValores(i.name)).texto!} (${ROTULO_DA_SITUACAO.em_avaliacao.toLowerCase()})`),
        ],
        naoIncluso: semRepetir(naoInclusos.map((i) => conta(nomeSemValores(i.name)).texto!)),
      };

  const campoDoLocal = (rotulo: string, valor?: string) => {
    const t = valor ? conta(paragrafoSemValores(valor)).texto : undefined;
    return t ? { rotulo, valor: t } : null;
  };
  const informacoesDoLocal = ehCliente
    ? []
    : [
        campoDoLocal("Desmontagem", briefing?.teardownTime),
        campoDoLocal("Estacionamento", briefing?.parkingInfo),
        campoDoLocal("Regras do espaço", briefing?.venueRules),
        campoDoLocal("Restrições", briefing?.restrictions),
        campoDoLocal("Acessibilidade", briefing?.accessibilityNeeds),
        campoDoLocal("Contato de emergência", briefing?.emergencyContact),
      ].filter((c): c is { rotulo: string; valor: string } => !!c);

  const responsavel = fontes.responsavel?.trim()
    ? [fontes.responsavel.trim(), fontes.responsavelTelefone?.trim()].filter(Boolean).join(" · ")
    : undefined;
  const preencher = ehCliente
    ? []
    : [
        { rotulo: "Chegada da equipe", valor: briefing?.setupTime?.trim() || undefined },
        { rotulo: "Responsável pela montagem", valor: responsavel },
        {
          rotulo: "Contato no local",
          valor: briefing?.venueContact ? conta(linhaSemValores(briefing.venueContact)).texto : undefined,
        },
      ];

  // ── O caminhão leva só o que sai do galpão ───────────────────────────────
  // A mesma regra da Folha de Carregamento (`equipeCarrega`): peça do espaço,
  // da cliente ou da locadora é conferida na montagem, não carregada.
  const carregados = montar.filter(equipeCarrega);
  const naoCarregados = montar.filter((i) => !equipeCarrega(i));
  const carga = ehCliente
    ? []
    : [
        ...agruparPorAmbiente(carregados).map((g) => ({
          titulo: g.categoria ? `${g.label} · ${g.categoria}` : g.label,
          linhas: g.itens.map(linhaDoItem),
        })),
        ...gruposDoTexto,
      ].filter((g) => g.linhas.length > 0);
  const chegaNoLocal: LinhaDoCaderno[] = ehCliente
    ? []
    : naoCarregados.map((i) => ({
        ...linhaDoItem(i),
        detalhe: [ROTULO_DA_ORIGEM[i.origem as OrigemDoItem], i.ambiente?.trim()].filter(Boolean).join(" · "),
      }));

  // ── Prazos e responsáveis (equipe) e conexão elétrica (as duas) ──────────
  const doBriefing = (rotulo: string, chave: keyof BriefingFields) => {
    const bruto = briefing?.[chave];
    return typeof bruto === "string" && bruto.trim() ? campoDoLocal(rotulo, bruto) : null;
  };
  const prazosEResponsaveis = ehCliente
    ? []
    : [
        doBriefing("Cerimônia pronta até", "ceremonySetupDeadline"),
        briefing?.kidsCorner === "sim" ? doBriefing("Cantinho das crianças — local", "kidsCornerLocation") : null,
        briefing?.kidsCorner === "sim" ? doBriefing("Cantinho das crianças — monta", "kidsCornerResponsible") : null,
        doBriefing("Entrega do bolo e dos doces", "cakeDeliveryResponsible"),
        doBriefing("Disposição dos doces", "sweetsLayoutResponsible"),
        doBriefing("Finalização da mesa do bolo", "cakeFinishResponsible"),
      ].filter((c): c is { rotulo: string; valor: string } => !!c);

  const grupoDaConexao = BRIEFING_AREAS.find((a) => a.key === "lighting")?.groups.find((g) => g.key === "conexao");
  const conexaoEletrica = (grupoDaConexao?.fields ?? [])
    .filter((f) => fieldVisibleTo(f, audiencia))
    .map((f) => {
      const bruto = briefing?.[f.key];
      if (typeof bruto !== "string" || !bruto.trim()) return null;
      const valor = f.type === "escolha" ? rotuloDaEscolha(f, bruto.trim()) : bruto;
      return campoDoLocal(f.label, valor);
    })
    .filter((c): c is { rotulo: string; valor: string } => !!c);

  const pecasDoAcervo = ehCliente
    ? []
    : (fontes.acervo ?? [])
        .filter((p) => p.nome?.trim())
        .map((p) => ({
          nome: p.nome.trim(),
          reservado: quantidadeDe(p.quantidade, p.unidade) ?? String(p.quantidade),
          saiu: p.saiu,
          voltou: p.voltou,
        }));

  const ocorrencias: string[] = [];
  if (!ehCliente) {
    for (const p of fontes.acervo ?? []) {
      const nome = p.nome?.trim();
      if (!nome) continue;
      const falta = Math.max(0, (p.saiu ?? 0) - (p.voltou ?? 0));
      if (falta > 0) ocorrencias.push(`${nome}: ${falta} saíram e ainda não voltaram`);
      if ((p.emManutencao ?? 0) > 0) ocorrencias.push(`${nome}: ${p.emManutencao} em reparo no acervo`);
      if ((p.emLimpeza ?? 0) > 0) ocorrencias.push(`${nome}: ${p.emLimpeza} aguardando limpeza`);
      if ((p.indisponivel ?? 0) > 0) ocorrencias.push(`${nome}: ${p.indisponivel} indisponíveis`);
    }
  }

  const checklist: LinhaDoCaderno[] = ehCliente
    ? []
    : (fontes.checklist ?? [])
        .filter((c) => c.name?.trim())
        .map((c) => ({
          nome: conta(nomeSemValores(c.name)).texto!,
          quantidade: quantidadeDe(c.quantity, c.unit),
          detalhe: c.category?.trim() || undefined,
        }));

  const equipeEscalada = ehCliente
    ? []
    : (fontes.equipe ?? [])
        .filter((m) => m.nome?.trim())
        .map((m) => ({ nome: m.nome.trim(), funcao: m.funcao?.trim() || undefined, horario: m.horario?.trim() || undefined }));

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  const resumo: { rotulo: string; valor: string }[] = [];
  const data = ehCliente ? dataSimples(evento.date) : dataComDiaDaSemana(evento.date);
  if (data) resumo.push({ rotulo: "Data", valor: data });
  if (evento.location?.trim()) resumo.push({ rotulo: "Local", valor: evento.location.trim() });
  if (fontes.convidados?.trim()) resumo.push({ rotulo: "Convidados", valor: fontes.convidados.trim() });
  if (ambientes.length > 0) {
    resumo.push({ rotulo: ehCliente ? "Ambientes decorados" : "Ambientes", valor: String(ambientes.length) });
  }

  const casamento = evento.type === TIPO_CASAMENTO;
  const subtitulo = ehCliente
    ? casamento
      ? "Seu caderno de montagem: tudo o que vamos montar para o grande dia."
      : "Seu caderno de montagem: tudo o que vamos montar para o seu evento."
    : "Caderno de montagem da equipe: carregar, montar e conferir o retorno.";

  if (incluido.length === 0) {
    avisos.push({ texto: "Nenhum item de montagem cadastrado para esta versão.", onde: "projeto" });
  }
  if (omitidos > 0) {
    avisos.push({
      texto: `${omitidos} trecho(s) de texto livre ficaram fora por citar valores ou pagamentos.`,
    });
  }

  return {
    versao,
    selo: seloDaVersao(versao, evento.type),
    titulo: evento.name.trim(),
    subtitulo,
    resumo,
    preencher,
    conceito: destaque || textoDoConceito ? { destaque, texto: textoDoConceito || undefined } : undefined,
    ambientes,
    incluido,
    atencao,
    informacoesDoLocal,
    prazosEResponsaveis,
    conexaoEletrica,
    chegaNoLocal,
    layout,
    referencias,
    fichas,
    pendencias,
    opcionais,
    equipeEscalada,
    carga,
    pecasDoAcervo,
    checklist,
    ocorrencias,
    foraDaMontagem: ehCliente ? 0 : doDocumento.filter((i) => i.projectScope === "referencia").length,
    trechosOmitidos: omitidos,
    avisos,
  };
}
