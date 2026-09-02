import { Outlet, NavLink, useNavigate, Link, useLocation } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  CalendarDays,
  Users,
  ShoppingCart,
  DollarSign,
  BarChart3,
  LogOut,
  Shield,
  Settings,
  Sparkles,
  Home,
  Building2,
  Menu,
  Boxes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { cn } from "@/lib/utils.ts";
import { BOTTOM_NAV_ITEMS, MORE_MENU_ITEMS, NAV_ITEMS } from "@/lib/navigation.ts";
import type { RotaDeMenu } from "@/lib/navigation.ts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { NotificationCenter } from "@/components/notification-center.tsx";
import { useLastSeen } from "@/hooks/use-last-seen.ts";
import { OnboardingModal } from "@/components/onboarding-modal.tsx";
import { ErrorBoundary } from "@/components/error-boundary.tsx";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";

// Rotas e rótulos vivem em src/lib/navigation.ts, conferidos por teste contra
// as rotas de App.tsx — foi assim que `/dashboard` apareceu como tela órfã.
// Aqui só amarramos cada rota ao seu ícone.
// `Record<RotaDeMenu, ...>` e nao `Record<string, ...>`: rota de menu sem
// icone passa a ser erro de compilacao, em vez de `undefined` derrubando o
// menu em tempo de execucao.
const ICONES: Record<RotaDeMenu, LucideIcon> = {
  "/dashboard": Home,
  "/eventos": CalendarDays,
  "/fornecedores": Building2,
  "/equipe": Users,
  "/acervo": Boxes,
  "/compras": ShoppingCart,
  "/financeiro": DollarSign,
  "/funil": BarChart3,
  "/configuracoes": Settings,
};

const moreMenuItems = MORE_MENU_ITEMS.map((i) => ({ ...i, icon: ICONES[i.to] }));

const navItems = NAV_ITEMS.map((i) => ({ ...i, icon: ICONES[i.to] }));
const bottomNavItems = BOTTOM_NAV_ITEMS.map((i) => ({ ...i, icon: ICONES[i.to] }));

function TrialBanner() {
  const navigate = useNavigate();
  const status = useQuery(api.users.getSubscriptionStatus);
  const currentUser = useQuery(api.users.getCurrentUser);
  const createCheckout = useAction(api.asaas.createCheckoutSession);
  const [loading, setLoading] = useState(false);

  // Duas situações merecem aviso no topo:
  //
  //  · trial acabando (comportamento que já existia, inalterado);
  //  · pagamento em atraso dentro do período de tolerância — novo, e necessário:
  //    agora a inadimplência BLOQUEIA ao fim da tolerância, e cortar o acesso
  //    sem aviso prévio seria pior do que o problema que corrigimos.
  //
  // `overdueDaysLeft` vem pronto do backend (convex/lib/access.ts); a tela não
  // recalcula prazo nenhum.
  //
  // Nenhum dos dois avisos vale para conta ISENTA DE COBRANÇA (internal, admin
  // do ALTAR, beta vigente): não há trial para acabar nem fatura para atrasar.
  // Mesma fonte da regra do sino e da tela de Configurações — `billingExempt`,
  // decidido em convex/lib/access.ts.
  const billingExempt = status?.access?.billingExempt === true;

  const overdueDaysLeft = status?.access?.overdueDaysLeft;
  const isOverdue =
    status?.subscriptionStatus === "overdue" && overdueDaysLeft !== undefined;

  const trialDaysLeft = (status as { daysLeft?: number } | null | undefined)?.daysLeft;
  const isTrialEnding =
    status?.subscriptionStatus === "trial" &&
    trialDaysLeft !== undefined &&
    trialDaysLeft <= 7;

  if (billingExempt) return null;
  if (!status || (!isTrialEnding && !isOverdue)) return null;

  const message = isOverdue
    ? `Pagamento em atraso. Regularize em ${overdueDaysLeft} dia${overdueDaysLeft === 1 ? "" : "s"} para não perder o acesso.`
    : trialDaysLeft !== undefined && trialDaysLeft <= 0
      ? "Seu período de teste expirou."
      : `Seu trial termina em ${trialDaysLeft} dia${trialDaysLeft === 1 ? "" : "s"}.`;

  const handleSubscribe = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const { paymentUrl } = await createCheckout({});
      window.open(paymentUrl, "_blank");
    } catch (err) {
      if (
        err instanceof ConvexError &&
        (err.data as { code?: string }).code === "PROFILE_INCOMPLETE"
      ) {
        toast.error("Antes de continuar, precisamos completar os dados da sua empresa.", {
          description: "Adicione o CPF ou CNPJ em Dados da Empresa para continuar sua assinatura.",
          action: { label: "Completar dados", onClick: () => navigate("/configuracoes") },
        });
        return;
      }
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : "Erro ao gerar cobrança.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-2 text-sm text-primary font-medium">
      <span>{message}</span>
      <Button size="sm" className="cursor-pointer gap-1.5 h-7 text-xs" onClick={handleSubscribe} disabled={loading}>
        <Sparkles className="size-3" />
        {loading ? "Aguarde..." : isOverdue ? "Regularizar" : "Assinar agora"}
      </Button>
    </div>
  );
}

