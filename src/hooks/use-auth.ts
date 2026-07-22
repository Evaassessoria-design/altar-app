import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Hook de autenticação do app (infra Fase 4A). Interface estável para a UI —
// os componentes NÃO conhecem o Better Auth diretamente, só este hook.
// A mesma forma de antes ({ isAuthenticated, isLoading, signin, signout }) para
// não exigir mudança de layout nas telas.
// ─────────────────────────────────────────────────────────────────────────────
export function useAuth() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  const signout = useCallback(async () => {
    await authClient.signOut();
  }, []);

  // "signin" agora leva à tela de login/cadastro (formulário — Fase 4B),
  // no lugar do antigo redirect OIDC do Hercules.
  const signin = useCallback(() => {
    navigate("/login");
  }, [navigate]);

  // Better Auth reporta erros por chamada (não há estado global de erro);
  // mantido no formato antigo para compatibilidade da UI. O `as` preserva a
  // união no tipo de retorno (evita estreitamento para `null`).
  const error = null as { message: string } | null;
  return { isAuthenticated, isLoading, signin, signout, error };
}

/** Usuário da sessão Better Auth (ou null). */
export function useUser() {
  const { data } = authClient.useSession();
  return data?.user ?? null;
}
