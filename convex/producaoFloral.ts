import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getOwnedEvent, requireUser } from "./lib/identity";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import { resolverFotoDoItem, type FotoDaGaleria } from "./lib/fotoDoItem";
import { normalizeName } from "./lib/materiais";
import { responsavelDoEvento } from "./lib/responsavel";
import {
  avisosDaFicha,
  checklistDeProducao,
  instrucoesDaComposicao,
  legendaDasFlores,
  linhasDaComposicao,
  resumoDeMateriais,
} from "./lib/producaoFloral";

// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO FLORAL — o que vai para a mão do florista.
//
// A decoradora já cadastrou "20 arranjos baixos na mesa dos convidados"
// (`assemblyItems`) e a receita deles (`assemblyItems.receita`, Ficha
// Técnica). O que faltava era a outra metade do papel que ela manda por
// WhatsApp toda semana: formato, altura, montagem, substituição permitida,
// cuidado, horário e observação — por composição.
//
// ── POR QUE UMA CONSULTA PRÓPRIA, E NÃO `fichaTecnica.getFicha` ─────────────
// `getFicha` carrega compras, cobertura, custo estimado e sugestão de
// providência: tudo informação interna, e parte dela financeira. A ficha do
// florista é documento de FORNECEDOR. Projetar a resposta grande para esconder
// campos na tela seria um `delete` esperando ser esquecido no próximo campo
// novo — e o campo esquecido vazaria preço para quem está orçando.
//
// Esta consulta monta a resposta CAMPO A CAMPO, e não tem de onde vazar: ela
// nem lê `purchaseItems`.
//
// A CONTA é a mesma dos dois lados (`necessidadeDoComponente`, em
// lib/fichaTecnica.ts). A tela do florista não pode mostrar 95 rosas onde a
// ficha técnica mostra 100.
//
// ── O QUE NADA AQUI FAZ ─────────────────────────────────────────────────────
// Não cria compra, não movimenta estoque, não reserva acervo e não envia nada
// a ninguém. É leitura e um texto gravado por composição.
// ─────────────────────────────────────────────────────────────────────────────

const instrucoes = v.object({
  formato: v.optional(v.string()),
  altura: v.optional(v.string()),
  montagem: v.optional(v.string()),
  substituicoes: v.optional(v.string()),
  cuidados: v.optional(v.string()),
  horario: v.optional(v.string()),
  observacoes: v.optional(v.string()),
});

/** Teto de texto por campo. Instrução de montagem não é contrato. */
const MAXIMO_POR_CAMPO = 2000;

function textoLimpo(valor: string | undefined, campo: string): string | undefined {
  if (valor === undefined) return undefined;
  const limpo = valor.trim();
  if (!limpo) return undefined;
  if (limpo.length > MAXIMO_POR_CAMPO) {
    throw new ConvexError({
      code: "INVALID",
      message: `${campo} passa de ${MAXIMO_POR_CAMPO} caracteres`,
    });
  }
  return limpo;
}

/**
 * Grava as instruções florais de UMA composição.
 *
 * Substitui o objeto inteiro, como `setReceita` faz com a receita: é um
 * formulário só, salvo de uma vez. Campo vazio vira AUSENTE em vez de string
 * vazia — a ficha não imprime bloco em branco.
 */
export const setInstrucoes = mutation({
  args: {
    id: v.id("assemblyItems"),
    floral: instrucoes,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    // Id de outra conta responde NOT_FOUND: não confirmamos a existência de
    // dado alheio. Mesma regra de `setReceita`.
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Item não encontrado" });
    }

    const floral = {
      formato: textoLimpo(args.floral.formato, "Formato"),
      altura: textoLimpo(args.floral.altura, "Altura"),
      montagem: textoLimpo(args.floral.montagem, "Montagem"),
      substituicoes: textoLimpo(args.floral.substituicoes, "Substituições"),
      cuidados: textoLimpo(args.floral.cuidados, "Cuidados"),
      horario: textoLimpo(args.floral.horario, "Horário"),
      observacoes: textoLimpo(args.floral.observacoes, "Observações"),
    };
    const vazio = Object.values(floral).every((v) => v === undefined);

    // Tudo em branco limpa o campo: item sem ficha floral volta a ser item sem
    // ficha floral, e não um objeto de sete `undefined` ocupando espaço.
    await ctx.db.patch(args.id, comCarimbo({ floral: vazio ? undefined : floral }));
    return { preenchido: !vazio };
  },
});

