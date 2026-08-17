import { ConvexError } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// Configuração dos modelos de TEXTO e VISÃO do ALTAR (IA documental + leitura
// de croqui). Segue o mesmo princípio de lib/imageProviderConfig.ts: o provedor
// é definido por env, não por código.
//
// O Hercules deixa de ser obrigatório e passa a ser apenas UMA das opções.
// Ordem de resolução da chave:
//
//   1. ALTAR_VISION_API_KEY   (só no escopo de visão — permite modelo separado)
//   2. ALTAR_AI_API_KEY       (chave dedicada do ALTAR)
//   3. OPENAI_API_KEY         (OpenAI direto)
//   4. HERCULES_API_KEY       (compatibilidade — é o que DEV usa hoje)
//
// Quando a chave vem do Hercules, aplicamos o gateway e o modelo atuais, para
// que DEV continue funcionando exatamente como antes, sem nenhuma env nova.
// Com ALTAR_AI_API_KEY ou OPENAI_API_KEY, o `baseURL` fica indefinido e o SDK
// fala direto com a OpenAI.
//
//   ALTAR_AI_API_KEY   ALTAR_AI_BASE_URL   ALTAR_AI_MODEL
//   ALTAR_VISION_API_KEY / ALTAR_VISION_BASE_URL / ALTAR_VISION_MODEL (opcionais)
// ─────────────────────────────────────────────────────────────────────────────

const HERCULES_BASE_URL = "https://ai-gateway.hercules.app/v1";
const HERCULES_MODEL = "openai/gpt-5.6-luna";

export type AiScope = "documental" | "vision";

export type AiConfig = {
  apiKey: string;
  /** `undefined` = SDK usa o endpoint padrão da OpenAI. */
  baseURL?: string;
  model: string;
  /**
   * `reasoning_effort` é aceito pelo gateway do Hercules com os valores que o
   * ALTAR usa hoje (incl. "none"). Falando direto com a OpenAI, um modelo sem
   * suporte responde 400 — então o parâmetro só é enviado quando sabemos que
   * o destino aceita.
   */
  supportsReasoningEffort: boolean;
};

function fail(message: string): never {
  throw new ConvexError({ code: "AI_PROVIDER_UNCONFIGURED", message });
}

export function getAiConfig(scope: AiScope = "documental"): AiConfig {
  const isVision = scope === "vision";

  const scopedKey = isVision ? process.env.ALTAR_VISION_API_KEY?.trim() : undefined;
  const scopedBase = isVision ? process.env.ALTAR_VISION_BASE_URL?.trim() : undefined;
  const scopedModel = isVision ? process.env.ALTAR_VISION_MODEL?.trim() : undefined;

  const altarKey = scopedKey || process.env.ALTAR_AI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const herculesKey = process.env.HERCULES_API_KEY?.trim();

  const apiKey = altarKey || openaiKey || herculesKey;
  if (!apiKey) {
    fail(
      "IA não configurada neste ambiente. Defina ALTAR_AI_API_KEY (ou OPENAI_API_KEY) nas variáveis do Convex.",
    );
  }

  // Só caímos no Hercules quando nenhuma chave própria foi definida.
  const usingHercules = !altarKey && !openaiKey && !!herculesKey;

  const baseURL =
    scopedBase || process.env.ALTAR_AI_BASE_URL?.trim() ||
    (usingHercules ? HERCULES_BASE_URL : undefined);

  const model =
    scopedModel || process.env.ALTAR_AI_MODEL?.trim() ||
    (usingHercules ? HERCULES_MODEL : undefined);

  if (!model) {
    fail(
      `Modelo de IA não definido. Defina ALTAR_AI_MODEL${isVision ? " (ou ALTAR_VISION_MODEL)" : ""} nas variáveis do Convex — ex.: "gpt-5.6-luna".`,
    );
  }

  return {
    apiKey,
    baseURL,
    model,
    // O gateway do Hercules é o único destino em que já validamos os valores
    // de reasoning_effort usados pelo ALTAR.
    supportsReasoningEffort: baseURL === HERCULES_BASE_URL,
  };
}
