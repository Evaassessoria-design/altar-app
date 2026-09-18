import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser } from "./identity";

// ─────────────────────────────────────────────────────────────────────────────
// GUARDA ADMINISTRATIVO
//
// Extraído de convex/admin.ts, sem mudança de semântica, porque a Central de
// Comunicações precisa exatamente da mesma regra — e duas cópias divergiriam
// no dia em que uma delas fosse ajustada.
//
// Vale para tudo que é OPERAÇÃO DO SAAS ALTAR: painel administrativo,
// interessados da landing e Central de Comunicações. Nada disto é dado de
// cliente da decoradora, que continua isolado por `userId` nos guardas de
// posse de lib/identity.ts.
// ─────────────────────────────────────────────────────────────────────────────

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Acesso restrito a administradores",
    });
  }
  return user;
}
