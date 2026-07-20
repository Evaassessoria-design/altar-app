import { useState, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  User,
  Building2,
  CreditCard,
  Settings,
  Upload,
  Camera,
  Loader2,
  Check,
  ExternalLink,
  Clock,
  BadgeCheck,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const CURRENCIES = [
  { value: "BRL", label: "R$ — Real Brasileiro" },
  { value: "USD", label: "$ — Dólar Americano" },
  { value: "EUR", label: "€ — Euro" },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4)" },
  { value: "America/Boa_Vista", label: "Boa Vista (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Campo_Grande", label: "Campo Grande (GMT-4)" },
];

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className="bg-card rounded-xl border border-border overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="size-4 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

export default function ConfiguracoesPage() {
  const user = useQuery(api.users.getCurrentUser);
  const subStatus = useQuery(api.users.getSubscriptionStatus);
  const logoUrl = useQuery(api.users.getLogoUrl);

  const updateProfile = useMutation(api.users.updateProfile);
  const generateLogoUpload = useMutation(api.users.generateLogoUploadUrl);
  const createCheckout = useAction(api.asaas.createCheckoutSession);
  const cancelSub = useAction(api.asaas.cancelSubscription);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Form state — initialized from user once loaded
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [studioName, setStudioName] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [initialized, setInitialized] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Populate form once user loads
  if (user && !initialized) {
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setStudioName(user.studioName ?? "");
    setCurrency(user.currency ?? "BRL");
    setTimezone(user.timezone ?? "America/Sao_Paulo");
    setInitialized(true);
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        studioName: studioName.trim() || undefined,
        currency,
        timezone,
      });
      toast.success("Perfil salvo com sucesso!");
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao salvar perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    setLogoUploading(true);
    try {
      const uploadUrl = await generateLogoUpload();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await updateProfile({ logoStorageId: storageId });
      toast.success("Logo atualizada!");
    } catch {
      toast.error("Erro ao enviar logo");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  if (user === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  // Subscription helpers
  const status = subStatus?.subscriptionStatus ?? "trial";
  const trialEnd = subStatus?.trialEndDate ? new Date(subStatus.trialEndDate) : null;
  const daysLeft = (subStatus as { daysLeft?: number } | null)?.daysLeft;

  const statusConfig = {
    trial: { label: "Trial gratuito", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", icon: Clock },
    active: { label: "Assinante ativo", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20", icon: BadgeCheck },
    expired: { label: "Trial expirado", color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20", icon: AlertTriangle },
    cancelled: { label: "Cancelado", color: "text-muted-foreground", bg: "bg-muted", icon: AlertTriangle },
  } as const;

  const sc = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.trial;
  const StatusIcon = sc.icon;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="size-5 text-primary" /> Configurações
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil, estúdio e assinatura</p>
      </motion.div>

      {/* ── Perfil ── */}
      <SectionCard icon={User} title="Perfil Pessoal" description="Suas informações de contato" delay={0.05}>
        <div className="space-y-5">
          {/* Logo upload */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="size-20 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="size-7 text-muted-foreground/40" />
                )}
                {logoUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                    <Loader2 className="size-5 text-white animate-spin" />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Logo do Estúdio</p>
              <p className="text-xs text-muted-foreground">JPG ou PNG · aparece nos PDFs gerados</p>
              <Button
                size="sm"
                variant="secondary"
                className="cursor-pointer gap-1.5 h-8"
                disabled={logoUploading}
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {logoUrl ? "Trocar logo" : "Enviar logo"}
              </Button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) void handleLogoUpload(e.target.files[0]);
                }}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone / WhatsApp</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              value={user?.email ?? ""}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              O e-mail é gerenciado pelo Hercules Auth e não pode ser alterado aqui.{" "}
              <a
                href="https://auth.hercules.app"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Gerenciar conta <ExternalLink className="size-3" />
              </a>
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── Estúdio ── */}
      <SectionCard icon={Building2} title="Dados do Estúdio" description="Informações que aparecem nos documentos" delay={0.1}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do estúdio / empresa</Label>
            <Input
              placeholder="Ex: Ateliê Floral da Ana"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Preferências ── */}
      <SectionCard icon={Settings} title="Preferências" description="Moeda e fuso horário padrão" delay={0.15}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Moeda padrão</Label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Fuso horário</Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Save profile button */}
      <div className="flex justify-end">
        <Button
          onClick={() => void handleSaveProfile()}
          disabled={savingProfile}
          className="cursor-pointer gap-1.5 min-w-[140px]"
        >
          {savingProfile ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Salvar alterações
        </Button>
      </div>

      {/* ── Assinatura ── */}
      <SectionCard icon={CreditCard} title="Assinatura" description="Seu plano atual no Altar" delay={0.2}>
        <div className="space-y-4">
          {/* Status badge */}
          <div className={cn("flex items-center gap-3 rounded-lg p-4", sc.bg)}>
            <StatusIcon className={cn("size-5 flex-shrink-0", sc.color)} />
            <div className="flex-1">
              <p className={cn("font-semibold text-sm", sc.color)}>{sc.label}</p>
              {status === "trial" && trialEnd && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {daysLeft !== undefined && daysLeft > 0
                    ? `Expira em ${daysLeft} dia${daysLeft === 1 ? "" : "s"} — ${format(trialEnd, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                    : `Trial expirou em ${format(trialEnd, "dd/MM/yyyy")}`}
                </p>
              )}
              {status === "active" && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Plano mensal — R$ 79,90/mês
                </p>
              )}
            </div>
          </div>

          {/* Plan features */}
          <div className="space-y-2">
            {[
              "Eventos ilimitados",
              "Briefings completos com IA",
              "Análise de layout por foto",
              "Orçamentos interativos",
              "Galeria de fotos por evento",
              "Funil de vendas",
              "Relatórios financeiros",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2 text-sm">
                <Check className="size-3.5 text-primary flex-shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          {(status === "trial" || status === "expired") && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Plano Altar Pro</p>
                  <p className="text-xs text-muted-foreground">R$ 79,90/mês · PIX, boleto ou cartão</p>
                </div>
                <Button
                  className="cursor-pointer gap-1.5"
                  size="sm"
                  disabled={subscribing}
                  onClick={async () => {
                    if (!user) return;
                    setSubscribing(true);
                    try {
                      const { paymentUrl } = await createCheckout({
                        userName: user.name ?? "Usuário",
                        userEmail: user.email ?? "",
                        userId: user._id,
                        existingCustomerId: user.asaasCustomerId,
                      });
                      window.open(paymentUrl, "_blank");
                    } catch (err) {
                      const msg = err instanceof ConvexError
                        ? (err.data as { message: string }).message
                        : "Erro ao gerar cobrança.";
                      toast.error(msg);
                    } finally {
                      setSubscribing(false);
                    }
                  }}
                >
                  {subscribing ? "Aguarde..." : <>Assinar agora <ChevronRight className="size-4" /></>}
                </Button>
              </div>
            </div>
          )}

          {status === "active" && user?.asaasSubscriptionId && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Cancelar assinatura</p>
                  <p className="text-xs text-muted-foreground">Você perderá o acesso ao fim do ciclo</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer"
                  disabled={cancelling}
                  onClick={async () => {
                    if (!user?.asaasSubscriptionId) return;
                    setCancelling(true);
                    try {
                      await cancelSub({ asaasSubscriptionId: user.asaasSubscriptionId! });
                      toast.success("Assinatura cancelada.");
                    } catch {
                      toast.error("Erro ao cancelar assinatura.");
                    } finally {
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling ? "Cancelando..." : "Cancelar"}
                </Button>
              </div>
            </div>
          )}

          {/* Password change */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Segurança da conta</p>
                <p className="text-xs text-muted-foreground">Gerencie sua senha e métodos de login</p>
              </div>
              <a
                href="https://auth.hercules.app"
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary" size="sm" className="cursor-pointer gap-1.5">
                  <ExternalLink className="size-3.5" /> Portal Hercules Auth
                </Button>
              </a>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
