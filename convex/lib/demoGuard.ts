import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVAS DO AMBIENTE DEMO
//
// Este módulo existe por UMA razão: tornar impossível que um seed de conteúdo
// para Instagram rode no banco de produção. Um seed disparado por engano lá
// inseriria um casamento fictício no meio dos dados reais de uma cliente —
// erro constrangedor, difícil de limpar e potencialmente visível para ela.
//
// São TRÊS camadas independentes. Cada uma sozinha já barraria o acidente; as
// três juntas cobrem os enganos plausíveis (variável copiada por descuido,
// deployment errado selecionado, seed rodado duas vezes).
//
//   1. Variável de ambiente — só executa com ALTAR_DEMO === "1". Essa variável
//      só é criada no projeto `altar-demo`; produção nunca a terá.
//   2. Sinais de produção — recusa se encontrar rastro de cobrança real
//      (asaasCustomerId / asaasSubscriptionId) ou usuários demais. Um banco com
//      cliente pagante NÃO é ambiente de demonstração, mesmo que alguém tenha
//      copiado a variável para lá por engano.
//   3. Idempotência — quem chama verifica se o conteúdo já existe antes de
//      inserir. Rodar de novo não duplica nem sobrescreve.
//
// Nada aqui apaga dado. O seed é somente-inserção, por construção.
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { env: Record<string, string | undefined> };

/** Acima disso, o banco não parece um ambiente de demonstração. */
const MAX_USUARIOS_EM_DEMO = 3;

export type DemoCheck = {
  ok: boolean;
  motivo?: string;
  usuarios: number;
};

/**
 * Camada 1: a variável de ambiente.
 * Separada para poder ser verificada sem tocar o banco.
 */
export function isDemoEnvFlagSet(): boolean {
  return process.env.ALTAR_DEMO === "1";
}

/**
 * Camadas 1 + 2. Lança `DEMO_ONLY` com a explicação quando qualquer uma barra.
 *
 * Chame no PRIMEIRO passo de qualquer função de demonstração, antes de ler ou
 * escrever qualquer coisa.
 */
/**
 * Camada 1 sozinha, SEM banco.
 *
 * Existe separada porque uma `action` não tem `ctx.db` e mesmo assim precisa
 * barrar antes de qualquer outra coisa. Quem tem banco continua usando
 * `assertDemoEnvironment`, que aplica esta camada e mais a de sinais de
 * produção.
 */
export function assertDemoFlag(): void {
  if (!isDemoEnvFlagSet()) {
    throw new ConvexError({
      code: "DEMO_ONLY",
      message:
        "Esta função só roda no ambiente de demonstração. Defina ALTAR_DEMO=1 " +
        "no projeto altar-demo do Convex. NUNCA defina essa variável em produção.",
    });
  }
}

export async function assertDemoEnvironment(ctx: QueryCtx | MutationCtx): Promise<void> {
  assertDemoFlag();

  // Só olhamos uma amostra: o suficiente para reconhecer produção, sem varrer
  // um banco grande.
  const usuarios = await ctx.db.query("users").take(MAX_USUARIOS_EM_DEMO + 1);

  const comCobranca = usuarios.find(
    (u) => u.asaasCustomerId !== undefined || u.asaasSubscriptionId !== undefined,
  );
  if (comCobranca) {
    throw new ConvexError({
      code: "DEMO_ONLY",
      message:
        "Recusado: este banco tem conta com cobrança registrada no Asaas, o que " +
        "indica ambiente de produção. Nenhum dado foi criado ou alterado.",
    });
  }

  if (usuarios.length > MAX_USUARIOS_EM_DEMO) {
    throw new ConvexError({
      code: "DEMO_ONLY",
      message:
        `Recusado: este banco tem mais de ${MAX_USUARIOS_EM_DEMO} usuários, o que ` +
        "não parece um ambiente de demonstração. Nenhum dado foi criado ou alterado.",
    });
  }
}

/**
 * Diagnóstico sem efeito colateral: o ambiente aceitaria o seed?
 * Serve para conferir ANTES de rodar, sem risco nenhum.
 */
export async function inspectDemoEnvironment(ctx: QueryCtx | MutationCtx): Promise<DemoCheck> {
  const usuarios = await ctx.db.query("users").take(MAX_USUARIOS_EM_DEMO + 1);

  if (!isDemoEnvFlagSet()) {
    return { ok: false, motivo: "ALTAR_DEMO não está definida como \"1\"", usuarios: usuarios.length };
  }
  if (usuarios.some((u) => u.asaasCustomerId || u.asaasSubscriptionId)) {
    return { ok: false, motivo: "há conta com cobrança Asaas — parece produção", usuarios: usuarios.length };
  }
  if (usuarios.length > MAX_USUARIOS_EM_DEMO) {
    return { ok: false, motivo: `mais de ${MAX_USUARIOS_EM_DEMO} usuários`, usuarios: usuarios.length };
  }
  return { ok: true, usuarios: usuarios.length };
}
