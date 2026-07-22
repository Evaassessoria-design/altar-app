import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

// ─────────────────────────────────────────────────────────────────────────────
// Better Auth rodando DENTRO do Convex (componente oficial @convex-dev/better-auth).
// E-mail/senha sem verificação por enquanto (provedor de e-mail será definido
// numa fase posterior — aí ligamos requireEmailVerification e reset de senha).
//
// Env exigidas no deployment do Convex:
//   BETTER_AUTH_SECRET  → npx convex env set BETTER_AUTH_SECRET "<random>"
//   SITE_URL            → URL do frontend (ex.: http://localhost:5173 em dev)
//
// IMPORTANTE: nenhuma função de negócio deve importar nada daqui além do que o
// módulo central de identidade expõe (será criado na fase de identidade).
// ─────────────────────────────────────────────────────────────────────────────

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
