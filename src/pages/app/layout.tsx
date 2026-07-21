import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { cn } from "@/lib/utils.ts";
import { NotificationCenter } from "@/components/notification-center.tsx";
import { OnboardingModal } from "@/components/onboarding-modal.tsx";
import { useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";

const navItems = [
  { to: "/eventos", icon: CalendarDays, label: "Eventos" },
  { to: "/equipe", icon: Users, label: "Equipe" },
  { to: "/compras", icon: ShoppingCart, label: "Compras" },
  { to: "/financeiro", icon: DollarSign, label: "Financeiro" },
  { to: "/funil", icon: BarChart3, label: "Funil" },
];

const bottomNavItems = [
  { to: "/eventos", icon: CalendarDays, label: "Eventos" },
  { to: "/equipe", icon: Users, label: "Equipe" },
  { to: "/compras", icon: ShoppingCart, label: "Compras" },
  { to: "/financeiro", icon: DollarSign, label: "Financeiro" },
  { to: "/configuracoes", icon: Settings, label: "Config." },
];

function TrialBanner() {
  const status = useQuery(api.users.getSubscriptionStatus);
  const currentUser = useQuery(api.users.getCurrentUser);
  const createCheckout = useAction(api.asaas.createCheckoutSession);
  const [loading, setLoading] = useState(false);

  if (!status || status.subscriptionStatus !== "trial") return null;
  const daysLeft = (status as { daysLeft?: number }).daysLeft;
  if (daysLeft === undefined || daysLeft > 7) return null;

  const handleSubscribe = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const { paymentUrl } = await createCheckout({
        userName: currentUser.name ?? "Usuário",
        userEmail: currentUser.email ?? "",
        userId: currentUser._id,
        existingCustomerId: currentUser.asaasCustomerId,
      });
      window.open(paymentUrl, "_blank");
    } catch (err) {
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
      <span>
        {daysLeft <= 0
          ? "Seu período de teste expirou."
          : `Seu trial termina em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}.`}
      </span>
      <Button size="sm" className="cursor-pointer gap-1.5 h-7 text-xs" onClick={handleSubscribe} disabled={loading}>
        <Sparkles className="size-3" />
        {loading ? "Aguarde..." : "Assinar agora"}
      </Button>
    </div>
  );
}

function AppLayoutInner() {
  const { signout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useQuery(api.admin.isAdmin);
  const currentUser = useQuery(api.users.getCurrentUser);

  // Show onboarding modal for users who haven't completed it
  const [showOnboarding, setShowOnboarding] = useState(false);
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
    <div className="flex h-screen bg-background">
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
          <Outlet context={{ onOpenOnboarding: () => setShowOnboarding(true) }} />
        </main>

        {/* Bottom nav — mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-40">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
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
