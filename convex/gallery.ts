import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOwnedEvent, requireEventOwner, requireIdentity, requireUser } from "./lib/identity";
import { requireActiveAccess } from "./lib/accessGuard";
import { chaveDoAmbiente } from "./lib/ambiente";
import { apagarFotoDaGaleria } from "./lib/cascade";

// Generate upload URL for photo
/**
 * Autorização de upload de foto da galeria.
 *
 * Exige ACESSO ATIVO, e não apenas sessão. `lib/accessGuard.ts` sempre disse
 * que a guarda vale para "criar evento novo, enviar arquivos e todas as ações
 * de IA" — mas só o evento e a IA estavam cobertos. Como as funções do Convex
 * são chamáveis direto do navegador, uma conta com trial vencido, cancelada ou
 * bloqueada por inadimplência continuava conseguindo subir arquivo, e storage
 * é cobrado.
 *
 * Isto NÃO tranca o acesso aos próprios dados: ler, editar e exportar o que já
 * existe segue liberado para quem está bloqueado — inclusive a logo da empresa
 * (`users.generateLogoUploadUrl`), que é o caminho de volta para pagar.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActiveAccess(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Save photo after upload
export const savePhoto = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    /**
     * Versão leve, quando o navegador conseguiu gerar uma.
     *
     * Opcional em todos os sentidos: envio que falhou em gerar continua
     * salvando a foto, e este é o ÚNICO caminho que grava o campo — não há
     * update que o troque depois, então a versão leve nunca aponta para
     * arquivo de outra foto.
     */
    previewStorageId: v.optional(v.id("_storage")),
    filename: v.string(),
    category: v.union(
      v.literal("antes"),
      v.literal("montagem"),
      v.literal("evento"),
      v.literal("desmontagem"),
    ),
    caption: v.optional(v.string()),
    // ── O QUE A IMAGEM SIGNIFICA, JÁ NO ENVIO ────────────────────────────────
    // `projectScope` e `ambiente` existem no schema desde que a distinção
    // entre INSPIRAÇÃO e CONTRATADO foi desenhada — e nenhum dos dois era
    // gravado por caminho nenhum. Ver `updatePhoto` logo abaixo.
    projectScope: v.optional(
      v.union(v.literal("incluso"), v.literal("referencia"), v.literal("nao_incluso")),
    ),
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);

    // Versão leve APONTANDO PARA O PRÓPRIO ORIGINAL não é versão leve: é o
    // mesmo arquivo com dois nomes. Nenhuma tela manda isso — `gerarPreview`
    // sempre devolve um arquivo novo —, mas as funções do Convex são
    // chamáveis direto do navegador, e guardar o apelido faria a grade baixar
    // o original achando que baixava a miniatura.
    const previewStorageId =
      args.previewStorageId === args.storageId ? undefined : args.previewStorageId;

    // Get current max order for this event
    const lastPhoto = await ctx.db
      .query("eventPhotos")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .first();
    const order = (lastPhoto?.order ?? 0) + 1;

    return await ctx.db.insert("eventPhotos", {
      eventId: args.eventId,
      userId: user._id,
      storageId: args.storageId,
      previewStorageId,
      filename: args.filename,
      category: args.category,
      caption: args.caption,
      projectScope: args.projectScope,
      ambiente: args.ambiente?.trim() || undefined,
      order,
      uploadedAt: new Date().toISOString(),
    });
  },
});

// List photos for event — resolved with URLs
export const listPhotos = query({
  args: {
    eventId: v.id("events"),
    category: v.optional(v.union(
      v.literal("antes"),
      v.literal("montagem"),
      v.literal("evento"),
      v.literal("desmontagem"),
    )),
    /**
     * "Quais são as referências da mesa do bolo?"
     *
     * É a pergunta que a decoradora faz no galpão, com o celular na mão, e que
     * não tinha resposta: a galeria filtrava só por FASE, e setenta fotos de
     * um casamento moram todas em "antes".
     *
     * Filtro na CONSULTA, não na página já carregada — filtrar depois faria a
     * contagem mentir assim que a lista tivesse teto.
     */
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];

    let photosQuery;
    if (args.category) {
      photosQuery = ctx.db
        .query("eventPhotos")
        .withIndex("by_event_category", (q) =>
          q.eq("eventId", args.eventId).eq("category", args.category!),
        );
    } else {
      photosQuery = ctx.db
        .query("eventPhotos")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId));
    }

    const encontradas = await photosQuery.order("asc").collect();
    // MESMA chave que o Projeto Visual usa para agrupar (`lib/ambiente.ts`).
    // Antes daqui a comparação era `trim().toLowerCase()`, que não junta
    // acento: o bloco do projeto mostrava "Salão de vidro" e "salao de vidro"
    // juntos, e o link "+12 na Galeria" abria com nove.
    const alvo = args.ambiente ? chaveDoAmbiente(args.ambiente) : "";
    const photos = alvo
      ? encontradas.filter((p) => chaveDoAmbiente(p.ambiente) === alvo)
      : encontradas;

    return await Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
        // A versão leve, quando existe. Quem escolhe qual desenhar é
        // `urlDeExibicao` (src/lib/imagem-reduzida.ts) — uma regra só para as
        // três telas, senão uma delas continuaria baixando o original.
        previewUrl: p.previewStorageId
          ? await ctx.storage.getUrl(p.previewStorageId)
          : null,
      })),
    );
  },
});

