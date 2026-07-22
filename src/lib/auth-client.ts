import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

// Cliente Better Auth (roda contra as rotas do componente no Convex).
// baseURL = URL "site" do Convex (onde o Better Auth expõe /api/auth/*).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [convexClient(), crossDomainClient()],
});
