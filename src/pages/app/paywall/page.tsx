import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Loader2, Check, Sparkles, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { motion } from "motion/react";

const features = [
  "Eventos ilimitados",
  "Briefings completos com IA",
  "Análise de layout por foto",
  "Orçamentos interativos",
  "Galeria de fotos por evento",
  "Funil de vendas Kanban",
  "Relatórios financeiros completos",
  "Equipe e controle de compras",
  "PDFs profissionais",
  "Suporte por WhatsApp",
];

export default function Paywall() {
  const [loading, setLoading] = useState(false);
  const currentUser = useQuery(api.users.getCurrentUser);
  const createCheckout = useAction(api.asaas.createCheckoutSession);

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
      const msg =
        err instanceof ConvexError
          ? (err.data as { message: string }).message
          : "Erro ao criar cobrança. Tente novamente.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Lock icon */}
        <div className="flex justify-center mb-6">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="size-8 text-primary" />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Seu trial expirou</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Para continuar usando o Altar e ter acesso a todos os recursos,
            assine o plano mensal.
          </p>
        </div>

        {/* Pricing card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
          {/* Price */}
          <div className="flex items-end gap-1 mb-1">
            <span className="text-4xl font-bold">R$ 79</span>
            <span className="text-2xl font-bold text-muted-foreground">,90</span>
            <span className="text-muted-foreground text-sm mb-1">/mês</span>
          </div>
          <p className="text-xs text-muted-foreground mb-6">Cancele quando quiser</p>

          {/* Features */}
          <ul className="space-y-2.5 mb-6">
            {features.map((feat) => (
              <li key={feat} className="flex items-center gap-2.5 text-sm">
                <Check className="size-4 text-primary flex-shrink-0" />
                {feat}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Button
            className="w-full gap-2 cursor-pointer text-base py-5"
            onClick={handleSubscribe}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {loading ? "Gerando cobrança..." : "Assinar agora — R$ 79,90/mês"}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-3">
            Pague via PIX, boleto ou cartão de crédito
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Pagamento processado com segurança pelo Asaas
        </p>
      </motion.div>
    </div>
  );
}
