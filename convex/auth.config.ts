// ─────────────────────────────────────────────────────────────────────────────
// Validação server-side de tokens pelo Convex — agora via Better Auth.
// O provider resolve o JWKS dinamicamente a partir do componente Better Auth
// (sem env obrigatória). Substitui a antiga configuração OIDC do Hercules.
// ─────────────────────────────────────────────────────────────────────────────
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export default {
  providers: [getAuthConfigProvider()],
};