// Update photo caption / category
export const updatePhoto = mutation({
  args: {
    id: v.id("eventPhotos"),
    caption: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("antes"),
      v.literal("montagem"),
      v.literal("evento"),
      v.literal("desmontagem"),
    )),
    // O que a imagem significa no projeto — eixo separado da fase.
    projectScope: v.optional(
      v.union(v.literal("incluso"), v.literal("referencia"), v.literal("nao_incluso")),
    ),
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo || photo.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });

    // ── O DEFEITO QUE ESTAS QUATRO LINHAS FECHAM ─────────────────────────────
    // `projectScope` e `ambiente` eram ACEITOS nos argumentos e descartados na
    // gravação: o patch só carregava `caption` e `category`. A tela mandava a
    // classificação, recebia "Legenda salva!" em verde, e nada era gravado.
    //
    // O efeito é pior do que perder um campo. A distinção entre REFERÊNCIA
    // ("é assim que queremos") e INCLUSO ("está contratado") é a que impede
    // uma foto de inspiração de ser cobrada como item do projeto — o schema
    // documenta isso em oito linhas, `scopeMeta` desenha o selo, e nada disso
    // chegava ao banco. Em `assemblyItems` a mesma regra sempre funcionou; só
    // nas FOTOS ela era jogada fora.
    const patch: {
      caption?: string;
      category?: typeof args.category;
      projectScope?: typeof args.projectScope;
      ambiente?: string;
    } = {};
    if (args.caption !== undefined) patch.caption = args.caption;
    if (args.category !== undefined) patch.category = args.category;
    if (args.projectScope !== undefined) patch.projectScope = args.projectScope;
    // `""` LIMPA o ambiente; ausente não mexe. A distinção é a convenção da
    // casa (lib/limparCampos.ts) e aqui ela importa: uma foto pode deixar de
    // pertencer a um ambiente.
    if (args.ambiente !== undefined) patch.ambiente = args.ambiente.trim() || undefined;
    await ctx.db.patch(args.id, patch);
  },
});

