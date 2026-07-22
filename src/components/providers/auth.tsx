import { HerculesAuthProvider } from "@usehercules/auth/react";

// Config lida do ambiente (Vite injeta VITE_* em build-time).
// O OAuth Client ID deve ser o CLIENT ID REGISTRADO no Hercules — não o App ID.
// O SDK aplica os defaults de redirect_uri (`${origin}/auth/callback`),
// response_type=code, scope e prompt, então aqui só passamos o essencial.
const authority = import.meta.env.VITE_HERCULES_OIDC_AUTHORITY as string | undefined;
const clientId = import.meta.env.VITE_HERCULES_OIDC_CLIENT_ID as string | undefined;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <HerculesAuthProvider authority={authority ?? ""} client_id={clientId ?? ""}>
      {children}
    </HerculesAuthProvider>
  );
}
