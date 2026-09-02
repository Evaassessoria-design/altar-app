import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import LoginPage from "./pages/auth/Login.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AppLayout from "./pages/app/layout.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ErrorBoundary } from "@/components/error-boundary.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// TELAS SOB DEMANDA
//
// O pacote inicial trazia TODAS as telas de uma vez — inclusive Admin,
// Financeiro e o gerador de PDF — antes de mostrar a primeira. Num 4G de
// galpão isso é a diferença entre abrir e desistir.
//
// Ficam de fora, carregadas junto: a página pública (`Index`) e o `Login`, que
// são a primeira coisa que qualquer pessoa vê. Adiá-las trocaria um problema
// por outro.
//
// Deep link continua funcionando: quem abre /eventos/:id/ficha-tecnica direto
// carrega aquela tela e só ela.
// ─────────────────────────────────────────────────────────────────────────────
const Dashboard = lazy(() => import("./pages/app/dashboard/page.tsx"));
const Events = lazy(() => import("./pages/app/events/page.tsx"));
const EventDetails = lazy(() => import("./pages/app/events/[id]/page.tsx"));
const EventBriefing = lazy(() => import("./pages/app/events/[id]/briefing/page.tsx"));
const EventChecklist = lazy(() => import("./pages/app/events/[id]/checklist/page.tsx"));
const OrcamentoPage = lazy(() => import("./pages/app/events/[id]/orcamento/page.tsx"));
const GaleriaPage = lazy(() => import("./pages/app/events/[id]/fotos/page.tsx"));
const FornecedoresPage = lazy(() => import("./pages/app/events/[id]/fornecedores/page.tsx"));
const PlantaPage = lazy(() => import("./pages/app/events/[id]/planta/page.tsx"));
const ProjetoDecoracaoPage = lazy(() => import("./pages/app/events/[id]/projeto/page.tsx"));
const FichaTecnicaPage = lazy(() => import("./pages/app/events/[id]/ficha-tecnica/page.tsx"));
const AcervoPage = lazy(() => import("./pages/app/acervo/page.tsx"));
const AcervoDoEventoPage = lazy(() => import("./pages/app/events/[id]/acervo/page.tsx"));
const ConfiguracoesPage = lazy(() => import("./pages/app/configuracoes/page.tsx"));
const CatalogoFornecedoresPage = lazy(() => import("./pages/app/fornecedores/page.tsx"));
const EquipePage = lazy(() => import("./pages/app/equipe/page.tsx"));
const ComprasPage = lazy(() => import("./pages/app/compras/page.tsx"));
const FinanceiroPage = lazy(() => import("./pages/app/financeiro/page.tsx"));
const FunilPage = lazy(() => import("./pages/app/funil/page.tsx"));
const AdminPage = lazy(() => import("./pages/app/admin/page.tsx"));
const PaywallPage = lazy(() => import("./pages/app/paywall/page.tsx"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPassword.tsx"));

// Guard: redirect to paywall if subscription expired
function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const status = useQuery(api.users.getSubscriptionStatus);
  const location = useLocation();

  // Allow access to configuracoes and paywall always
  const exempt = ["/configuracoes", "/paywall"];
  if (exempt.some((p) => location.pathname.startsWith(p))) return <>{children}</>;

  // A decisão vem do backend (convex/lib/access.ts). O frontend não mantém mais
  // lista de status proibidos: contas internal e beta vigente nunca são
  // bloqueadas, e client segue exatamente a regra anterior.
  if (status !== undefined && status !== null && status.access?.blocked) {
    return <Navigate to="/paywall" replace />;
  }

  return <>{children}</>;
}

/** Espera de tela cheia — so para as rotas que NAO vivem dentro da casca. */
function CarregandoPagina() {
  return (
    <div className="flex h-svh items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/redefinir-senha"
        element={<Suspense fallback={<CarregandoPagina />}><ResetPasswordPage /></Suspense>}
      />
      <Route
        path="/paywall"
        element={<Suspense fallback={<CarregandoPagina />}><PaywallPage /></Suspense>}
      />

      {/* App routes — protegidas: exigem autenticação + assinatura ativa.
          Não autenticado → volta pro início (evita tela em branco).
          Carregando auth → spinner. */}
      <Route element={
        <>
          <AuthLoading>
            <div className="flex h-svh items-center justify-center">
              <Spinner className="size-8" />
            </div>
          </AuthLoading>
          <Unauthenticated>
            <Navigate to="/" replace />
          </Unauthenticated>
          <Authenticated>
            <SubscriptionGuard>
              <AppLayout />
            </SubscriptionGuard>
          </Authenticated>
        </>
      }>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/eventos" element={<Events />} />
        <Route path="/eventos/:id" element={<EventDetails />} />
        <Route path="/eventos/:id/briefing" element={<EventBriefing />} />
        <Route path="/eventos/:id/checklist/:phase" element={<EventChecklist />} />
        <Route path="/eventos/:id/orcamento" element={<OrcamentoPage />} />
        <Route path="/eventos/:id/fotos" element={<GaleriaPage />} />
        <Route path="/eventos/:id/fornecedores" element={<FornecedoresPage />} />
        <Route path="/eventos/:id/planta" element={<PlantaPage />} />
        <Route path="/eventos/:id/projeto" element={<ProjetoDecoracaoPage />} />
        <Route path="/eventos/:id/ficha-tecnica" element={<FichaTecnicaPage />} />
        <Route path="/eventos/:id/acervo" element={<AcervoDoEventoPage />} />
        <Route path="/fornecedores" element={<CatalogoFornecedoresPage />} />
        <Route path="/equipe" element={<EquipePage />} />
        <Route path="/compras" element={<ComprasPage />} />
        <Route path="/acervo" element={<AcervoPage />} />
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
        <ErrorBoundary variant="screen">
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </DefaultProviders>
  );
}
