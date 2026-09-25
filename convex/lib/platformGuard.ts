import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser } from "./identity";

// ─────────────────────────────────────────────────────────────────────────────
// O DONO DA PLATAFORMA
//
// ── POR QUE NÃO BASTA `requireAdmin` ────────────────────────────────────────
// `role: "admin"` responde por OPERAR o SaaS: painel, interessados da landing,
// Central de Comunicações. É um papel de suporte, e um dia haverá mais de uma
// pessoa com ele — alguém que atende assinante não precisa (e não deve)
// enxergar métricas de receita nem a ferramenta interna de IA do negócio.
//
// `platformOwner` responde por outra coisa: ADMINISTRAR O NEGÓCIO ALTAR. Hoje
// é uma conta só.
//
// ── E POR QUE NENHUM DOS OUTROS ESTADOS PROMOVE NINGUÉM ─────────────────────
// `accessType: "internal"` e `"beta"` são isenções de COBRANÇA. Uma conta
// interna é uma decoradora que não paga — não é dona de nada. Tratar isenção
// como poder seria a escalada de privilégio mais barata que este produto
// poderia ter, e ela aconteceria em silêncio, no dia em que alguém liberasse
// uma cortesia.
//
// Por isso a guarda lê UM campo, e só ele.
//
// ── NENHUMA IDENTIDADE NO CÓDIGO ────────────────────────────────────────────
// Não há nome, e-mail nem id pessoal aqui. Quem é o dono é DADO, concedido por
// um ato deliberado (`admin.grantPlatformOwnerByEmail`) por quem já tem acesso
// ao deployment. Trocar a pessoa não é mexer em código.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exige a conta que administra o negócio ALTAR.
 *
 * NOT_FOUND e não FORBIDDEN de propósito: a superfície interna não confirma a
 * própria existência para quem não é dono. "Acesso negado" já conta que há
 * algo ali — é a mesma regra que o produto usa para dado de outra conta.
 */
export async function requirePlatformOwner(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.platformOwner !== true) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Recurso não encontrado" });
  }
  return user;
}

/** É o dono? Para a tela decidir se mostra a entrada. Nunca é a trava. */
export async function ehPlatformOwner(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  try {
    const user = await requireUser(ctx);
    return user.platformOwner === true;
  } catch {
    return false;
  }
}
