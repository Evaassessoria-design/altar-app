// ─────────────────────────────────────────────────────────────────────────────
// Validação server-side do token OIDC (Hercules) pelo Convex.
//
// Sem isto (providers: []), o Convex NÃO consegue verificar a assinatura do JWT
// e `ctx.auth.getUserIdentity()` nunca autentica de verdade — era o buraco crítico.
//
// Defina estes secrets NO DEPLOYMENT DO CONVEX (não são VITE_, são do servidor):
//   npx convex env set HERCULES_ISSUER     "<a authority/issuer OIDC>"
//   npx convex env set HERCULES_CLIENT_ID  "<o OAuth Client ID registrado>"
//
// • HERCULES_ISSUER    → precisa bater EXATAMENTE com a claim `iss` do token
//                        (ex.: https://hercules.app  ou  https://<app>.hercules-auth.com)
// • HERCULES_CLIENT_ID → precisa bater com a claim `aud` (o OAuth Client ID correto,
//                        NÃO o App ID). É o mesmo valor de VITE_HERCULES_OIDC_CLIENT_ID.
//
// Enquanto os secrets não estiverem setados, a lista fica vazia (deploy segue
// funcionando), mas o login autenticado só valida quando ambos existirem.
// ─────────────────────────────────────────────────────────────────────────────

const issuer = process.env.HERCULES_ISSUER;
const clientId = process.env.HERCULES_CLIENT_ID;

export default {
  providers:
    issuer && clientId ? [{ domain: issuer, applicationID: clientId }] : [],
};
