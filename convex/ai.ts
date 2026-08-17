"use node";

import { v, ConvexError } from "convex/values";
import OpenAI from "openai";
import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireIdentity } from "./lib/identity";

function makeOpenAI() {
  return new OpenAI({
    baseURL: "https://ai-gateway.hercules.app/v1",
    apiKey: process.env.HERCULES_API_KEY,
  });
}

// Autorização por evento no contexto de ACTION (sem ctx.db). Reutiliza
// `events.get`, que já resolve a identidade e devolve null para quem não é dono
// — mesma regra do requireEventOwner usado nas queries/mutations.
async function requireEventOwnerAction(ctx: ActionCtx, eventId: Id<"events">) {
  await requireIdentity(ctx);
  const event = await ctx.runQuery(api.events.get, { id: eventId });
  if (!event) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });
  }
  return event;
}

// ─── AI: Extract STRUCTURED data from contract + adendo ───────────────────────
// Fluxo único do ALTAR para IA Documental: LER → INTERPRETAR → MOSTRAR → REVISAR
// → CONFIRMAR → APLICAR. Esta action APENAS LÊ e retorna JSON — NÃO altera
// evento/financeiro/briefing. A aplicação acontece só após confirmação na UI
// (events.update / financeiro.createReceivablesFromContract /
// briefing.upsertBriefingFields). Nada é automático.
export const extractContractData = action({
  args: {
    eventId: v.id("events"),
    contractText: v.string(),
    kind: v.optional(v.union(v.literal("contract"), v.literal("addendum"))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    client: { name?: string; phone?: string; email?: string };
    event: { name?: string; date?: string; location?: string };
    finance: {
      total?: number;
      downPayment?: number;
      installments: { description?: string; amount?: number; dueDate?: string }[];
      paymentMethod?: string;
    };
    contracted: { item: string; quantity?: number }[];
    addendum: { item: string; quantity?: number; change?: string }[];
    decor: {
      style?: string;
      colorPalette?: string;
      environments?: string;
      items: { category?: string; item: string; quantity?: number }[];
      notes?: string;
    };
  }> => {
    await requireEventOwnerAction(ctx, args.eventId);
    const client = makeOpenAI();
    const kindLabel = args.kind === "addendum" ? "adendo/anexo" : "contrato";

    const systemPrompt = `Você é um assistente que lê ${kindLabel}s de empresas de decoração de eventos no Brasil.
Extraia SOMENTE o que estiver claramente no documento. Retorne JSON válido no formato:
{
  "client": { "name": "", "phone": "", "email": "" },
  "event": { "name": "", "date": "", "location": "" },
  "finance": { "total": 0, "downPayment": 0, "installments": [ { "description": "", "amount": 0, "dueDate": "AAAA-MM-DD" } ], "paymentMethod": "" },
  "contracted": [ { "item": "", "quantity": 0 } ],
  "addendum": [ { "item": "", "quantity": 0, "change": "" } ],
  "decor": {
    "style": "",
    "colorPalette": "",
    "environments": "",
    "items": [ { "category": "", "item": "", "quantity": 0 } ],
    "notes": ""
  }
}
O bloco "decor" cobre TODA informação de decoração/briefing descrita no documento: estilo, cores,
ambientes, mobiliário, mesas, cadeiras, aparadores, lounges, bares, estruturas, arranjos, flores,
peças e observações. "items" deve listar cada item de decoração com sua categoria (ex.: "mobiliário",
"flores", "estrutura") e quantidade quando informada.
Regras: use null/omita quando não encontrar; datas em AAAA-MM-DD; valores numéricos sem símbolo; NÃO invente. Responda SOMENTE o JSON.`;

    const response = await client.chat.completions.create({
      model: "openai/gpt-5.6-luna",
      reasoning_effort: "low",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Documento (${kindLabel}):\n\n${args.contractText.slice(0, 12000)}` },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const empty = {
      client: {},
      event: {},
      finance: { installments: [] },
      contracted: [],
      addendum: [],
      decor: { items: [] },
    };
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        client: (parsed.client as typeof empty.client) ?? {},
        event: (parsed.event as typeof empty.event) ?? {},
        finance: {
          ...(parsed.finance as object),
          installments:
            ((parsed.finance as { installments?: [] })?.installments as []) ?? [],
        },
        contracted: (parsed.contracted as []) ?? [],
        addendum: (parsed.addendum as []) ?? [],
        decor: {
          ...(parsed.decor as object),
          items: ((parsed.decor as { items?: [] })?.items as []) ?? [],
        },
      };
    } catch {
      return empty;
    }
  },
});

// ─── AI: Analyse croqui/layout image ─────────────────────────────────────────
// Esta action APENAS LÊ a imagem e retorna JSON — NÃO altera o briefing.
// A aplicação (briefing.upsertBriefingFields) só acontece após revisão e
// confirmação da decoradora na UI, seguindo o mesmo padrão do fluxo de contrato.
export const analyseLayout = action({
  args: {
    eventId: v.id("events"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ description: string; furnitureList: string }> => {
    await requireEventOwnerAction(ctx, args.eventId);

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
    await requireEventOwnerAction(ctx, args.eventId);

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
