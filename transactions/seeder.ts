// Local do arquivo: transactions/seeder.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Registra o plano de Fundadora da Altar no banco de dados
export const seedPlans = mutation({
  args: {},
  handler: async (ctx: any) => {
    // Verifica se o plano já existe para não duplicar
    const existingPlan = await ctx.db
      .query("plans")
      .filter((q: any) => q.eq(q.field("name"), "Plano Fundadora"))
      .unique();

    if (existingPlan) {
      return { status: "Plan already seeded", planId: existingPlan._id };
    }

    // Insere o plano oficial de R$ 79,90 (guardado em centavos)
    const planId = await ctx.db.insert("plans", {
      name: "Plano Fundadora",
      price: 7990, 
    });

    return { status: "Plan seeded successfully", planId };
  },
});

// Adicione no final do arquivo transactions/seeder.ts

// Cria um cliente e ativa a assinatura dele manualmente para testes ou VIPs
export const createVipDecorator = mutation({
  args: {} as any,
  handler: async (ctx: any, args: any) => {
    // 1. Cria a Organização (Empresa) do Decorador
    const organizationId = await ctx.db.insert("organizations", {
      name: args.companyName,
      ownerId: "MANUAL_VIP",
    });

    // 2. Busca o ID do Plano Fundadora que criamos no passo anterior
    const plan = await ctx.db
      .query("plans")
      .filter((q: any) => q.eq(q.field("name"), "Plano Fundadora"))
      .unique();

    if (!plan) throw new Error("Execute a mutation seedPlans primeiro!");

    // 3. Cria a Assinatura ATIVA com validade de 30 dias na tabela oficial
    await ctx.db.insert("subscriptions", {
      organizationId,
      asaasCustomerId: args.asaasCustomerId || "CUST_MANUAL_VIP",
      status: "ACTIVE",
      planId: plan._id,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // +30 dias
    });

    // 4. Cria o usuário do Decorador amarrado a essa empresa
    const userId = await ctx.db.insert("users", {
      name: args.decoratorName,
      email: args.email,
      tokenIdentifier: args.tokenIdentifier || "manual_token_" + Date.now(),
      organizationId,
    });

    return { success: true, organizationId, userId };
  },
});
