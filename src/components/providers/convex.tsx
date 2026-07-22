import { ConvexReactClient } from "convex/react";
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client.ts";

// URL do deployment Convex (produção: definir VITE_CONVEX_URL na Vercel).
const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";
const convex = new ConvexReactClient(convexUrl, { expectAuth: true });

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  // O `authClient` é um cliente Better Auth válido; a prop do provider usa uma
  // união de tipos que não infere 1:1 com o retorno de createAuthClient nesta
  // versão. A asserção apenas reconcilia esse detalhe de tipagem da lib — o
  // cliente mantém sua tipagem completa para uso na UI.
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient as unknown as AuthClient}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
