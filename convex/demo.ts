import { internalQuery } from "./_generated/server";
import { inspectDemoEnvironment } from "./lib/demoGuard";

// ─────────────────────────────────────────────────────────────────────────────
// AMBIENTE DE DEMONSTRAÇÃO — infraestrutura.
//
// Este arquivo é o MOTOR das funções de demonstração. As travas de segurança
// vivem em lib/demoGuard.ts; o conteúdo fictício (o casamento) virá em
// lib/demoData.ts, separado de propósito para que trocar os dados nunca exija
// mexer nas proteções.
//
// Tudo aqui é interno: só executável pelo painel do Convex, por quem opera o
// deployment. Inalcançável pelo aplicativo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O ambiente aceitaria um seed de demonstração? NÃO ESCREVE NADA.
 *
 * Rode isto ANTES de qualquer seed, para confirmar que está no banco certo:
 *
 *   internal.demo.checkEnvironment  { }
 */
export const checkEnvironment = internalQuery({
  args: {},
  handler: async (ctx) => {
    const check = await inspectDemoEnvironment(ctx);
    return {
      ...check,
      proximoPasso: check.ok
        ? "Ambiente de demonstração confirmado."
        : `Bloqueado: ${check.motivo}`,
    };
  },
});
