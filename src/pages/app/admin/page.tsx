import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  Users,
  TrendingUp,
  DollarSign,
  CalendarDays,
  Shield,
  ShieldOff,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  trial: {
    label: "Trial",
    icon: <Clock className="size-3" />,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  active: {
    label: "Ativo",
    icon: <CheckCircle className="size-3" />,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  expired: {
    label: "Expirado",
    icon: <XCircle className="size-3" />,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  cancelled: {
    label: "Cancelado",
    icon: <XCircle className="size-3" />,
    className: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
};

export default function AdminPage() {
  const navigate = useNavigate();
  const isAdmin = useQuery(api.admin.isAdmin);
  const stats = useQuery(api.admin.getStats);
  const users = useQuery(api.admin.listUsers);

  const updateSubscription = useMutation(api.admin.updateUserSubscription);
  const updateRole = useMutation(api.admin.updateUserRole);
  const deleteUser = useMutation(api.admin.deleteUser);

  const [deletingId, setDeletingId] = useState<Id<"users"> | null>(null);
  const [searchQ, setSearchQ] = useState("");

  // Redirect non-admins
  useEffect(() => {
    if (isAdmin === false) navigate("/dashboard");
  }, [isAdmin, navigate]);

  if (isAdmin === undefined || isAdmin === false) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const filteredUsers = (users ?? []).filter((u) => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  const handleSubscription = async (
    userId: Id<"users">,
    status: "trial" | "active" | "expired" | "cancelled",
    label: string,
  ) => {
    try {
      await updateSubscription({ userId, status });
      toast.success(`Assinatura alterada para ${label}`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao alterar assinatura");
    }
  };

  const handleRole = async (userId: Id<"users">, role: "admin" | "user") => {
    try {
      await updateRole({ userId, role });
      toast.success(`Função alterada para ${role === "admin" ? "Admin" : "Usuário"}`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao alterar função");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteUser({ userId: deletingId });
      toast.success("Usuário excluído.");
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao excluir usuário");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="size-6 text-primary" /> Painel Administrativo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão de usuários e assinaturas</p>
        </div>
      </div>

      {/* Stat cards */}
      {stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="size-5 text-primary" />}
            label="Total de Usuários"
            value={stats.total.toString()}
            sub={`${stats.trial} em trial · ${stats.expired} expirados`}
          />
          <StatCard
            icon={<CheckCircle className="size-5 text-green-500" />}
            label="Assinantes Ativos"
            value={stats.active.toString()}
            sub={`Taxa de conversão: ${stats.conversionRate}%`}
          />
          <StatCard
            icon={<DollarSign className="size-5 text-primary" />}
            label="MRR"
            value={stats.mrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            sub="R$79,90 × assinantes ativos"
          />
          <StatCard
            icon={<CalendarDays className="size-5 text-blue-500" />}
            label="Total de Eventos"
            value={stats.eventsTotal.toString()}
            sub="Criados por todos os usuários"
          />
        </div>
      )}

      {/* Subscription breakdown */}
      {stats && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Distribuição de Assinaturas
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "trial", count: stats.trial, label: "Trial" },
              { key: "active", count: stats.active, label: "Ativo" },
              { key: "expired", count: stats.expired, label: "Expirado" },
              { key: "cancelled", count: stats.cancelled, label: "Cancelado" },
            ].map(({ key, count, label }) => {
              const cfg = STATUS_CONFIG[key];
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="size-4 text-primary" /> Usuários
            {users !== undefined && (
              <span className="text-xs font-normal text-muted-foreground">({users.length})</span>
            )}
          </h2>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="text-sm border border-input rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-64"
          />
        </div>

        {users === undefined ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {searchQ ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Cadastro</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Função</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Eventos</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((u) => {
                  const statusCfg = STATUS_CONFIG[u.subscriptionStatus ?? "trial"];
                  return (
                    <tr key={u._id} className="hover:bg-accent/30 transition-colors">
                      {/* Name/email */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {(u.name ?? u.email ?? "?").slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>

                      {/* Created at */}
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                        {format(new Date(u._creationTime), "dd/MM/yyyy", { locale: ptBR })}
                      </td>

                      {/* Status badge */}
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg?.className ?? ""}`}>
                          {statusCfg?.icon}
                          {statusCfg?.label ?? u.subscriptionStatus}
                        </span>
                        {u.subscriptionStatus === "trial" && u.trialEndDate && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            até {format(new Date(u.trialEndDate), "dd/MM", { locale: ptBR })}
                          </p>
                        )}
                      </td>

                      {/* Role */}
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === "admin"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {u.role === "admin" ? "Admin" : "Usuário"}
                        </span>
                      </td>

                      {/* Event count */}
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell text-center">
                        {u.eventCount}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                              <ChevronDown className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onClick={() => void handleSubscription(u._id, "active", "Ativo")}
                              className="cursor-pointer gap-2"
                            >
                              <CheckCircle className="size-4 text-green-500" /> Ativar assinatura
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleSubscription(u._id, "trial", "Trial")}
                              className="cursor-pointer gap-2"
                            >
                              <RefreshCw className="size-4 text-yellow-500" /> Renovar trial (+14d)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleSubscription(u._id, "expired", "Expirado")}
                              className="cursor-pointer gap-2"
                            >
                              <XCircle className="size-4 text-red-400" /> Expirar assinatura
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.role !== "admin" ? (
                              <DropdownMenuItem
                                onClick={() => void handleRole(u._id, "admin")}
                                className="cursor-pointer gap-2"
                              >
                                <Shield className="size-4 text-primary" /> Tornar admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => void handleRole(u._id, "user")}
                                className="cursor-pointer gap-2"
                              >
                                <ShieldOff className="size-4 text-muted-foreground" /> Remover admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingId(u._id)}
                              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" /> Excluir usuário
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados do usuário serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
