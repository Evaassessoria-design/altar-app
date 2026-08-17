// ─────────────────────────────────────────────────────────────────────────────
// Configuração do provedor de imagem da IA Visual.
//
// Módulo SEM dependências de propósito: o runtime V8 (queries/mutations) precisa
// saber apenas SE existe provedor configurado, sem arrastar o SDK da OpenAI —
// que só pode ser carregado no runtime Node. A implementação real vive em
// lib/imageProvider.ts.
//
// O provedor é definido EXCLUSIVAMENTE por variável de ambiente. Não há default
// apontando para o Hercules (nem para ninguém): trocar de provedor é trocar env,
// sem tocar em uma linha de código do ALTAR.
//
//   ALTAR_IMAGE_BASE_URL  → endpoint OpenAI-compatible (…/v1)
//   ALTAR_IMAGE_API_KEY   → chave do provedor
//   ALTAR_IMAGE_MODEL     → modelo de edição de imagem (default: gpt-image-1)
// ─────────────────────────────────────────────────────────────────────────────

export const IMAGE_PROVIDER_UNCONFIGURED_MESSAGE =
  "Provedor de imagem não configurado para este ambiente.";

export type ImageProviderConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  /** Rótulo do provedor gravado no histórico (host do endpoint). */
  label: string;
};

/** Config completa, ou `null` quando o ambiente não tem provedor definido. */
export function getImageProviderConfig(): ImageProviderConfig | null {
  const baseURL = process.env.ALTAR_IMAGE_BASE_URL?.trim();
  const apiKey = process.env.ALTAR_IMAGE_API_KEY?.trim();
  if (!baseURL || !apiKey) return null;

  const model = process.env.ALTAR_IMAGE_MODEL?.trim() || "gpt-image-1";

  // Rótulo derivado do host — nunca inclui a chave.
  let label = "openai-compatible";
  try {
    label = new URL(baseURL).host;
  } catch {
    // baseURL malformada: mantém o rótulo genérico.
  }

  return { baseURL, apiKey, model, label };
}

export function isImageProviderConfigured(): boolean {
  return getImageProviderConfig() !== null;
}