/**
 * A FICHA DO FLORISTA, em uma leitura.
 *
 * Devolve o cabeçalho do evento, as composições com receita e instruções, os
 * avisos (cuidado e horário), o checklist e o resumo de materiais. Tudo
 * derivado: nenhum total é gravado.
 *
 * `incluirFotos` controla a leitura das fotos das FLORES (catálogo). Sem ele a
 * consulta não resolve URL nenhuma de material — a ficha sem fotos não paga o
 * custo de montá-las.
 */
export const fichaDoFlorista = query({
  args: {
    eventId: v.id("events"),
    incluirFotos: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Listagem degrada para `null` em vez de lançar — o padrão do repositório
    // para tela que pode ser aberta por link antigo.
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;

    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Referência visual e item fora do projeto não entram: mandar o florista
    // montar um arranjo de inspiração é fazer alguém perder a manhã. É a MESMA
    // regra do Caderno, da Folha de Carregamento e da Ficha Técnica.
    const executaveis = itens.filter(
      (i) => ehObrigacaoDeMontagem(i) && (i.receita?.length ?? 0) > 0,
    );

    // ── FOTO DE REFERÊNCIA DO ARRANJO (Galeria do evento) ────────────────────
    // Uma leitura por foto apontada, confirmando conta E evento: ponteiro
    // gravado antes da guarda poderia trazer a foto de outro evento da mesma
    // conta. Precedência resolvida em `lib/fotoDoItem.ts`, nunca aqui.
    const apontadas = new Set<string>();
    for (const i of executaveis) if (i.referencePhotoId) apontadas.add(i.referencePhotoId);
    const daGaleria = new Map<string, FotoDaGaleria>();
    for (const id of apontadas) {
      const foto = await ctx.db.get(id as Id<"eventPhotos">);
      if (!foto || foto.userId !== event.userId || foto.eventId !== args.eventId) continue;
      daGaleria.set(id, {
        _id: foto._id,
        url: await ctx.storage.getUrl(foto.storageId),
        previewUrl: foto.previewStorageId
          ? await ctx.storage.getUrl(foto.previewStorageId)
          : null,
      });
    }

    const composicoes = [];
    for (const item of executaveis) {
      const referencia = resolverFotoDoItem(
        item.referencePhotoId ? daGaleria.get(item.referencePhotoId) : null,
        item.referencePhotoStorageId
          ? await ctx.storage.getUrl(item.referencePhotoStorageId)
          : null,
      );
      const { materiais, orientacoes } = linhasDaComposicao({
        _id: item._id,
        nome: item.name,
        area: item.area,
        ambiente: item.ambiente,
        quantidade: item.quantity,
        projectScope: item.projectScope,
        receita: item.receita,
      });
      // Campo a campo. `...item` aqui publicaria fornecedor, visibilidade,
      // estado operacional e a foto do CONTRATADO — nada disso é assunto do
      // florista.
      composicoes.push({
        _id: item._id,
        nome: item.name,
        area: item.area,
        ambiente: item.ambiente,
        quantidade: item.quantity,
        ordem: item.order,
        instrucoes: instrucoesDaComposicao(item.floral),
        materiais,
        orientacoes,
        /** Foto do ARRANJO. Não é a foto da flor — ver `lib/producaoFloral.ts`. */
        referenciaUrl: referencia.previewUrl ?? referencia.url,
        receita: item.receita ?? [],
      });
    }

    const paraRegras = composicoes.map((c) => ({
      _id: c._id,
      nome: c.nome,
      area: c.area,
      ambiente: c.ambiente,
      quantidade: c.quantidade,
      receita: c.receita,
      floral: c.instrucoes,
    }));

    const resumo = resumoDeMateriais(paraRegras);

    // ── FOTO DA FLOR (catálogo) ──────────────────────────────────────────────
    // Uma leitura por material DISTINTO da ficha — dezenas, não o catálogo
    // inteiro da empresa. Mesmo padrão de `fichaTecnica.materiaisParaOProjeto`,
    // com a MESMA conferência de dono: foto de material de outra conta nunca
    // entra na ficha.
    const extras = new Map<string, { fotoUrl: string | null; variedade: string | null }>();
    if (args.incluirFotos) {
      const ids = new Set<string>();
      for (const c of composicoes) {
        for (const linha of c.receita) {
          if (linha.materialId) ids.add(linha.materialId);
        }
      }
      for (const id of ids) {
        const material = await ctx.db.get(id as Id<"materials">);
        if (!material || material.userId !== event.userId) continue;
        extras.set(id, {
          fotoUrl: material.fotoStorageId
            ? await ctx.storage.getUrl(material.fotoStorageId)
            : null,
          variedade: material.variedade ?? null,
        });
      }
    }
    // A chave do resumo é `id:<materialId>|unidade` ou `nome:<normalizado>|unidade`.
    // A legenda junta por material, então a unidade sai da chave aqui.
    const flores = legendaDasFlores(resumo, (chave) => {
      const identidade = chave.split("|")[0] ?? "";
      if (identidade.startsWith("id:")) {
        return extras.get(identidade.slice(3)) ?? { fotoUrl: null, variedade: null };
      }
      return { fotoUrl: null, variedade: null };
    });

    // QUEM responde pelo evento, pela regra única de `lib/responsavel.ts`:
    // escolha explícita > anotação > única pessoa escalada. Duas pessoas sem
    // escolha devolve `null`, e a ficha escreve "a definir" em vez de eleger
    // alguém. Uma leitura da escala + uma dos membros, não uma por membro.
    const escala = await ctx.db
      .query("eventTeam")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const membros = [];
    for (const linha of escala) {
      if (linha.userId !== event.userId) continue;
      const membro = await ctx.db.get(linha.teamMemberId);
      if (!membro || membro.userId !== event.userId) continue;
      membros.push({ _id: membro._id, name: membro.name, role: membro.role });
    }
    const responsavel = responsavelDoEvento(
      { responsibleId: event.responsibleId, responsible: event.responsible },
      membros,
    );

    return {
      evento: {
        _id: event._id,
        nome: event.name,
        data: event.date,
        local: event.location,
        cliente: event.clientName,
        responsavel: responsavel?.nome ?? null,
      },
      composicoes: composicoes.map((c) => ({
        _id: c._id,
        nome: c.nome,
        area: c.area,
        ambiente: c.ambiente,
        quantidade: c.quantidade,
        ordem: c.ordem,
        instrucoes: c.instrucoes,
        materiais: c.materiais,
        orientacoes: c.orientacoes,
        referenciaUrl: c.referenciaUrl,
      })),
      avisos: avisosDaFicha(paraRegras),
      checklist: checklistDeProducao(paraRegras),
      resumo: resumo.map((l) => ({
        chave: l.chave,
        nome: l.nome,
        unidade: l.unidade,
        total: l.total,
        cor: l.cor,
        origem: l.origem,
        origens: l.origens,
      })),
      flores,
      /** Itens com receita que ficaram FORA por serem referência/não inclusos. */
      foraDoProjeto: itens.filter(
        (i) => !ehObrigacaoDeMontagem(i) && (i.receita?.length ?? 0) > 0,
      ).length,
      /** Itens do evento ainda SEM receita — a ficha não os inventa. */
      semReceita: itens.filter(
        (i) => ehObrigacaoDeMontagem(i) && (i.receita?.length ?? 0) === 0,
      ).length,
      geradoEm: new Date().toISOString(),
    };
  },
});

