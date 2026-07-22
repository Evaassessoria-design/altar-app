import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { ConvexProvider } from "./convex.tsx";
import { QueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";

// Sincroniza/vincula a linha do app `users` assim que a sessão autentica
// (idempotente — toda a lógica de vínculo por e-mail vive em lib/identity.ts).
function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const sync = useMutation(api.users.syncCurrentUser);
  useEffect(() => {
    if (isAuthenticated) void sync();
  }, [isAuthenticated, sync]);
  return null;
}

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProvider>
      <SyncUser />
      <QueryClientProvider>
        <TooltipProvider>
          <ThemeProvider>
            <Toaster />
            {children}
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
