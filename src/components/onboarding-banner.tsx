import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Check, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { useState } from "react";

interface OnboardingBannerProps {
  onOpenOnboarding: () => void;
}

export function OnboardingBanner({ onOpenOnboarding }: OnboardingBannerProps) {
  const user = useQuery(api.users.getCurrentUser);
  const events = useQuery(api.events.list, {});
  const teamMembers = useQuery(api.team.listMembers, {});
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [dismissed, setDismissed] = useState(false);

  // Don't show if onboarding already done or dismissed
  if (!user || user.onboardingCompleted || dismissed) return null;

  const steps = [
    {
      id: "studio",
      label: "Configure seu estúdio",
      done: !!user.studioName,
    },
    {
      id: "event",
      label: "Crie seu primeiro evento",
      done: (events?.length ?? 0) > 0,
    },
    {
      id: "team",
      label: "Adicione um membro da equipe",
      done: (teamMembers?.length ?? 0) > 0,
      optional: true,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">
                {allDone ? "Configuração concluída!" : "Conclua a configuração inicial"}
              </p>
              <p className="text-xs text-muted-foreground">
                {allDone
                  ? "Seu estúdio está pronto para decolar."
                  : `${doneCount} de ${steps.length} passos concluídos`}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              setDismissed(true);
              await completeOnboarding();
            }}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground transition-colors cursor-pointer flex-shrink-0"
            title="Dispensar"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right">{pct}%</p>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5">
              <div className={cn(
                "size-5 rounded-full flex items-center justify-center flex-shrink-0",
                s.done
                  ? "bg-primary text-primary-foreground"
                  : "border-2 border-border",
              )}>
                {s.done && <Check className="size-3" />}
              </div>
              <span className={cn(
                "text-sm",
                s.done ? "line-through text-muted-foreground" : "text-foreground",
              )}>
                {s.label}
              </span>
              {s.optional && !s.done && (
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  Opcional
                </span>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        {!allDone && (
          <Button
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={onOpenOnboarding}
          >
            <Sparkles className="size-3.5" />
            Continuar configuração
          </Button>
        )}
        {allDone && (
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer gap-1.5"
            onClick={async () => {
              setDismissed(true);
              await completeOnboarding();
            }}
          >
            <Check className="size-3.5" />
            Dispensar
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
