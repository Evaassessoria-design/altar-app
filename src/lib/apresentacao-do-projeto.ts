import type { AmbienteVisual, FotoDoProjeto, ProjetoVisual } from "./projeto-visual.ts";
import { itemVisibleTo } from "./briefing-areas.ts";
import type { ItemDoProjeto } from "./decoration-project.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE PODE APARECER NO DOCUMENTO DOS NOIVOS
//
// ── POR QUE ESTA REGRA MORA FORA DO GERADOR ─────────────────────────────────
// Porque ela é a única coisa entre o operacional da decoradora e a cliente. Um
// `if` esquecido dentro de um laço de desenho não aparece em revisão de código
// e não aparece em teste de PDF — aparece na mão da cliente, uma vez, e não
// tem como voltar atrás.
//
// Aqui ela é uma função pura, com nome, e com teste que diz o que não pode
// passar. É a mesma escolha de `lib/propostaComercial.ts`, onde a fronteira
// vive na TRANSFORMAÇÃO e não na tela.
//
// ── O QUE FICA DE FORA, E POR QUÊ ───────────────────────────────────────────
//
//  · `nao_incluso` — item e foto. Foi mostrado e ficou de fora. Pôr isso num
//    documento de apresentação é reabrir uma negociação encerrada;
//
//  · `visibility: "interno"` — o item que ela marcou como interno é interno.
//    `itemVisibleTo` já responde isso e é a mesma função que o Caderno usa;
//
//  · fotos de EXECUÇÃO (montagem, evento, desmontagem) — este documento
//    responde "o que vamos fazer". A foto do evento que já aconteceu responde
//    outra pergunta, e misturar as duas faz a apresentação parecer um álbum;
//
//  · tudo que é dinheiro, fornecedor, observação operacional e situação de
//    montagem. Isso não é filtrado aqui: simplesmente NÃO ESTÁ no tipo que o
//    gerador recebe (`ItemParaOsNoivos` abaixo). É a mesma proteção do PDF da
//    Proposta, que não recebe o registro do banco e por isso não tem por onde
//    vazar custo.
//
// ── O QUE FICA, MESMO SEM CLASSIFICAÇÃO ─────────────────────────────────────
// Item e foto sem `projectScope` ENTRAM. É o estado da maioria, e escondê-los
// produziria um documento vazio para quase todo evento — o que empurraria a
// decoradora de volta para o PowerPoint. Eles entram sem selo: a tela nunca
// afirma "contratado" por omissão, e o papel também não.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um item como a CLIENTE o vê.
 *
 * Note o que não existe neste tipo: `notes`, `supplierName`, `supplierId`,
 * `operationalStatus`, `includeInAssemblyReport`, `checkOnAssembly`,
 * `visibility`, `receita`. Não há caminho por onde eles cheguem ao papel,
 * porque não estão no objeto.
 */
export type ItemParaOsNoivos = {
  nome: string;
  /** "120 un" já formatado, ou `undefined` quando não há quantidade. */
  quantidade?: string;
  /** Descrição curta — o `model` do item, quando ele acrescenta ao nome. */
  detalhe?: string;
  /** Miniatura já resolvida. `null` = o bloco desenha só o nome. */
  fotoUrl: string | null;
  /** É inspiração, não contratação. O papel precisa dizer isso. */
  ehReferencia: boolean;
};

export type AmbienteParaOsNoivos = {
  titulo: string;
  emoji?: string;
  itens: ItemParaOsNoivos[];
  /** Imagens do ambiente que não estão presas a um item. */
  imagens: { url: string; legenda?: string; ehReferencia: boolean }[];
};

export type ApresentacaoDoProjeto = {
  ambientes: AmbienteParaOsNoivos[];
  /** Imagens que ela ainda não situou. Entram como inspiração geral. */
  inspiracoes: { url: string; legenda?: string; ehReferencia: boolean }[];
};