/** Espera do conteudo, no lugar do conteudo — nunca no lugar do app. */
function CarregandoTela() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="size-6" />
    </div>
  );
}

function AppLayoutInner() {
  const { signout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = useQuery(api.admin.isAdmin);
  const currentUser = useQuery(api.users.getCurrentUser);

  // Marca presença (no máximo uma gravação a cada 30 min por usuário — a regra
  // de verdade fica no servidor, em convex/lib/presence.ts).
  useLastSeen();

  // Show onboarding modal for users who haven't completed it
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // O "Mais" fica destacado quando a tela aberta mora dentro dele — senão
  // nenhum item da barra apareceria ativo em /equipe, /fornecedores ou /funil.
  const maisEstaAtivo =
    MORE_MENU_ITEMS.some((i) => location.pathname.startsWith(i.to)) ||
    location.pathname.startsWith("/admin");
  // Trigger modal once we know user hasn't completed onboarding
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  if (currentUser !== undefined && !checkedOnboarding) {
    setCheckedOnboarding(true);
    if (!currentUser?.onboardingCompleted && !currentUser?.studioName) {
      setShowOnboarding(true);
    }
  }

  const handleSignout = async () => {
    await signout();
    navigate("/");
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent",
    );

  return (
    <div className="flex h-svh bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon/icon-192.png" alt="Altar" className="size-8 rounded-xl" />
            <span className="text-xl font-bold tracking-tight">ALTAR</span>
          </div>
          <NotificationCenter />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              <item.icon className="size-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-2 pb-1 px-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Admin</p>
              </div>
              <NavLink to="/admin" className={navLinkClass}>
                <Shield className="size-4 flex-shrink-0" />
                Painel Admin
              </NavLink>
            </>
          )}
        </nav>
        <div className="px-3 py-4 border-t border-border space-y-1">
          <NavLink to="/configuracoes" className={navLinkClass}>
            <Settings className="size-4 flex-shrink-0" />
            Configurações
          </NavLink>
          <button
            onClick={() => void handleSignout()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer w-full"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        <TrialBanner />
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border">
          <div className="flex items-center gap-2">
            <img src="/icon/icon-192.png" alt="Altar" className="size-7 rounded-lg" />
            <span className="text-lg font-bold tracking-tight">ALTAR</span>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  cn("p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors", isActive && "text-primary")
                }
              >
                <Shield className="size-5 text-muted-foreground" />
              </NavLink>
            )}
            <NotificationCenter />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
          <ErrorBoundary variant="page" resetKeys={[location.pathname]}>
            {/* A tela chega sob demanda (ver App.tsx). O limite de espera fica
                AQUI DENTRO de proposito: a barra lateral, o topo e a barra
                inferior continuam na tela enquanto o conteudo carrega. Um
                fallback de tela cheia apagaria o menu a cada navegacao — a
                pessoa veria o app inteiro sumir para reaparecer igual. */}
            <Suspense fallback={<CarregandoTela />}>
              <Outlet context={{ onOpenOnboarding: () => setShowOnboarding(true) }} />
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Bottom nav — mobile.
            Quatro destinos + "Mais". O menu lateral é `hidden md:flex`, então
            tudo que só estivesse nele ficaria inalcançável no celular. */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-40">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium transition-colors cursor-pointer min-w-0",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <item.icon className="size-5 flex-shrink-0" />
              <span className="truncate max-w-[4.5rem]">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setShowMoreMenu(true)}
            aria-label="Mais seções"
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium transition-colors cursor-pointer min-w-0",
              maisEstaAtivo ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Menu className="size-5 flex-shrink-0" />
            <span>Mais</span>
          </button>
        </nav>

        {/* "Mais" — o resto das seções, no celular. */}
        <Sheet open={showMoreMenu} onOpenChange={setShowMoreMenu}>
          <SheetContent side="bottom" className="md:hidden">
            <SheetHeader>
              <SheetTitle>Mais seções</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 px-4 pb-6">
              {moreMenuItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setShowMoreMenu(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border text-sm font-medium transition-colors cursor-pointer",
                      isActive ? "text-primary border-primary/40 bg-primary/5" : "text-foreground hover:bg-accent",
                    )
                  }
                >
                  <item.icon className="size-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setShowMoreMenu(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border text-sm font-medium transition-colors cursor-pointer",
                      isActive ? "text-primary border-primary/40 bg-primary/5" : "text-foreground hover:bg-accent",
                    )
                  }
                >
                  <Shield className="size-4 flex-shrink-0" />
                  <span className="truncate">Admin</span>
                </NavLink>
              )}
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  void handleSignout();
                }}
                className="flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <LogOut className="size-4 flex-shrink-0" />
                <span>Sair</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Onboarding modal */}
      {showOnboarding && (
        <OnboardingModal onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

export default function AppLayout() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Skeleton className="h-10 w-40" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Faça login para acessar o app</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <AppLayoutInner />
      </Authenticated>
    </>
  );
}
