import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { resetPasswordEmail, sendEmail } from "./email";

// ─────────────────────────────────────────────────────────────────────────────
// Better Auth rodando DENTRO do Convex (componente oficial @convex-dev/better-auth).
// E-mail/senha com recuperação de senha via Resend (convex/email.ts).
// requireEmailVerification segue desligado nesta fase — decisão de produto.
//
// Env exigidas no deployment do Convex:
//   BETTER_AUTH_SECRET  → npx convex env set BETTER_AUTH_SECRET "<random>"
//   SITE_URL            → URL do frontend (ex.: http://localhost:5173 em dev)
//   RESEND_API_KEY      → chave do Resend (e-mail de redefinição de senha)
//   EMAIL_FROM          → remetente, ex.: ALTAR <no-reply@appaltar.com.br>
//
// IMPORTANTE: nenhuma função de negócio deve importar nada daqui além do que o
// módulo central de identidade expõe (será criado na fase de identidade).
// ─────────────────────────────────────────────────────────────────────────────

const siteUrl = process.env.SITE_URL!;

// Origem extra TEMPORÁRIA para teste de Preview (ex.: URL exata *.vercel.app do
// deploy de preview). É opcional: se PREVIEW_TRUSTED_ORIGIN não estiver definida,
// nada muda e apenas `siteUrl` (produção) é confiável. Para remover depois do
// teste, basta apagar a env no Convex: `npx convex env remove PREVIEW_TRUSTED_ORIGIN`.
const previewOrigin = process.env.PREVIEW_TRUSTED_ORIGIN;
const trustedOrigins = previewOrigin ? [siteUrl, previewOrigin] : [siteUrl];

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // Token de redefinição válido por 1 hora, de uso único.
      resetPasswordTokenExpiresIn: 3600,
      // Quem redefine a senha perde todas as sessões antigas: o cenário provável
      // é conta comprometida ou esquecida, e manter sessões vivas seria o risco.
      revokeSessionsOnPasswordReset: true,
      // Chamado pelo Better Auth em POST /request-password-reset. A url já vem
      // pronta e aponta para o callback do próprio Better Auth, que valida o
      // token antes de redirecionar para a nossa página. Nunca lança: falha de
      // envio não pode revelar se o e-mail existe na base.
      sendResetPassword: async ({ user, url }) => {
        const { subject, html, text } = resetPasswordEmail(url, user.name);
        await sendEmail({ to: user.email, subject, html, text });
      },
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
