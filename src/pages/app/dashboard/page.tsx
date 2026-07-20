import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare,
  DollarSign,
  ShoppingCart,
  ArrowRight,
  Plus,
  TrendingUp,
  Clock,
  BarChart3,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OnboardingBanner } from "@/components/onboarding-banner.tsx";
import { useState } from "react";
import { motion } from "motion/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import EventFormDialog from "../events/_components/event-form-dialog.tsx";
import { toast } from "sonner";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-yellow-400",
  confirmed: "bg-blue-400",
  in_progress: "bg-orange-400",
  completed: "bg-green-400",
  cancelled: "bg-zinc-300",
};
const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  confirmed: "Confirmado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const PHASE_LABELS: Record<string, string> = {
  pre: "Carregamento",
  post: "Conferência",
};

// ─── Countdown helper ─────────────────────────────────────────────────────────

function useCountdown(isoDate: string) {
  const target = new Date(isoDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return { days: 0, hours: 0, minutes: 0, past: true };
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, past: false };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className="bg-card rounded-xl border border-border p-4 space-y-2"
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.name === "count" ? `${p.value} evento${p.value !== 1 ? "s" : ""}` : p.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const stats = useQuery(api.dashboard.getDashboardStats);
  const createEvent = useMutation(api.events.create);
  const navigate = useNavigate();
  const [creatingEvent, setCreatingEvent] = useState(false);
  const { onOpenOnboarding } = useOutletContext<{ onOpenOnboarding: () => void }>();

  const handleCreateEvent = async (values: Parameters<typeof createEvent>[0]) => {
    const id = await createEvent(values);
    toast.success("Evento criado!");
    setCreatingEvent(false);
    navigate(`/eventos/${id}`);
  };

  // Countdown for next event — always call hook, pass empty string when no event
  const rawCountdown = useCountdown(stats?.nextEvent?.date ?? "");
  const countdown = stats?.nextEvent ? rawCountdown : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Onboarding banner */}
      <OnboardingBanner onOpenOnboarding={onOpenOnboarding} />
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <Button onClick={() => setCreatingEvent(true)} className="cursor-pointer gap-2" size="sm">
          <Plus className="size-4" /> Novo Evento
        </Button>
      </motion.div>

      {/* Stat cards */}
      {stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<CalendarDays className="size-4 text-primary" />}
            label="Próximos Eventos"
            value={stats.upcomingCount}
            sub={`${stats.totalEvents} no total`}
            delay={0}
          />
          <StatCard
            icon={<DollarSign className="size-4 text-green-500" />}
            label="Receita do Mês"
            value={stats.revenueThisMonth.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            sub={`Despesas: ${stats.expensesThisMonth.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
            delay={0.05}
          />
          <StatCard
            icon={<CheckSquare className="size-4 text-orange-500" />}
            label="Itens Pendentes"
            value={stats.pendingChecklistCount}
            sub="checklists próx. 30 dias"
            delay={0.1}
          />
          <StatCard
            icon={<ShoppingCart className="size-4 text-blue-500" />}
            label="Compras Pendentes"
            value={stats.pendingPurchasesCount}
            sub="nos próximos eventos"
            delay={0.15}
          />
        </div>
      )}

      {/* Next event countdown + Status breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="font-semibold">Próximo Evento</h2>
          </div>
          {stats === undefined ? (
            <div className="p-5 space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : stats.nextEvent ? (
            <Link to={`/eventos/${stats.nextEvent._id}`} className="block p-5 hover:bg-accent/30 transition-colors cursor-pointer">
              <p className="font-semibold text-base mb-1">{stats.nextEvent.name}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {format(new Date(stats.nextEvent.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {stats.nextEvent.location}
              </p>
              {countdown && !countdown.past && (
                <div className="flex gap-3">
                  {[
                    { value: countdown.days, unit: "dias" },
                    { value: countdown.hours, unit: "horas" },
                    { value: countdown.minutes, unit: "min" },
                  ].map(({ value, unit }) => (
                    <div key={unit} className="flex-1 bg-primary/8 rounded-lg p-2 text-center">
                      <p className="text-xl font-bold text-primary">{value}</p>
                      <p className="text-xs text-muted-foreground">{unit}</p>
                    </div>
                  ))}
                </div>
              )}
              {countdown?.past && (
                <p className="text-sm text-orange-500 font-medium">Evento em andamento ou passou</p>
              )}
            </Link>
          ) : (
            <div className="p-5 text-center text-sm text-muted-foreground">
              Nenhum evento próximo.{" "}
              <button onClick={() => setCreatingEvent(true)} className="text-primary hover:underline cursor-pointer">
                Criar agora
              </button>
            </div>
          )}
        </motion.div>

        {/* Status breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25, ease: "easeOut" }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="font-semibold">Por Status</h2>
          </div>
          {stats === undefined ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="p-5 space-y-3">
              {Object.entries(stats.byStatus)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                  const pct = stats.totalEvents > 0 ? Math.round((count / stats.totalEvents) * 100) : 0;
                  return (
                    <div key={status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${STATUS_COLORS[status] ?? "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {stats.totalEvents === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhum evento ainda.
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Monthly chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3, ease: "easeOut" }}
        className="bg-card rounded-xl border border-border overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" />
          <h2 className="font-semibold">Eventos por Mês</h2>
          <span className="text-xs text-muted-foreground">(últimos 6 meses)</span>
        </div>
        <div className="p-5">
          {stats === undefined ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.monthlyData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={24}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
                <Bar dataKey="count" name="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Urgent tasks + Quick actions */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Urgent tasks */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35, ease: "easeOut" }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-orange-500" />
              <h2 className="font-semibold">O que falta fazer</h2>
            </div>
            <Link to="/compras" className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
              Ver compras <ArrowRight className="size-3" />
            </Link>
          </div>
          {stats === undefined ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : stats.urgentTasks.length === 0 ? (
            <div className="p-5 text-center text-sm text-muted-foreground">
              Tudo em dia! 🎉
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.urgentTasks.map((task, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 size-4 rounded-sm border-2 border-muted-foreground/30 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{task.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.eventName} · {PHASE_LABELS[task.phase]} ·{" "}
                      {formatDistanceToNow(new Date(task.eventDate), { locale: ptBR, addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4, ease: "easeOut" }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-semibold">Atalhos</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              { label: "Criar Evento", icon: CalendarDays, action: () => setCreatingEvent(true), color: "text-primary" },
              { label: "Ver Funil", icon: BarChart3, to: "/funil", color: "text-purple-500" },
              { label: "Compras", icon: ShoppingCart, to: "/compras", color: "text-blue-500" },
              { label: "Financeiro", icon: DollarSign, to: "/financeiro", color: "text-green-500" },
            ].map((item) =>
              item.to ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/40 hover:bg-accent transition-colors cursor-pointer"
                >
                  <item.icon className={`size-6 ${item.color}`} />
                  <span className="text-xs font-medium text-center">{item.label}</span>
                </Link>
              ) : (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/40 hover:bg-accent transition-colors cursor-pointer"
                >
                  <item.icon className={`size-6 ${item.color}`} />
                  <span className="text-xs font-medium text-center">{item.label}</span>
                </button>
              ),
            )}
          </div>

          {/* Upcoming events mini list */}
          {stats && stats.upcomingCount > 0 && (
            <div className="border-t border-border">
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Próximos eventos</span>
                <Link to="/eventos" className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                  Ver todos <ArrowRight className="size-3" />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {stats.monthlyData && (
                  // Show the raw upcoming from nextEvent indicator
                  stats.nextEvent && (
                    <Link
                      to={`/eventos/${stats.nextEvent._id}`}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer"
                    >
                      <p className="text-sm font-medium truncate">{stats.nextEvent.name}</p>
                      <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {format(new Date(stats.nextEvent.date), "dd/MM", { locale: ptBR })}
                      </p>
                    </Link>
                  )
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Create event dialog */}
      {creatingEvent && (
        <EventFormDialog
          open={creatingEvent}
          onClose={() => setCreatingEvent(false)}
          onSubmit={handleCreateEvent}
          title="Novo Evento"
        />
      )}
    </div>
  );
}
