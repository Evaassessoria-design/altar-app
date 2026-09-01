import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { ConvexError } from "convex/values";
import {
  Users,
  TrendingUp,
  DollarSign,
  CalendarDays,
  Shield,
  ShieldOff,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ShieldCheck,
  FlaskConical,
  UserCheck,
  Lock,
  Activity,
  Sparkles,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

// Linha da listagem: o backend já anexa `access` (resolveAccess) e `eventCount`.
type AdminUser = NonNullable<ReturnType<typeof useAdminUsers>>[number];
function useAdminUsers() {
  return useQuery(api.admin.listUsers);
}

/** Rótulo de cada tipo de acesso. `client` também aparece — nada fica implícito. */
const ACCESS_CONFIG: Record<
  "client" | "beta" | "internal",
  { label: string; icon: React.ReactNode; className: string; note: string }
> = {
  client: {
    label: "Cliente",
    icon: <UserCheck className="size-3" />,
    className: "bg-muted text-muted-foreground",
    note: "Cobrança normal",
  },
  beta: {
    label: "Beta",
    icon: <FlaskConical className="size-3" />,
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    note: "Isenta enquanto vigente",
  },
  internal: {
    label: "Interna",
    icon: <ShieldCheck className="size-3" />,
    className: "bg-primary/15 text-primary ring-1 ring-primary/30",
    note: "Sem cobrança · fora do MRR",
  },
};

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
  // Pagamento em atraso — o acesso continua liberado enquanto o Asaas recobra.
  overdue: {
    label: "Em atraso",
    icon: <Clock className="size-3" />,
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
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
  const users = useAdminUsers();

  const updateRole = useMutation(api.admin.updateUserRole);
  const deleteUser = useMutation(api.admin.deleteUser);
  const setUserAccess = useMutation(api.admin.setUserAccess);

  const [deletingId, setDeletingId] = useState<Id<"users"> | null>(null);
  const [searchQ, setSearchQ] = useState("");
  // Diálogo de acesso beta — substitui window.prompt (que alguns navegadores
  // bloqueiam e que não valida a data enquanto o admin digita).
  const [betaTarget, setBetaTarget] = useState<AdminUser | null>(null);
  const [betaDate, setBetaDate] = useState("");
  const [savingBeta, setSavingBeta] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (isAdmin === false) navigate("/dashboard");
  }, [isAdmin, navigate]);

  if (isAdmin === undefined || isAdmin === false) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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

  // NÃO existe ação de assinatura aqui, e isso é deliberado. O estado de
  // cobrança (trial/active/overdue/expired/cancelled) é escrito somente pelo
  // fluxo Asaas → webhook (internalMutations em convex/users.ts). Um botão que
  // gravasse "active" à mão criaria acesso pago sem assinatura no Asaas e
  // inflaria MRR/conversão. Acesso de cortesia se faz por accessType.
  const handleRole = async (userId: Id<"users">, role: "admin" | "user") => {
    try {
      await updateRole({ userId, role });
      toast.success(`Função alterada para ${role === "admin" ? "Admin" : "Usuário"}`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao alterar função");
    }
  };

  // Único caminho de alteração de tipo de acesso na tela: admin.setUserAccess.
  // Nada aqui toca cobrança no Asaas — trocar para internal/beta apenas isenta
  // a conta (a guarda de checkout e o MRR leem a mesma regra no backend).
  const applyAccess = async (
    userId: Id<"users">,
    accessType: "client" | "beta" | "internal",
    accessExpiresAt?: number,
  ) => {
    await setUserAccess({ userId, accessType, accessExpiresAt });
    toast.success(
      accessType === "internal"
        ? "Conta marcada como interna. Não gera cobrança nem entra no MRR."
        : accessType === "beta"
          ? "Acesso beta definido."
          : "Conta voltou ao acesso de cliente.",
    );
  };

  const handleAccess = async (
    userId: Id<"users">,
    accessType: "client" | "internal",
  ) => {
    try {
      await applyAccess(userId, accessType);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao definir o acesso");
    }
  };

  // Beta exige data de validade — a mutation recusa beta sem ela, então o
  // diálogo já entra com um padrão de 90 dias e valida antes de enviar.
  const openBetaDialog = (u: AdminUser) => {
    const current = u.accessExpiresAt ?? Date.now() + 90 * 86400000;
    setBetaDate(toDateInput(current));
    setBetaTarget(u);
  };

  const confirmBeta = async () => {
    if (!betaTarget) return;
    const parsed = Date.parse(betaDate + "T23:59:59");
    if (!betaDate || Number.isNaN(parsed)) {
      toast.error("Data inválida. Use o formato AAAA-MM-DD.");
      return;
    }
    setSavingBeta(true);
    try {
      await applyAccess(betaTarget._id, "beta", parsed);
      setBetaTarget(null);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao definir o acesso");
    } finally {
      setSavingBeta(false);
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
          <p className="text-sm text-muted-foreground mt-0.5">Gestão de usuários e tipos de acesso</p>
        </div>
      </div>

      {/* Stat cards */}
      {stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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
            sub="R$119,90 × assinantes ativos"
          />
          {/* Inadimplência separada em "ainda tem prazo" × "já perdeu o acesso":
              são conversas comerciais diferentes com o cliente. */}
          <StatCard
            icon={<Clock className="size-5 text-orange-500" />}
            label="Inadimplentes"
            value={stats.overdue.toString()}
            sub={
              stats.overdueBlocked > 0
                ? `${stats.overdueBlocked} já bloqueado${stats.overdueBlocked === 1 ? "" : "s"}`
                : "todos dentro da tolerância"
            }
          />
          <StatCard
            icon={<XCircle className="size-5 text-zinc-400" />}
            label="Cancelados"
            value={stats.cancelled.toString()}
            sub="Assinaturas encerradas"
          />
          <StatCard
            icon={<ShieldCheck className="size-5 text-primary" />}
            label="Contas Especiais"
            value={stats.exemptTotal.toString()}
            sub={`${stats.internal} internas · ${stats.beta} beta — fora do MRR`}
          />
          <StatCard
            icon={<CalendarDays className="size-5 text-blue-500" />}
            label="Total de Eventos"
            value={stats.eventsTotal.toString()}
            sub="Criados por todos os usuários"
          />
          {/* Uso real: quem abriu o app, não quem apenas se cadastrou. */}
          <StatCard
            icon={<Activity className="size-5 text-green-500" />}
            label="Usando de fato"
            value={stats.activeWeek.toString()}
            sub={`${stats.activeDay} hoje · ${stats.activeMonth} no mês${
              stats.neverSeen > 0 ? ` · ${stats.neverSeen} sem registro` : ""
            }`}
          />
        </div>
      )}

      {/* Subscription breakdown */}
      {stats && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Distribuição de Assinaturas
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { key: "trial", count: stats.trial, label: "Trial" },
              { key: "active", count: stats.active, label: "Ativo" },
              { key: "overdue", count: stats.overdue, label: "Em atraso" },
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

        <p className="flex items-start gap-2 px-5 py-2.5 text-xs text-muted-foreground bg-muted/30 border-b border-border">
          <Lock className="size-3.5 mt-0.5 flex-shrink-0" />
          <span>
            A coluna <strong>Assinatura</strong> é somente leitura: o estado de cobrança vem do
            Asaas, pelo webhook. Para liberar acesso sem cobrança, use{" "}
            <strong>interna</strong> ou <strong>beta</strong> na coluna Acesso.
          </span>
        </p>

        {users === undefined ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {searchQ ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
          </div>
        ) : (
          <>
            {/* ── CELULAR: cards ─────────────────────────────────────────────
                A tabela escondia "Cadastro", "Função" e "Eventos" em telas
                pequenas — justamente parte do que o painel existe para mostrar.
                No cartão TODOS os campos aparecem, sem rolagem lateral. */}
            <div className="md:hidden divide-y divide-border">
              {filteredUsers.map((u) => (
                <UserCard
                  key={u._id}
                  user={u}
                  actions={
                    <UserActions
                      user={u}
                      onAccess={handleAccess}
                      onBeta={openBetaDialog}
                      onRole={handleRole}
                      onDelete={setDeletingId}
                    />
                  }
                />
              ))}
            </div>

            {/* ── DESKTOP: tabela ────────────────────────────────────────── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Usuário</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Cadastro</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Último acesso</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Assinatura</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Acesso</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Função</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Eventos</th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u) => {
                    const isInternal = u.access.type === "internal";
                    return (
                      <tr
                        key={u._id}
                        className={`transition-colors ${
                          isInternal ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/30"
                        }`}
                      >
                        <td className="px-5 py-3">
                          <UserIdentity user={u} />
                        </td>

                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(u._creationTime), "dd/MM/yyyy", { locale: ptBR })}
                        </td>

                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          <LastSeen lastSeenAt={u.lastSeenAt} />
                        </td>

                        <td className="px-3 py-3">
                          <SubscriptionCell user={u} />
                        </td>

                        <td className="px-3 py-3">
                          <AccessCell user={u} />
                        </td>

                        <td className="px-3 py-3">
                          <RoleBadge role={u.role} />
                        </td>

                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          <EventsSummary user={u} />
                        </td>

                        <td className="px-3 py-3">
                          <UserActions
                            user={u}
                            onAccess={handleAccess}
                            onBeta={openBetaDialog}
                            onRole={handleRole}
                            onDelete={setDeletingId}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Acesso beta — data de validade */}
      <Dialog
        open={betaTarget !== null}
        onOpenChange={(o) => { if (!o && !savingBeta) setBetaTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-violet-500" /> Acesso beta
            </DialogTitle>
            <DialogDescription>
              {betaTarget?.name ?? betaTarget?.email ?? "Usuário"} terá acesso liberado e sem
              cobrança até a data escolhida. Depois disso a conta volta a valer como cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="beta-expires">Válido até</Label>
            <Input
              id="beta-expires"
              type="date"
              value={betaDate}
              min={toDateInput(Date.now())}
              onChange={(e) => setBetaDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={savingBeta}
              onClick={() => setBetaTarget(null)}
            >
              Cancelar
            </Button>
            <Button className="cursor-pointer" disabled={savingBeta} onClick={() => void confirmBeta()}>
              {savingBeta ? "Salvando…" : "Definir acesso beta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interessados no ALTAR — vinham da landing page e ninguém via. */}
      <InteressadosNoAltar />

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

// ─── Acesso ───────────────────────────────────────────────────────────────

/** Epoch ms → "AAAA-MM-DD" no fuso local (o `<input type="date">` é local). */
function toDateInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Tipo de acesso da conta. Lê `user.access`, que o backend já resolveu com
 * `resolveAccess` — a mesma regra que isenta o checkout e exclui do MRR.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Peças compartilhadas entre o CARD (celular) e a TABELA (desktop).
// Uma definição só para cada informação: as duas visões nunca divergem.
// ─────────────────────────────────────────────────────────────────────────────

/** Avatar + nome + e-mail. */
function UserIdentity({ user }: { user: AdminUser }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-primary">
          {(user.name ?? user.email ?? "?").slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-medium truncate">{user.name ?? "—"}</p>
        <p className="text-xs text-muted-foreground truncate">{user.email ?? "—"}</p>
      </div>
    </div>
  );
}

/**
 * Último acesso em linguagem de gente ("há 3 h", "há 5 d").
 *
 * `undefined` significa duas coisas que não dá para distinguir e que por isso
 * são ditas com honestidade: ou a conta nunca abriu o app, ou não abriu depois
 * que a medição passou a existir. Nada é inventado.
 */
function LastSeen({ lastSeenAt }: { lastSeenAt?: number }) {
  if (lastSeenAt === undefined) {
    return <span className="text-muted-foreground italic">sem registro</span>;
  }

  const diff = Date.now() - lastSeenAt;
  const horas = Math.floor(diff / 3_600_000);
  const dias = Math.floor(diff / 86_400_000);

  const rotulo =
    diff < 3_600_000 ? "agora há pouco" : horas < 24 ? `há ${horas} h` : `há ${dias} d`;

  // Verde = ativo na última semana; âmbar = no último mês; cinza = sumido.
  const cor =
    dias <= 7
      ? "text-green-600 dark:text-green-400"
      : dias <= 30
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <span className={cor} title={format(new Date(lastSeenAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}>
      {rotulo}
    </span>
  );
}

/** Etiqueta de assinatura + prazo do trial + aviso de tolerância/bloqueio. */
function SubscriptionCell({ user }: { user: AdminUser }) {
  const cfg = STATUS_CONFIG[user.subscriptionStatus ?? "trial"];
  const overdueDaysLeft = user.access.overdueDaysLeft;

  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg?.className ?? ""}`}
      >
        {cfg?.icon}
        {cfg?.label ?? user.subscriptionStatus}
      </span>

      {user.subscriptionStatus === "trial" && user.trialEndDate && (
        <p className="text-xs text-muted-foreground">
          até {format(new Date(user.trialEndDate), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      )}

      {/* Inadimplência: distingue "ainda tem prazo" de "já perdeu o acesso". */}
      {user.subscriptionStatus === "overdue" && overdueDaysLeft !== undefined && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          tolerância: {overdueDaysLeft} dia{overdueDaysLeft === 1 ? "" : "s"}
        </p>
      )}
      {user.subscriptionStatus === "overdue" && user.access.blocked && (
        <p className="text-xs text-red-500 font-medium">bloqueada por inadimplência</p>
      )}

      {user.access.billingExempt && (
        <p className="text-xs text-muted-foreground">Isenta de cobrança</p>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        role === "admin" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      }`}
    >
      {role === "admin" ? "Admin" : "Usuário"}
    </span>
  );
}

/** Quantos eventos, quando foi o último criado e qual o próximo agendado. */
function EventsSummary({ user }: { user: AdminUser }) {
  return (
    <div className="space-y-0.5">
      <p className="font-medium text-foreground">
        {user.eventCount} evento{user.eventCount === 1 ? "" : "s"}
      </p>
      {user.lastEventAt !== undefined && (
        <p className="text-xs text-muted-foreground">
          último criado {format(new Date(user.lastEventAt), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      )}
      {user.nextEventDate && (
        <p className="text-xs text-muted-foreground">
          próximo {format(new Date(user.nextEventDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      )}
    </div>
  );
}

/** Menu de ações — idêntico no card e na tabela. */
function UserActions({
  user,
  onAccess,
  onBeta,
  onRole,
  onDelete,
}: {
  user: AdminUser;
  onAccess: (id: Id<"users">, tipo: "client" | "internal") => Promise<void>;
  onBeta: (u: AdminUser) => void;
  onRole: (id: Id<"users">, role: "admin" | "user") => Promise<void>;
  onDelete: (id: Id<"users">) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 cursor-pointer"
          aria-label={`Ações para ${user.name ?? user.email ?? "usuário"}`}
        >
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => void onAccess(user._id, "internal")} className="cursor-pointer gap-2">
          <ShieldCheck className="size-4 text-primary" /> Marcar como interna
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onBeta(user)} className="cursor-pointer gap-2">
          <FlaskConical className="size-4 text-violet-500" /> Definir acesso beta…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void onAccess(user._id, "client")} className="cursor-pointer gap-2">
          <UserCheck className="size-4 text-muted-foreground" /> Voltar a cliente normal
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user.role !== "admin" ? (
          <DropdownMenuItem onClick={() => void onRole(user._id, "admin")} className="cursor-pointer gap-2">
            <Shield className="size-4 text-primary" /> Tornar admin
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void onRole(user._id, "user")} className="cursor-pointer gap-2">
            <ShieldOff className="size-4 text-muted-foreground" /> Remover admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(user._id)}
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" /> Excluir usuário
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Cartão do usuário — a visão do celular.
 *
 * Mostra TODOS os campos que a tabela mostra no desktop, em duas colunas de
 * rótulo/valor. Nada é escondido por tamanho de tela.
 */
function UserCard({ user, actions }: { user: AdminUser; actions: React.ReactNode }) {
  const isInternal = user.access.type === "internal";
  return (
    <div className={`p-4 space-y-3 ${isInternal ? "bg-primary/5" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <UserIdentity user={user} />
        <div className="flex-shrink-0">{actions}</div>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <SubscriptionCell user={user} />
        <AccessCell user={user} />
        <RoleBadge role={user.role} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-border pt-3">
        <div>
          <dt className="text-muted-foreground">Cadastro</dt>
          <dd className="font-medium mt-0.5">
            {format(new Date(user._creationTime), "dd/MM/yyyy", { locale: ptBR })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Último acesso</dt>
          <dd className="font-medium mt-0.5">
            <LastSeen lastSeenAt={user.lastSeenAt} />
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Eventos</dt>
          <dd className="mt-0.5">
            <EventsSummary user={user} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function AccessCell({ user }: { user: AdminUser }) {
  const cfg = ACCESS_CONFIG[user.access.type];
  const expiresAt = user.accessExpiresAt;
  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}
      >
        {cfg.icon}
        {cfg.label}
      </span>
      {user.access.type === "beta" && expiresAt !== undefined && (
        <p
          className={`text-xs ${
            user.access.betaExpired ? "text-red-500 font-medium" : "text-muted-foreground"
          }`}
        >
          {user.access.betaExpired ? "expirou em " : "até "}
          {format(new Date(expiresAt), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      )}
      {user.access.type === "beta" && expiresAt === undefined && (
        <p className="text-xs text-muted-foreground">sem prazo definido</p>
      )}
      {user.access.type !== "beta" && (
        <p className="text-xs text-muted-foreground">{cfg.note}</p>
      )}
    </div>
  );
}

// ─── Interessados no ALTAR ────────────────────────────────────────────────

const INTERESSADO_STATUS = [
  { valor: "novo", rotulo: "Novo" },
  { valor: "contatado", rotulo: "Contatado" },
  { valor: "convertido", rotulo: "Convertido" },
  { valor: "descartado", rotulo: "Descartado" },
] as const;

/**
 * Quem pediu demonstração ou entrou na lista beta pela landing page.
 *
 * São potenciais clientes do SaaS ALTAR — público diferente do funil da
 * decoradora (/funil), que reúne os clientes DELA. As duas telas ficam
 * separadas de propósito.
 */
function InteressadosNoAltar() {
  const leads = useQuery(api.admin.listLandingLeads);
  const setStatus = useMutation(api.admin.setLandingLeadStatus);

  if (leads === undefined) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const novos = leads.filter((l) => l.status === "novo").length;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Interessados no ALTAR
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pedidos de demonstração e lista beta vindos da landing page
          {leads.length > 0 && novos > 0 && ` · ${novos} ainda sem contato`}
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium">Nenhum interessado ainda</p>
          <p className="text-xs text-muted-foreground mt-1">
            Quem pedir demonstração ou entrar na lista beta pelo site aparece aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {leads.map((lead) => (
            <div
              key={lead._id}
              className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{lead.name}</p>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      lead.intent === "demo"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    )}
                  >
                    {lead.intent === "demo" ? "Demonstração" : "Lista beta"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 mt-0.5">
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {lead.email}
                  </a>
                  {lead.whatsapp && (
                    <a
                      href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {lead.whatsapp}
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>

              <select
                value={lead.status}
                onChange={async (e) => {
                  try {
                    await setStatus({
                      leadId: lead._id,
                      status: e.target.value as (typeof INTERESSADO_STATUS)[number]["valor"],
                    });
                    toast.success("Situação atualizada.");
                  } catch {
                    toast.error("Não foi possível atualizar a situação.");
                  }
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs cursor-pointer flex-shrink-0 sm:w-36"
              >
                {INTERESSADO_STATUS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
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
