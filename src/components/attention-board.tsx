import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// "PRECISAM DA SUA ATENÇÃO"
//
// Cada linha é uma frase verificável ligada a um dado real, com um destino
// onde resolver. Não há nota, percentual nem semáforo calculado por peso —
// se a decoradora discordar de um motivo, ela consegue apontar qual dado o
// gerou. As regras vivem em convex/lib/attention.ts, puras e testadas.
// ─────────────────────────────────────────────────────────────────────────────

function diasTexto(dias: number): string {
  if (dias === 0) return "é hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

export function AttentionBoard() {
  const eventos = useQuery(api.dashboard.getAttentionBoard);

  if (eventos === undefined) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4 text-primary" /> Precisam da sua atenção
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Eventos próximos com alguma pendência registrada
        </p>
      </div>

      {eventos.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CheckCircle2 className="size-6 text-green-600 dark:text-green-500 mx-auto" />
          <p className="text-sm font-medium mt-2">Nada pedindo atenção agora</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Nenhum evento próximo tem compra, conferência ou fornecedor pendente. Assim que
            algo ficar em aberto, aparece aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {eventos.map((ev) => (
            <div key={ev.eventId} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <Link
                  to={`/eventos/${ev.eventId}`}
                  className="font-medium text-sm hover:text-primary cursor-pointer truncate"
                >
                  {ev.nome}
                </Link>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                    ev.nivel === "urgente"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                  )}
                >
                  {diasTexto(ev.diasAte)}
                </span>
              </div>

              <ul className="mt-2 space-y-1">
                {ev.motivos.map((m, i) => (
                  <li key={i}>
                    <Link
                      to={m.destino}
                      className="text-sm text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5 group"
                    >
                      <span className="size-1.5 rounded-full bg-primary flex-shrink-0" />
                      <span className="flex-1">{m.texto}</span>
                      <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
