import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AppLayout from "./pages/app/layout.tsx";
import Dashboard from "./pages/app/dashboard/page.tsx";
import Events from "./pages/app/events/page.tsx";
import EventDetails from "./pages/app/events/[id]/page.tsx";
import EventBriefing from "./pages/app/events/[id]/briefing/page.tsx";
import EventChecklist from "./pages/app/events/[id]/checklist/page.tsx";
import OrcamentoPage from "./pages/app/events/[id]/orcamento/page.tsx";
import GaleriaPage from "./pages/app/events/[id]/fotos/page.tsx";
import ConfiguracoesPage from "./pages/app/configuracoes/page.tsx";
import EquipePage from "./pages/app/equipe/page.tsx";
import ComprasPage from "./pages/app/compras/page.tsx";
import FinanceiroPage from "./pages/app/financeiro/page.tsx";
import FunilPage from "./pages/app/funil/page.tsx";
import AdminPage from "./pages/app/admin/page.tsx";
import PaywallPage from "./pages/app/paywall/page.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";

// Guard: redirect to paywall if subscription expired
function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const status = useQuery(api.users.getSubscriptionStatus);
  const location = useLocation();

  // Allow access to configuracoes and paywall always
  const exempt = ["/configuracoes", "/paywall", "/auth/callback"];
  if (exempt.some((p) => location.pathname.startsWith(p))) return <>{children}</>;

  // If status loaded and expired → paywall
  if (status !== undefined && status !== null && status.subscriptionStatus === "expired") {
    return <Navigate to="/paywall" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/paywall" element={<PaywallPage />} />

      {/* App routes — guarded by subscription */}
      <Route element={
        <Authenticated>
          <SubscriptionGuard>
            <AppLayout />
          </SubscriptionGuard>
        </Authenticated>
      }>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/eventos" element={<Events />} />
        <Route path="/eventos/:id" element={<EventDetails />} />
        <Route path="/eventos/:id/briefing" element={<EventBriefing />} />
        <Route path="/eventos/:id/checklist/:phase" element={<EventChecklist />} />
        <Route path="/eventos/:id/orcamento" element={<OrcamentoPage />} />
        <Route path="/eventos/:id/fotos" element={<GaleriaPage />} />
        <Route path="/equipe" element={<EquipePage />} />
        <Route path="/compras" element={<ComprasPage />} />
        <Route path="/financeiro" element={<FinanceiroPage />} />
        <Route path="/funil" element={<FunilPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  useServiceWorker();
  return (
    <DefaultProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </DefaultProviders>
  );
}
