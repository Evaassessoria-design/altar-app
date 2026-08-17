import OpenAI, { toFile } from "openai";
import { ConvexError } from "convex/values";
import {
  getImageProviderConfig,
  IMAGE_PROVIDER_UNCONFIGURED_MESSAGE,
} from "./imageProviderConfig";

// ─────────────────────────────────────────────────────────────────────────────
// ImageGenerationProvider — abstração da geração/edição de imagem da IA Visual.
//
// Nada acima desta camada (aiVisual.ts, Convex, React) conhece o provedor. Para
// trocar de fornecedor no futuro basta escrever outra implementação desta
// interface e apontar `getImageProvider()` para ela — ou, no caso de qualquer
// endpoint OpenAI-compatible, apenas mudar as envs ALTAR_IMAGE_*.
//
// REGRA DO ALTAR: só usamos EDIÇÃO a partir do croqui original (image-to-image).
// Não existe caminho de geração livre aqui — de propósito. Gerar do zero
// produziria um projeto novo, e a regra absoluta é preservar a geometria.
// ─────────────────────────────────────────────────────────────────────────────

export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536" | "auto";

export type ImageEditRequest = {
  /** Croqui original — a base que o modelo deve reconstruir, não recriar. */
  image: Blob;
  filename: string;
  prompt: string;
  size?: ImageSize;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: string;
};

export interface ImageGenerationProvider {
  /** Rótulo gravado no histórico (ex.: host do endpoint). */
  readonly name: string;
  readonly model: string;
  readonly supportsImageToImage: boolean;
  editFromImage(req: ImageEditRequest): Promise<GeneratedImage>;
}

function isBadRequest(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 400
  );
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Implementação para qualquer endpoint OpenAI-compatible que exponha
 * `POST /images/edits`. Cobre a API da OpenAI e gateways compatíveis.
 */
function createOpenAICompatibleProvider(): ImageGenerationProvider {
  const config = getImageProviderConfig();
  if (!config) {
    throw new ConvexError({
      code: "IMAGE_PROVIDER_UNCONFIGURED",
      message: IMAGE_PROVIDER_UNCONFIGURED_MESSAGE,
    });
  }

  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });

  return {
    name: config.label,
    model: config.model,
    supportsImageToImage: true,

    async editFromImage(req: ImageEditRequest): Promise<GeneratedImage> {
      const file = await toFile(req.image, req.filename, {
        type: req.image.type || "image/png",
      });

      const params = {
        model: config.model,
        image: file,
        prompt: req.prompt,
        size: req.size ?? "1024x1024",
        n: 1,
      } as const;

      // `input_fidelity: "high"` é a alavanca que faz o modelo respeitar a
      // composição da imagem de entrada — essencial para preservar geometria.
      // Nem todo endpoint compatível aceita o parâmetro; se recusar com 400,
      // repetimos sem ele em vez de falhar a geração inteira.
      let response;
      try {
        response = await client.images.edit({ ...params, input_fidelity: "high" });
      } catch (err) {
        if (!isBadRequest(err)) throw err;
        response = await client.images.edit({ ...params });
      }

      const first = response.data?.[0];

      if (first?.b64_json) {
        return { bytes: decodeBase64(first.b64_json), mimeType: "image/png" };
      }

      // Provedores que devolvem URL em vez de base64.
      if (first?.url) {
        const res = await fetch(first.url);
        if (!res.ok) {
          throw new ConvexError({
            code: "EXTERNAL_SERVICE_ERROR",
            message: `Não foi possível baixar a imagem gerada (HTTP ${res.status}).`,
          });
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        return {
          bytes: buf,
          mimeType: res.headers.get("content-type") ?? "image/png",
        };
      }

      throw new ConvexError({
        code: "EXTERNAL_SERVICE_ERROR",
        message: "O provedor de imagem não retornou nenhuma imagem.",
      });
    },
  };
}

/**
 * Provedor ativo do ambiente. Lança ConvexError com mensagem clara quando não
 * há configuração — nunca devolve um provedor "de mentira" nem inventa imagem.
 */
export function getImageProvider(): ImageGenerationProvider {
  return createOpenAICompatibleProvider();
}
