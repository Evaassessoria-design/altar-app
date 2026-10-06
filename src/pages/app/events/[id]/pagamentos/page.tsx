import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { PagamentosDaCliente } from "../_components/pagamentos-da-cliente.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// A ABA "PAGAMENTOS DA CLIENTE"
//
// Mesma forma das outras abas do evento (orçamento, fornecedores, acervo):
// rota própria, volta para o evento no topo. O conteúdo é a seção inteira —
// resumo compacto primeiro, parcelas logo abaixo.
// ─────────────────────────────────────────────────────────────────────────────

export default function PagamentosDaClientePage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { id: eventId });

  if (event === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="p-4 md:p-6 text-center text-muted-foreground">
        Evento não encontrado.{" "}
        <Link to="/eventos" className="text-primary hover:underline">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer min-h-9"
      >
        <ArrowLeft className="size-4" /> <span className="truncate">{event.name}</span>
      </Link>
      <PagamentosDaCliente eventId={eventId} />
    </div>
  );
}