/** Quantidade legível, ou nada. `0` não é quantidade: é ausência mal gravada. */
function quantidadeTexto(item: ItemDoProjeto): string | undefined {
  if (!item.quantity || item.quantity <= 0) return undefined;
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

/** O `model` só entra quando acrescenta — repetir o nome é ruído no papel. */
function detalheDe(item: ItemDoProjeto): string | undefined {
  const m = item.model?.trim();
  if (!m) return undefined;
  return m.trim().toLowerCase() === item.name.trim().toLowerCase() ? undefined : m;
}

/** O item pode ser mostrado à cliente? */
export function itemVaiParaOsNoivos(item: ItemDoProjeto): boolean {
  if (item.projectScope === "nao_incluso") return false;
  // `itemVisibleTo` é a MESMA função que decide a audiência do Caderno. Uma
  // segunda regra aqui divergiria, e a que divergisse seria a do documento
  // que sai da empresa.
  return itemVisibleTo(item.visibility, "cliente");
}

/** A foto pode ser mostrada à cliente? */
export function fotoVaiParaOsNoivos(foto: FotoDoProjeto): boolean {
  // ── A PORTA EXPLÍCITA, ANTES DE QUALQUER PROXY ──────────────────────────
  // `eventPhotos.visibility` é o único campo que responde "para quem isto
  // pode aparecer". Os dois testes abaixo respondem outras perguntas — o que
  // a imagem é no projeto, e quando ela foi tirada — e vinham sendo usados
  // como substitutos.
  //
  // O substituto falhava no caso que mais importa: a foto do problema (o
  // fornecedor mandou a cor errada, a peça chegou torta) é tirada ANTES do
  // evento, não tem classificação nenhuma, e saía impressa para a noiva.
  if (foto.visibility === "interno") return false;
  if (foto.projectScope === "nao_incluso") return false;
  // Execução responde "o que aconteceu"; este documento responde "o que vamos
  // fazer". As duas juntas fazem a apresentação parecer um álbum.
  return foto.category === "antes";
}

function imagensDe(ambiente: AmbienteVisual<unknown>) {
  // `referencias` e `contratadas` são as duas que sobrevivem ao filtro; as sem
  // classificação entram como as demais, sem selo.
  return [
    ...ambiente.referencias.map((f) => ({ f, ehReferencia: true })),
    ...ambiente.contratadas.map((f) => ({ f, ehReferencia: false })),
    ...ambiente.semClassificacao.map((f) => ({ f, ehReferencia: false })),
  ]
    .filter(({ f }) => fotoVaiParaOsNoivos(f))
    .map(({ f, ehReferencia }) => ({
      // `url` do original: o PDF imprime, e miniatura de 1400 px num A4 já é
      // mais que suficiente — mas quem escolhe é quem chama, passando a foto
      // já resolvida. Aqui só repassamos o que veio.
      url: f.previewUrl || f.url || "",
      // ── A LEGENDA SÓ SAI DO QUE ELA CUROU ──────────────────────────────
      // `caption` é texto livre que a decoradora escreve PARA SI MESMA na
      // Galeria: "refazer, ficou torto", "conferir com a Flora". Toda
      // legenda vinha impressa sob a imagem, no documento que leva o nome e
      // o contato da empresa no rodapé.
      //
      // `incluso` é a única classificação que exige um gesto deliberado
      // dizendo "isto está no projeto contratado". Só nessas a legenda
      // acompanha. Foto de inspiração e foto ainda não classificada vão sem
      // texto — a imagem já diz o que precisa dizer, e o silêncio aqui não
      // custa nada a ninguém.
      legenda:
        f.projectScope === "incluso" ? f.caption?.trim() || undefined : undefined,
      ehReferencia,
    }))
    .filter((i) => i.url);
}

/**
 * Monta a apresentação a partir do MESMO Projeto Visual que a tela desenha.
 *
 * Não há segunda fonte, não há tabela nova e não há editor paralelo: o
 * documento é uma LEITURA do projeto, do mesmo jeito que o projeto é uma
 * leitura dos itens. Se a decoradora mudar a quantidade de 120 para 130 na
 * lista de itens, o papel seguinte sai com 130 — sem ninguém sincronizar nada.
 */
/**
 * Todas as fotos do projeto, indexadas pela linha da Galeria.
 *
 * Existe por causa do caminho que escapava: a foto de um ITEM não vem das
 * prateleiras, vem de um ponteiro (`referencePhotoId` / `contractedPhotoId`)
 * já resolvido em URL pela tela. Com a URL sozinha não dá para perguntar se
 * aquela linha pode ser mostrada — e o item passava a imagem adiante sem que
 * ninguém perguntasse.
 *
 * O índice devolve a linha inteira, e aí a MESMA `fotoVaiParaOsNoivos` decide.
 * Uma segunda regra para a foto do item divergiria da regra da prateleira, e a
 * que divergisse seria a do documento impresso.
 */
function fotosPorId(projeto: ProjetoVisual<ItemDoProjeto>): Map<string, FotoDoProjeto> {
  const indice = new Map<string, FotoDoProjeto>();
  const guardar = (fotos: readonly FotoDoProjeto[]) => {
    for (const f of fotos) indice.set(f._id, f);
  };
  for (const a of [...projeto.ambientes, projeto.semAmbiente]) {
    guardar(a.referencias);
    guardar(a.contratadas);
    guardar(a.execucao);
    guardar(a.foraDoEscopo);
    guardar(a.semClassificacao);
  }
  return indice;
}

export function montarApresentacao(
  projeto: ProjetoVisual<ItemDoProjeto>,
  /** Como desenhar a foto de um item — a precedência já resolvida pela tela. */
  fotoDoItem: (item: ItemDoProjeto) => {
    url: string | null;
    ehReferencia: boolean;
    /** A linha da Galeria, quando a foto veio de lá. */
    photoId?: string;
  },
): ApresentacaoDoProjeto {
  const ambientes: AmbienteParaOsNoivos[] = [];
  const porId = fotosPorId(projeto);

  /**
   * A foto do item, depois de passar pela mesma fronteira das prateleiras.
   *
   * ── O CAMINHO QUE ESCAPAVA ────────────────────────────────────────────────
   * Desde que o item aponta para a Galeria em vez de guardar cópia própria, um
   * item visível podia exibir uma foto `nao_incluso`, uma foto de execução ou
   * uma foto marcada como interna: o `itemVaiParaOsNoivos` aprovava o ITEM, e
   * a imagem entrava de carona sem ninguém perguntar nada sobre ela.
   *
   * Arquivo PRÓPRIO do item continua passando: ele não tem eixo de audiência
   * nenhum, nunca esteve na Galeria, e o item já foi aprovado. Negá-lo tiraria
   * do documento fotos que sempre estiveram lá, sem defeito que o justifique.
   */
  const fotoVisivelDoItem = (item: ItemDoProjeto) => {
    const foto = fotoDoItem(item);
    if (!foto.photoId) return foto;
    const daGaleria = porId.get(foto.photoId);
    // Ponteiro que não resolve: a tela já degradou para o arquivo próprio ou
    // para nada. Não é aqui que se decide isso.
    if (!daGaleria) return foto;
    return fotoVaiParaOsNoivos(daGaleria) ? foto : { ...foto, url: null };
  };

  for (const a of projeto.ambientes) {
    const itens = a.itens.filter(itemVaiParaOsNoivos).map((item) => {
      const foto = fotoVisivelDoItem(item);
      return {
        nome: item.name.trim(),
        quantidade: quantidadeTexto(item),
        detalhe: detalheDe(item),
        fotoUrl: foto.url,
        // Duas origens para a mesma verdade, e as duas contam: o item pode
        // estar marcado como referência, e a foto pode ser a de referência
        // porque não há foto do contratado.
        ehReferencia: item.projectScope === "referencia" || foto.ehReferencia,
      };
    });
    const imagens = imagensDe(a);
    // Ambiente sem nada visível não vira página em branco com um título.
    if (itens.length === 0 && imagens.length === 0) continue;
    ambientes.push({ titulo: a.label, emoji: a.emoji, itens, imagens });
  }

  return { ambientes, inspiracoes: imagensDe(projeto.semAmbiente) };
}

/** Tem o que apresentar? Documento vazio não deve poder ser gerado. */
export function apresentacaoTemConteudo(a: ApresentacaoDoProjeto): boolean {
  return a.ambientes.length > 0 || a.inspiracoes.length > 0;
}
