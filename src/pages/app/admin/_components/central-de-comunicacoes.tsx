import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { ArrowRight, MessageSquare } from "lucide-react";
import { EstadoDoEnvio, Indicadores } from "@/pages/app/central/_components/painel-da-central.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO DA CENTRAL NO PAINEL ADMIN
//
// A operação inteira mudou para `/central`: caixa de entrada, fila, tarefas e
// Ouvidoria. Aqui fica só o que o Painel Admin precisa responder de relance —
// "há algo me esperando?" — e a porta para o lugar onde se decide.
//
// Os indicadores são os MESMOS da Central e do Escritório 3D (query
// `communications.painel`): três telas, um número só.
// ─────────────────────────────────────────────────────────────────────────────

export function CentralDeComunicacoes() {
  const painel = useQuery(api.communications.painel, {});
  const fila = useQuery(api.adminApprovals.listarPendentes, {});
  const pendentes = fila?.length ?? 0;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" /> Central de Comunicações
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conversas do número comercial do ALTAR — interessados e assinantes.
          </p>
        </div>

        <Button asChild size="sm">
          <Link to="/central">
            {pendentes > 0 ? `Decidir ${pendentes} pendente(s)` : "Abrir a Central"}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="p-5 space-y-3">
        <EstadoDoEnvio painel={painel} />
        <Indicadores painel={painel} />
      </div>
    </div>
  );
}