/**
 * As flores do catálogo que a ficha pode ilustrar, para a tela escolher ou
 * enviar foto.
 *
 * Reaproveita o catálogo: a foto mora em `materials.fotoStorageId`, uma por
 * insumo, enviada uma vez e usada em todos os eventos da conta. Esta consulta
 * só diz quais materiais da FICHA DESTE EVENTO têm ou não foto — quem envia é
 * `materials.definirFoto`, que já existe e já apaga o arquivo anterior.
 */
export const floresDaFicha = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return [];

    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const porMaterial = new Map<
      string,
      { materialId: Id<"materials"> | null; nome: string; usos: number }
    >();
    for (const item of itens) {
      if (!ehObrigacaoDeMontagem(item)) continue;
      for (const linha of item.receita ?? []) {
        const nome = linha.nome?.trim();
        if (!nome) continue;
        const chave = linha.materialId ?? `nome:${normalizeName(nome)}`;
        const existente = porMaterial.get(chave);
        if (existente) {
          existente.usos += 1;
          continue;
        }
        porMaterial.set(chave, {
          materialId: linha.materialId ?? null,
          nome,
          usos: 1,
        });
      }
    }

    const saida = [];
    for (const linha of porMaterial.values()) {
      if (!linha.materialId) {
        // Linha digitada na hora, sem vínculo com o catálogo: não há onde
        // guardar foto reaproveitável. A tela oferece vincular ao catálogo.
        saida.push({
          materialId: null,
          nome: linha.nome,
          variedade: null as string | null,
          fotoUrl: null as string | null,
          usos: linha.usos,
        });
        continue;
      }
      const material = await ctx.db.get(linha.materialId);
      if (!material || material.userId !== event.userId) continue;
      saida.push({
        materialId: material._id,
        nome: material.nome,
        variedade: material.variedade ?? null,
        fotoUrl: material.fotoStorageId
          ? await ctx.storage.getUrl(material.fotoStorageId)
          : null,
        usos: linha.usos,
      });
    }
    return saida.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },
});
