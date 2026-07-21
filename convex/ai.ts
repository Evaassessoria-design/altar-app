"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { action } from "./_generated/server";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";

function makeOpenAI() {
  return new OpenAI({
    baseURL: "https://ai-gateway.hercules.app/v1",
    apiKey: process.env.HERCULES_API_KEY,
  });
}

// ─── AI: Extract briefing fields from contract text ───────────────────────────

export const extractBriefingFromContract = action({
  args: {
    eventId: v.id("events"),
    contractText: v.string(),
  },
  handler: async (ctx, args): Promise<{ fieldsUpdated: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });

    const client = makeOpenAI();

    const systemPrompt = `Você é um assistente especializado em eventos de decoração no Brasil.
Analise o texto do contrato/documento fornecido e extraia informações para preencher um briefing de evento.
Retorne um objeto JSON com APENAS os campos encontrados claramente no documento.
Campos possíveis (todos opcionais, retorne somente os encontrados):
guestCount, theme, ceremonyTime, receptionTime, venueContact, venueRules,
colorPalette, decorStyle, atmosphereDescription, tableClothColor, centerpiece,
flowerTypes, flowerColors, bouquetStyle, flowerSupplier,
guestTableType, guestTableCount, guestChairType, guestChairCount,
sweetTableIncluded, loungeIncluded, lightingType, candleUse,
cakeSupplier, cakeFlavor, cakeDesign, sweetsIncluded,
generalNotes, specialRequests, restrictions, vendorContacts, setupTime, teardownTime, emergencyContact.
Retorne SOMENTE o JSON válido, sem markdown nem explicações.`;

    const response = await client.chat.completions.create({
      model: "openai/gpt-5.6-luna",
      reasoning_effort: "none",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Contrato:\n\n${args.contractText.slice(0, 8000)}` },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let fields: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        fields = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, val]) => typeof val === "string" && (val as string).length > 0)
            .map(([k, val]) => [k, String(val)]),
        );
      }
    } catch {
      // ignore
    }

    if (Object.keys(fields).length > 0) {
      await ctx.runMutation(api.briefing.upsertBriefingFields, {
        eventId: args.eventId,
        fields,
      });
    }

    return { fieldsUpdated: Object.keys(fields).length };
  },
});

// ─── AI: Analyse croqui/layout image ─────────────────────────────────────────

export const analyseLayout = action({
  args: {
    eventId: v.id("events"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ description: string; furnitureList: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });

    const client = makeOpenAI();

    const response = await client.chat.completions.create({
      model: "openai/gpt-5.6-luna",
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em design de eventos e decoração no Brasil.
Analise o croqui/imagem de layout do evento fornecido pelo decorador.
Descreva profissionalmente o layout em português brasileiro.
Em seguida, liste os itens de mobiliário e decoração identificados.
Responda SOMENTE com JSON: { "description": "...", "furnitureList": "item1, item2, ..." }`,
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: args.imageUrl, detail: "low" } },
            { type: "text", text: "Analise este croqui e descreva o layout e os itens de mobiliário." },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let result = { description: "", furnitureList: "" };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const p = parsed as Record<string, unknown>;
        result = {
          description: typeof p.description === "string" ? p.description : "",
          furnitureList: typeof p.furnitureList === "string" ? p.furnitureList : "",
        };
      }
    } catch {
      result.description = raw;
    }

    if (result.description || result.furnitureList) {
      const combined = [
        result.description,
        result.furnitureList ? `\nItens identificados: ${result.furnitureList}` : "",
      ].join("").trim();

      await ctx.runMutation(api.briefing.upsertBriefingFields, {
        eventId: args.eventId,
        fields: { atmosphereDescription: combined },
      });
    }

    return result;
  },
});

// ─── AI: Auto-generate checklist from briefing summary ────────────────────────

export const generateChecklistFromBriefing = action({
  args: {
    eventId: v.id("events"),
    phase: v.union(v.literal("pre"), v.literal("post")),
    briefingSummary: v.string(),
  },
  handler: async (ctx, args): Promise<{ itemsCreated: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });

    const client = makeOpenAI();
    const phaseLabel = args.phase === "pre" ? "pré-evento (carregamento)" : "pós-evento (conferência/devolução)";

    const response = await client.chat.completions.create({
      model: "openai/gpt-5.6-luna",
      reasoning_effort: "none",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em logística de eventos de decoração no Brasil.
Gere um checklist de ${phaseLabel} baseado no briefing do evento.
Retorne um array JSON: [{"name":"Item","category":"Categoria","quantity":1,"unit":"unid"}]
Categorias possíveis: Flores, Tecidos, Móveis, Iluminação, Bolo e Doces, Ferramentas, Transporte, Geral.
Gere entre 10 e 20 itens relevantes. Retorne SOMENTE o JSON array válido.`,
        },
        {
          role: "user",
          content: `Briefing:\n${args.briefingSummary}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "[]";
    let items: { name: string; category?: string; quantity?: number; unit?: string }[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed
          .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
          .map((i) => ({
            name: typeof i.name === "string" ? i.name : "Item",
            category: typeof i.category === "string" ? i.category : undefined,
            quantity: typeof i.quantity === "number" ? i.quantity : undefined,
            unit: typeof i.unit === "string" ? i.unit : undefined,
          }));
      }
    } catch {
      // ignore
    }

    for (const item of items) {
      await ctx.runMutation(api.briefing.addChecklistItem, {
        eventId: args.eventId,
        phase: args.phase,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
      });
    }

    return { itemsCreated: items.length };
  },
});
