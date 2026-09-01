import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  Building2,
  CalendarDays,
  Users,
  Check,
  ChevronRight,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
import {
  ERRO_TIPO_OBRIGATORIO,
  EVENT_TYPES,
  PLACEHOLDER_TIPO_DE_EVENTO,
  type TipoDeEvento,
} from "@/lib/event-types.ts";
import { PAPEIS_DA_EQUIPE } from "@/lib/team-roles.ts";

const STEPS = [
  { id: 1, icon: Building2, label: "Seu Estúdio" },
  { id: 2, icon: CalendarDays, label: "Primeiro Evento" },
  { id: 3, icon: Users, label: "Sua Equipe" },
] as const;

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);

  // Step 1
  const [studioName, setStudioName] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2
  const [eventName, setEventName] = useState("");
  // `null` = ninguém escolheu ainda. Nascia como "wedding", e quem não
  // reparava no campo criava o primeiro evento com o tipo errado.
  const [eventType, setEventType] = useState<TipoDeEvento | null>(null);
  const [erroTipo, setErroTipo] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [clientName, setClientName] = useState("");

  // Step 3
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("Assistente");
  const [memberPhone, setMemberPhone] = useState("");

  const [saving, setSaving] = useState(false);

  const updateProfile = useMutation(api.users.updateProfile);
  const createEvent = useMutation(api.events.create);
  const createMember = useMutation(api.team.createMember);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  const handleStep1 = async () => {
    if (!studioName.trim()) {
      toast.error("Informe o nome do seu estúdio");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        studioName: studioName.trim(),
        phone: phone.trim() || undefined,
      });
      setStep(2);
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleStep2 = async () => {
    // O tipo é conferido separado para o erro poder aparecer NO CAMPO. Um
    // aviso genérico não diria qual campo faltou, e o tipo é justamente o que
    // não tem mais valor presumido.
    if (!eventType) {
      setErroTipo(true);
      toast.error(ERRO_TIPO_OBRIGATORIO);
      return;
    }
    if (!eventName.trim() || !eventDate || !eventLocation.trim() || !clientName.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      await createEvent({
        name: eventName.trim(),
        type: eventType,
        date: eventDate,
        location: eventLocation.trim(),
        clientName: clientName.trim(),
        status: "planning",
      });
      setStep(3);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao criar evento.");
    } finally {
      setSaving(false);
    }
  };

  const handleStep3 = async (skip = false) => {
    if (!skip && !memberName.trim()) {
      toast.error("Informe o nome do membro");
      return;
    }
    setSaving(true);
    try {
      if (!skip && memberName.trim()) {
        await createMember({
          name: memberName.trim(),
          role: memberRole,
          phone: memberPhone.trim() || undefined,
        });
      }
      await completeOnboarding();
      onComplete();
    } catch {
      toast.error("Erro ao finalizar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="bg-primary/5 border-b border-border px-6 py-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="size-5 text-primary" />
            <span className="font-bold text-lg">Bem-vindo ao Altar!</span>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div className={cn(
                    "flex items-center gap-1.5 flex-shrink-0",
                    active ? "opacity-100" : done ? "opacity-80" : "opacity-40",
                  )}>
                    <div className={cn(
                      "size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground",
                    )}>
                      {done ? <Check className="size-3.5" /> : s.id}
                    </div>
                    <span className={cn(
                      "text-xs font-medium hidden sm:block",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 rounded-full mx-1",
                      step > s.id ? "bg-primary" : "bg-border",
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-semibold text-base">Conte-nos sobre seu estúdio</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Essas informações aparecerão nos seus documentos e relatórios.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nome do estúdio / empresa *</Label>
                    <Input
                      autoFocus
                      placeholder="Ex: Ateliê Floral da Ana"
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleStep1(); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>WhatsApp / Telefone</Label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleStep1(); }}
                    />
                  </div>
                </div>
                <Button
                  className="w-full cursor-pointer gap-2"
                  onClick={() => void handleStep1()}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
                  Próximo
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-semibold text-base">Crie seu primeiro evento</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Vamos cadastrar um evento para você explorar todas as funcionalidades.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nome do evento *</Label>
                    <Input
                      autoFocus
                      placeholder="Ex: 15 anos da Helena, Casamento da Ana, Confra da Acme"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label id="onb-tipo-label">Tipo de evento *</Label>
                    <div
                      role="group"
                      aria-labelledby="onb-tipo-label"
                      aria-invalid={erroTipo}
                      aria-describedby={erroTipo ? "onb-tipo-erro" : undefined}
                      className={cn(
                        "flex flex-wrap gap-2",
                        erroTipo && "rounded-lg border border-destructive p-2",
                      )}
                    >
                      {EVENT_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          aria-pressed={eventType === t.value}
                          onClick={() => {
                            setEventType(t.value);
                            setErroTipo(false);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer",
                            eventType === t.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {erroTipo ? (
                      <p id="onb-tipo-erro" className="text-xs text-destructive">
                        {ERRO_TIPO_OBRIGATORIO}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {PLACEHOLDER_TIPO_DE_EVENTO}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Data *</Label>
                      <Input
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nome do cliente *</Label>
                      <Input
                        placeholder="Ex: Ana e Carlos"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Local do evento *</Label>
                    <Input
                      placeholder="Ex: Espaço Villa Jardim, SP"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full cursor-pointer gap-2"
                  onClick={() => void handleStep2()}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
                  Próximo
                </Button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-semibold text-base">Adicione um membro da equipe</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Cadastre colaboradores para atribuir aos seus eventos. Você pode pular agora.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nome do membro</Label>
                    <Input
                      autoFocus
                      placeholder="Ex: Carla Oliveira"
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Função</Label>
                    <div className="flex flex-wrap gap-2">
                      {PAPEIS_DA_EQUIPE.map((r) => (
                        <button
                          key={r}
                          onClick={() => setMemberRole(r)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer",
                            memberRole === r
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>WhatsApp</Label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={memberPhone}
                      onChange={(e) => setMemberPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1 cursor-pointer"
                    onClick={() => void handleStep3(true)}
                    disabled={saving}
                  >
                    Pular
                  </Button>
                  <Button
                    className="flex-1 cursor-pointer gap-2"
                    onClick={() => void handleStep3(false)}
                    disabled={saving || !memberName.trim()}
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                    Concluir
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-muted/30 border-t border-border">
          <p className="text-xs text-center text-muted-foreground">
            Passo {step} de 3 · Você pode alterar tudo isso depois em{" "}
            <span className="text-primary font-medium">Configurações</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