// Delete photo
export const deletePhoto = mutation({
  args: { id: v.id("eventPhotos") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo || photo.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });

    // ── A CAPA SAI ANTES DA FOTO ──────────────────────────────────────────
    // Apagar a foto que é capa deixaria `events.coverPhotoId` apontando para
    // uma linha que não existe. A tela degrada para a capa tipográfica mesmo
    // assim, mas ponteiro quebrado no banco é dívida que cresce em silêncio:
    // quem ler o campo amanhã não tem como saber se a capa foi removida ou se
    // o dado se perdeu.
    //
    // Só o evento DESTA foto é tocado, e só quando a capa é esta.
    const evento = await ctx.db.get(photo.eventId);
    if (evento && evento.coverPhotoId === args.id) {
      await ctx.db.patch(photo.eventId, { coverPhotoId: undefined });
    }

    // ── OS ITENS QUE USAVAM ESTA FOTO SAEM ANTES TAMBÉM ────────────────────
    // Desde que o item de montagem pode APONTAR para uma foto da Galeria
    // (`assemblyItems.setPhotoDaGaleria`), apagar a foto pode deixar ponteiro
    // quebrado em vários itens — a mesma dívida que a capa acima já evitava,
    // multiplicada.
    //
    // A leitura degrada sozinha (`lib/fotoDoItem.ts` ignora ponteiro que não
    // resolve e cai no arquivo próprio), então isto não é o que impede a tela
    // de quebrar: é o que impede o BANCO de guardar uma mentira. Sem limpar,
    // ninguém consegue dizer depois se o item nunca teve foto ou se a foto
    // dele sumiu.
    //
    // A varredura é pelo índice `by_event` — os itens de UM evento, dezenas no
    // pior caso. Um índice novo por ponteiro custaria escrita em toda criação
    // de item para servir a um caminho que roda quando se apaga uma foto.
    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", photo.eventId))
      .collect();
    for (const item of itens) {
      const limpar: Record<string, undefined> = {};
      if (item.referencePhotoId === args.id) limpar.referencePhotoId = undefined;
      if (item.contractedPhotoId === args.id) limpar.contractedPhotoId = undefined;
      if (Object.keys(limpar).length > 0) await ctx.db.patch(item._id, limpar);
    }

    // ── OS ARQUIVOS SAEM SE MAIS NINGUÉM APONTAR PARA ELES ───────────────
    // `apagarFotoDaGaleria` carrega duas regras, e as duas são de
    // `lib/cascade.ts` para que a cascata do evento use exatamente as mesmas:
    //
    //   1. apagar arquivo NUNCA derruba a exclusão da linha. O Convex LANÇA
    //      ao apagar arquivo inexistente, e a mutation inteira abortava
    //      deixando a FOTO NO BANCO — pior que arquivo órfão, porque a tela
    //      passa a mentir sobre o que existe;
    //
    //   2. arquivo referenciado por OUTRA linha não sai. Desde que a Galeria
    //      virou acervo da empresa, a foto de 2024 reaproveitada em 2026 tem
    //      duas linhas e um arquivo só. Apagar a de 2024 quebraria a de 2026
    //      em silêncio, e ela só descobriria na frente da cliente.
    await apagarFotoDaGaleria(ctx, photo);
  },
});

// Count photos by category for an event
export const getPhotoCounts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId)))
      return { total: 0, antes: 0, montagem: 0, evento: 0, desmontagem: 0 };
    const photos = await ctx.db
      .query("eventPhotos")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return {
      total: photos.length,
      antes: photos.filter((p) => p.category === "antes").length,
      montagem: photos.filter((p) => p.category === "montagem").length,
      evento: photos.filter((p) => p.category === "evento").length,
      desmontagem: photos.filter((p) => p.category === "desmontagem").length,
    };
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// A GALERIA COMO ACERVO DA EMPRESA
//
// ── A PERGUNTA QUE NÃO TINHA RESPOSTA ───────────────────────────────────────
// Este módulo tinha seis funções e TODAS exigiam `eventId`. Cinco anos de
// trabalho ficavam em setenta álbuns lacrados: não havia como achar o arco de
// oliveiras de 2024 para mostrar à cliente de hoje, nem como reaproveitar a
// foto de uma cadeira que já estava no sistema.
//
// O repositório já respondeu essa mesma pergunta três vezes para outras
// entidades — `materials.ondeEUsado`, `compositions.ondeEUsada`,
// `supplierCatalog.listEventsForSupplier`. Faltava para as imagens, que são o
// ativo mais valioso de quem decora.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O teto do acervo.
 *
 * Uma decoradora com cinco anos de ALTAR acumula milhares de fotos, e
 * `collect()` sobre elas para em silêncio quando a conta cresce — o mesmo
 * defeito que `propostas` e o Financeiro já corrigiram. A resposta diz
 * `temMais` para a tela escrever "120 carregadas (há mais)" em vez de afirmar
 * um acervo que ela não conferiu.
 */
export const LIMITE_DO_ACERVO = 120;

/**
 * As fotos da EMPRESA, de todos os eventos.
 *
 * Ordem decrescente de envio: o que ela fez por último é o que ela procura
 * primeiro, e o corte cai no passado distante em vez de cair onde ela está
 * olhando.
 */
