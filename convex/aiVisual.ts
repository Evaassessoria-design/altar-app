"use node";

import { v, ConvexError } from "convex/values";
import OpenAI from "openai";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireIdentity } from "./lib/identity";
import { requireActiveAccessAction } from "./lib/accessGuard";
import { getAiConfig } from "./lib/aiConfig";
import { getImageProvider } from "./lib/imageProvider";
import {
  getImageProviderConfig,
  IMAGE_PROVIDER_UNCONFIGURED_MESSAGE,
} from "./lib/imageProviderConfig";
import {
  buildPremiumPlanPrompt,
  INTERPRETATION_SYSTEM_PROMPT,
  PROMPT_VERSION,
  type LayoutInterpretation,
} from "./lib/plantaPrompt";

// ─────────────────────────────────────────────────────────────────────────────
// IA VISUAL do ALTAR — interpretação de croqui + geração da Planta Premium.
//
// Separada da IA Documental (convex/ai.ts), que continua intacta: contratos,
// briefing, financeiro e o `analyseLayout` original seguem funcionando como
// estão. Este arquivo NÃO importa nada de ai.ts e vice-versa.
//
// Duas dependências externas, com acoplamentos bem diferentes de propósito:
//  · VISÃO (ler o croqui) — reutiliza o gateway de IA que o ALTAR já usa;
//    sobrescrevível por env, mas o default preserva a infra existente.
//  · IMAGEM (gerar a planta) — 100% desacoplada, definida SÓ por env
//    (ALTAR_IMAGE_*), atrás da interface ImageGenerationProvider.
//
// Fluxo, espelhando o padrão documental do ALTAR:
//   LER → INTERPRETAR → MOSTRAR → REVISAR → CONFIRMAR → GERAR
// `interpretSketch` não grava nada. Só `generatePremiumPlan` persiste.
// ─────────────────────────────────────────────────────────────────────────────

// Mesma resolução por env da IA documental (lib/aiConfig.ts), no escopo de
// visão — permite um modelo distinto via ALTAR_VISION_* sem duplicar lógica.
function makeVisionClient() {
  const cfg = getAiConfig("vision");
  return {
    client: new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL }),
    model: cfg.model,
  };
}

// Mesma regra de autorização das actions do Bloco 0: contexto de action não tem
// ctx.db, então a posse é verificada via events.get (que devolve null p/ não-dono).
async function requireEventOwnerAction(ctx: ActionCtx, eventId: Id<"events">) {
  await requireIdentity(ctx);
  // IA custa dinheiro por chamada: conta bloqueada não dispara geração nenhuma.
  await requireActiveAccessAction(ctx);
  const event = await ctx.runQuery(api.events.get, { id: eventId });
  if (!event) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });
  }
  return event;
}

/** Croqui do storage → data URL, para enviar ao modelo de visão. */
async function loadSketch(ctx: ActionCtx, storageId: Id<"_storage">) {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Croqui não encontrado no storage.",
    });
  }
  return blob;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const mime = blob.type || "image/png";
  return `data:${mime};base64,${btoa(bin)}`;
}

const EMPTY_INTERPRETATION: LayoutInterpretation = { ambientes: [], elementos: [] };

function parseInterpretation(raw: string): LayoutInterpretation {
  // Modelos às vezes embrulham o JSON em cerca de código.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return EMPTY_INTERPRETATION;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_INTERPRETATION;
  }
  const p = parsed as Record<string, unknown>;

  const ambientes = Array.isArray(p.ambientes)
    ? p.ambientes.filter((a): a is string => typeof a === "string")
    : [];

  const elementos = Array.isArray(p.elementos)
    ? p.elementos
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          tipo: typeof e.tipo === "string" ? e.tipo : "elemento",
          // Contagem nunca é inventada: valor inválido vira 0 para a decoradora
          // corrigir na revisão, em vez de um número plausível e errado.
          quantidade:
            typeof e.quantidade === "number" && Number.isFinite(e.quantidade)
              ? Math.max(0, Math.round(e.quantidade))
              : 0,
          observacao: typeof e.observacao === "string" ? e.observacao : undefined,
        }))
    : [];

  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);

  return {
    ambientes,
    elementos,
    circulacao: str("circulacao"),
    acessos: str("acessos"),
    observacoes: str("observacoes"),
  };
}

// ── Etapa 1: interpretar o croqui (NÃO grava nada) ───────────────────────────

export const interpretSketch = action({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<LayoutInterpretation> => {
    await requireEventOwnerAction(ctx, args.eventId);

    const blob = await loadSketch(ctx, args.storageId);
    const dataUrl = await blobToDataUrl(blob);
    const { client, model } = makeVisionClient();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: INTERPRETATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            {
              type: "text",
              text: "Leia este croqui e devolva o JSON estruturado. Conte os elementos com precisão.",
            },
          ],
        },
      ],
    });

    return parseInterpretation(response.choices[0]?.message?.content ?? "{}");
  },
});

// ── Etapa 2: gerar a Planta Premium (image-to-image) ─────────────────────────

export const generatePremiumPlan = action({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    filename: v.string(),
    interpretation: v.object({
      ambientes: v.array(v.string()),
      elementos: v.array(
        v.object({
          tipo: v.string(),
          quantidade: v.number(),
          observacao: v.optional(v.string()),
        }),
      ),
      circulacao: v.optional(v.string()),
      acessos: v.optional(v.string()),
      observacoes: v.optional(v.string()),
    }),
    corrections: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ renderId: Id<"layoutRenders"> }> => {
    await requireEventOwnerAction(ctx, args.eventId);

    // Falha ANTES de criar qualquer linha de histórico quando não há provedor.
    const config = getImageProviderConfig();
    if (!config) {
      throw new ConvexError({
        code: "IMAGE_PROVIDER_UNCONFIGURED",
        message: IMAGE_PROVIDER_UNCONFIGURED_MESSAGE,
      });
    }

    const prompt = buildPremiumPlanPrompt(args.interpretation, args.corrections);

    // A linha nasce como "generating": mesmo se a geração falhar, a tentativa
    // fica registrada no histórico com o motivo.
    const renderId: Id<"layoutRenders"> = await ctx.runMutation(
      internal.layoutRenders.createRender,
      {
        eventId: args.eventId,
        originalSketchStorageId: args.storageId,
        originalSketchFilename: args.filename,
        interpretation: args.interpretation,
        corrections: args.corrections,
        provider: config.label,
        model: config.model,
        promptVersion: PROMPT_VERSION,
        promptSnapshot: prompt,
      },
    );

    try {
      const blob = await loadSketch(ctx, args.storageId);
      const provider = getImageProvider();

      const generated = await provider.editFromImage({
        image: blob,
        filename: args.filename || "croqui.png",
        prompt,
      });

      // O croqui original permanece intocado no storage — o render vai para um
      // arquivo novo.
      const outputStorageId = await ctx.storage.store(
        new Blob([generated.bytes as BlobPart], { type: generated.mimeType }),
      );

      await ctx.runMutation(internal.layoutRenders.markRenderDone, {
        id: renderId,
        outputStorageId,
      });
    } catch (err) {
      const message =
        err instanceof ConvexError
          ? String((err.data as { message?: string })?.message ?? "Erro na geração")
          : err instanceof Error
            ? err.message
            : "Erro desconhecido na geração";
      await ctx.runMutation(internal.layoutRenders.markRenderFailed, {
        id: renderId,
        errorMessage: message,
      });
      throw err;
    }

    return { renderId };
  },
});
