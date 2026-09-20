import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Check, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { useState } from "react";
import { primeirosPassos, resumoDoProgresso } from "@/lib/primeiros-passos.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO DE PRIMEIROS PASSOS.
//
// Só desenho. A regra — o que conta como passo, o que é opcional, e o que
// fazer enquanto o sistema não sabe responder — vive em
// `src/lib/primeiros-passos.ts`, testada sem renderizar nada.
//
// Cada passo pendente é um LINK para o lugar onde ele se resolve. Antes, o
// único botão reabria o modal de boas-vindas, que recomeça no passo um com os
// campos em branco: quem já tinha nomeado o estúdio era convidada a nomeá-lo
// de novo, por cima.
// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingBanner() {
  const user = useQuery(api.users.getCurrentUser);
  const events = useQuery(api.events.list, {});
  const teamMembers = useQuery(api.team.listMembers, {});
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.onboardingCompleted || dismissed) return null;

  // `null` = ainda carregando. Nada é desenhado: um aviso que aparece dizendo
  // "0 de 2" e se corrige meio segundo depois ensina a não confiar no número.
  const progresso = primeirosPassos({
    studioName: user.studioName,
    eventos: events?.length,
    equipe: teamMembers?.length,
  });
  if (!progresso) return null;

  const encerrar = async () => {
    setDismissed(true);
    await completeOnboarding();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">
                {progresso.completo ? "Configuração concluída" : "Conclua a configuração inicial"}
              </p>
              <p className="text-xs text-muted-foreground">{resumoDoProgresso(progresso)}</p>
            </div>
          </div>
          <button
            onClick={() => void encerrar()}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground transition-colors cursor-pointer flex-shrink-0"
            title="Dispensar"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* A barra mede o que é EXIGIDO. O passo opcional aparece na lista e
            não entra na conta — senão a configuração fica em 67% para sempre. */}
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progresso.percentual}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right">{progresso.percentual}%</p>
        </div>

        <div className="space-y-2">
          {progresso.passos.map((p) => {
            const marca = (
              <div
                className={cn(
                  "size-5 rounded-full flex items-center justify-center flex-shrink-0",
                  p.feito ? "bg-primary text-primary-foreground" : "border-2 border-border",
                )}
              >
                {p.feito && <Check className="size-3" />}
              </div>
            );
            const texto = (
              <span
                className={cn(
                  "text-sm",
                  p.feito ? "line-through text-muted-foreground" : "text-foreground",
                )}
              >
                {p.label}
              </span>
            );
            if (p.feito) {
              return (
                <div key={p.id} className="flex items-center gap-2.5">
                  {marca}
                  {texto}
                </div>
              );
            }
            return (
              <Link
                key={p.id}
                to={p.destino}
                className="flex items-center gap-2.5 rounded-lg -mx-1 px-1 py-0.5 hover:bg-accent/50 transition-colors cursor-pointer"
              >
                {marca}
                {texto}
                {p.opcional && (
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                    Opcional
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* O botão leva ao próximo passo pendente — o lugar onde ele acontece,
            e não de volta ao começo de um formulário já preenchido. */}
        {progresso.proximo && (
          <Button asChild size="sm" className="cursor-pointer gap-1.5">
            <Link to={progresso.proximo.destino}>{progresso.proximo.acao}</Link>
          </Button>
        )}
        {progresso.completo && !progresso.proximo && (
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer gap-1.5"
            onClick={() => void encerrar()}
          >
            <Check className="size-3.5" />
            Dispensar
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
