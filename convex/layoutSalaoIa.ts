"use node";

import { v, ConvexError } from "convex/values";
import OpenAI from "openai";
import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireIdentity } from "./lib/identity";
import { requireActiveAccessAction } from "./lib/accessGuard";
import { getAiConfig } from "./lib/aiConfig";
import {
  interpretarRascunhoDaIa,
  LAYOUT_SYSTEM_PROMPT,
  type RascunhoDaIa,
} from "./lib/layoutSalaoIa";

// ─────────────────────────────────────────────────────────────────────────────
// IA DO LAYOUT DO SALÃO — croqui + medidas → rascunho editável.
//
// LER → INTERPRETAR → MOSTRAR → REVISAR → CONFIRMAR, como na Planta Premium:
// esta action NÃO GRAVA nada. Devolve o rascunho; quem salva é a decoradora,
// pelo editor, depois de olhar (`layoutSalao.criar`).
//
// Usa o MESMO gateway de visão da Planta Premium (getAiConfig("vision")):
// nenhuma chave nova, nenhum provedor novo para configurar.
// ─────────────────────────────────────────────────────────────────────────────

const DESCRICAO_MAX = 3000;

async function requireEventOwnerAction(ctx: ActionCtx, eventId: Id<"events">) {
  await requireIdentity(ctx);
  // IA custa por chamada: conta bloqueada não dispara leitura nenhuma.
  await requireActiveAccessAction(ctx);
  const event = await ctx.runQuery(api.events.get, { id: eventId });
  if (!event) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });
  }
}

async function paraDataUrl(blob: Blob): Promise<string> {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${bytes.toString("base64")}`;
}

export const rascunhoPorIa = action({
  args: {
    eventId: v.id("events"),
    /** Croqui enviado por `layoutRenders.generateUploadUrl`. AUSENTE = só texto. */
    storageId: v.optional(v.id("_storage")),
    descricao: v.string(),
    largura: v.optional(v.number()),
    comprimento: v.optional(v.number()),
    mesas: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RascunhoDaIa> => {
    await requireEventOwnerAction(ctx, args.eventId);

    const descricao = args.descricao.trim().slice(0, DESCRICAO_MAX);
    if (!args.storageId && !descricao) {
      throw new ConvexError({
        code: "INVALID",
        message: "Envie o croqui ou descreva o salão para a IA montar o rascunho.",
      });
    }

    const medidas = [
      args.largura ? `Largura do salão: ${args.largura} m.` : "",
      args.comprimento ? `Comprimento do salão: ${args.comprimento} m.` : "",
      args.mesas ? `Quantidade de mesas pedida: ${args.mesas}.` : "",
    ].filter(Boolean).join(" ");

    const conteudo: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    if (args.storageId) {
      const blob = await ctx.storage.get(args.storageId);
      if (!blob) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Croqui não encontrado." });
      }
      conteudo.push({ type: "image_url", image_url: { url: await paraDataUrl(blob), detail: "high" } });
    }
    conteudo.push({
      type: "text",
      text: [medidas, descricao, "Devolva o JSON da planta."].filter(Boolean).join("\n\n"),
    });

    const cfg = getAiConfig("vision");
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    const resposta = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: LAYOUT_SYSTEM_PROMPT },
        { role: "user", content: conteudo },
      ],
    });

    return interpretarRascunhoDaIa(resposta.choices[0]?.message?.content ?? "", {
      largura: args.largura,
      comprimento: args.comprimento,
      mesas: args.mesas,
    });
  },
});
