import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { dataDoDia } from "@/convex/lib/dataDoDia.ts";
import { precisaDeDesfecho } from "@/convex/lib/reunioes.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A LINHA DAS REUNIÕES NA TELA DO EVENTO
//
// Responde em uma linha "quando é a próxima?" e "ficou algo pendente?", e leva
// para a tela das reuniões. Não edita nada aqui: o editor é um só
// (/eventos/:id/reunioes), para não haver dois jeitos de salvar a mesma ata.
// ─────────────────────────────────────────────────────────────────────────────

export function ReunioesDoEvento({ eventId }: { eventId: Id<"events"> }) {
  const dados = useQuery(api.reunioes.doEvento, { eventId });
  const hoje = dataDoDia();

  let descricao = "Registre o que foi combinado com a cliente";
  if (dados) {
    const lista = dados.reunioes;
    const proxima = lista.find((r) => r.situacao === "agendada" && r.data >= hoje);
    const abertas = lista.reduce((s, r) => s + (r.pendencias ?? []).filter((p) => !p.feita).length, 0);
    const semDesfecho = lista.filter((r) => precisaDeDesfecho(r, hoje)).length;
    const partes = [
      lista.length === 0
        ? "Nenhuma reunião registrada"
        : proxima
          ? `Próxima: ${formatEventDayOnly(proxima.data)}${proxima.horario ? ` às ${proxima.horario}` : ""}`
          : `${lista.length} reunião(ões), nenhuma agendada`,
      abertas > 0 ? `${abertas} pendência(s) em aberto` : null,
      semDesfecho > 0 ? `${semDesfecho} sem desfecho` : null,
    ];
    descricao = partes.filter(Boolean).join(" · ");
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <Link
        to={`/eventos/${eventId}/reunioes`}
        className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-accent/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <CalendarClock className="size-5 flex-shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold text-sm">Reuniões</p>
            <p className="text-xs text-muted-foreground">{descricao}</p>
          </div>
        </div>
        <ChevronRight className="size-4 flex-shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