export const meuAcervo = query({
  args: {
    /** Fotos deste evento saem da lista — ela já as tem à mão. */
    excetoEventoId: v.optional(v.id("events")),
    /** Filtro por ambiente, na CONSULTA. Filtrar a página já carregada faria a contagem mentir. */
    ambiente: v.optional(v.string()),
    /** Busca por legenda ou nome do arquivo. */
    busca: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const alvoAmbiente = args.ambiente ? chaveDoAmbiente(args.ambiente) : "";
    const termo = args.busca?.trim().toLowerCase() ?? "";

    // O filtro corre ANTES do teto, senão "120 carregadas" seria 120 lidas e
    // três mostradas. O teto de LEITURA continua existindo, uma ordem de
    // grandeza acima, para a consulta nunca varrer a tabela inteira.
    const TETO_DE_LEITURA = LIMITE_DO_ACERVO * 10;
    const lidas = await ctx.db
      .query("eventPhotos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(TETO_DE_LEITURA);

    const nomesDeEvento = new Map(
      (
        await ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect()
      ).map((e) => [e._id as string, e.name]),
    );

    const combinam = lidas.filter((p) => {
      if (args.excetoEventoId && p.eventId === args.excetoEventoId) return false;
      if (alvoAmbiente && chaveDoAmbiente(p.ambiente) !== alvoAmbiente) return false;
      if (termo) {
        const texto = `${p.caption ?? ""} ${p.filename}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });

    const temMais = combinam.length > LIMITE_DO_ACERVO;
    const pagina = temMais ? combinam.slice(0, LIMITE_DO_ACERVO) : combinam;

    return {
      temMais,
      fotos: await Promise.all(
        pagina.map(async (p) => ({
          _id: p._id,
          eventId: p.eventId,
          // De qual casamento ela é. Sem isto a grade é um mural sem memória.
          eventoNome: nomesDeEvento.get(p.eventId) ?? "Evento",
          filename: p.filename,
          caption: p.caption,
          ambiente: p.ambiente,
          category: p.category,
          uploadedAt: p.uploadedAt,
          url: await ctx.storage.getUrl(p.storageId),
          previewUrl: p.previewStorageId
            ? await ctx.storage.getUrl(p.previewStorageId)
            : null,
        })),
      ),
    };
  },
});

/**
 * Traz uma foto do acervo para ESTE evento, sem subir nada de novo.
 *
 * ── O QUE ELA CRIA, E O QUE NÃO CRIA ────────────────────────────────────────
 * Cria uma LINHA nova em `eventPhotos`, do evento de destino, apontando para o
 * MESMO arquivo. Nenhum byte é copiado, nenhum upload acontece, e a conta de
 * storage não cresce.
 *
 * A linha é própria de propósito: ambiente, legenda e classificação são
 * decisões DAQUELE evento. A mesma foto de arco pode ser "contratada" num
 * casamento e "referência" no outro, e uma linha compartilhada obrigaria as
 * duas a concordar.
 *
 * ── O QUE NÃO É COPIADO, E POR QUÊ ──────────────────────────────────────────
 * `projectScope` NÃO vem junto. Escopo é decisão comercial sobre ESTE projeto,
 * e herdar "contratado" de outro casamento afirmaria, sem ninguém dizer, que a
 * cliente de hoje comprou aquilo. É a mesma recusa que `papelDaFoto` já faz ao
 * não promover foto sem classificação a referência.
 *
 * `category` nasce "antes": trazer uma foto do acervo é planejar, mesmo quando
 * a original registrou uma montagem que já aconteceu.
 *
 * `ambiente` e `caption` VÊM, porque descrevem a imagem e não o contrato — e
 * são exatamente o trabalho que ela não deveria refazer.
 */
export const reaproveitar = mutation({
  args: {
    photoId: v.id("eventPhotos"),
    paraEventoId: v.id("events"),
    /** Ambiente deste evento. Ausente = herda o da foto original. */
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.paraEventoId);

    const original = await ctx.db.get(args.photoId);
    // Foto de outra conta responde como inexistente: confirmar que existe já
    // seria contar que aquela empresa tem aquela imagem.
    if (!original || original.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Foto não encontrada" });
    }

    // Já está neste evento? Não duplica — devolve a linha existente. Sem isto,
    // dois toques no 4G do galpão criariam a mesma foto duas vezes na grade.
    const noDestino = await ctx.db
      .query("eventPhotos")
      .withIndex("by_event", (q) => q.eq("eventId", args.paraEventoId))
      .collect();
    const jaEsta = noDestino.find((p) => p.storageId === original.storageId);
    if (jaEsta) return jaEsta._id;

    const order = noDestino.reduce((m, p) => Math.max(m, p.order), 0) + 1;

    return ctx.db.insert("eventPhotos", {
      eventId: args.paraEventoId,
      userId: user._id,
      // O MESMO arquivo. É o ponto inteiro desta função.
      storageId: original.storageId,
      previewStorageId: original.previewStorageId,
      filename: original.filename,
      category: "antes",
      caption: original.caption,
      ambiente: args.ambiente?.trim() || original.ambiente,
      order,
      uploadedAt: new Date().toISOString(),
    });
  },
});
