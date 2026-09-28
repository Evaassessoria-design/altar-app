import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { ChaveDaEtapa, EtapaDaJornada } from "@/convex/lib/jornadaDoEvento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// JORNADA DO PROJETO — no lugar das "Ações Rápidas"
//
// Os mesmos destinos de antes, agora na ordem em que uma decoradora trabalha,
// cada um dizendo em que pé está. "Você está aqui" e "Próximo" vêm do servidor
// (`lib/jornadaDoEvento.ts`) — a tela não decide nada.
//
// ORIENTA, NÃO TRAVA: toda etapa é um link sempre aberto. Quem desenha o
// projeto visual antes do contrato pode; a etapa só aparece feita. A única
// dependência real (planta ← croqui) é dita em texto, não bloqueada.
// ─────────────────────────────────────────────────────────────────────────────

function Marca({ status, atual }: { status: EtapaDaJornada["status"]; atual: boolean }) {
  if (status === "concluido") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-3.5" aria-label="concluído" />
      </span>
    );
  }
  if (atual) {
    return <CircleDot className="size-6 text-primary" aria-label="você está aqui" />;
  }
  return (
    <Circle
      className={cn("size-6", status === "em_andamento" ? "text-amber-500" : "text-muted-foreground/50")}
      aria-label={status === "em_andamento" ? "em andamento" : "não iniciado"}
    />
  );
}

export function JornadaDoProjeto({
  eventId,
  etapas,
  atual,
  proxima,
  concluidas,
  extras,
}: {
  eventId: string;
  etapas: EtapaDaJornada[];
  atual: ChaveDaEtapa | null;
  proxima: ChaveDaEtapa | null;
  concluidas: number;
  /** Conteúdo extra sob uma etapa (ex.: a proposta, dentro do comercial). */
  extras?: Partial<Record<ChaveDaEtapa, ReactNode>>;
}) {
  return (
    <section aria-label="Jornada do projeto" className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="font-semibold">Jornada do projeto</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {concluidas} de {etapas.length} etapas
        </span>
      </div>
      <ol>
        {etapas.map((e) => {
          const ehAtual = e.chave === atual;
          const destino = e.rota === "" ? `/eventos/${eventId}#contrato` : `/eventos/${eventId}/${e.rota}`;
          return (
            <li key={e.chave} className={cn("border-b border-border last:border-b-0", ehAtual && "bg-primary/5")}>
              <Link
                to={destino}
                className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/50"
              >
                <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">
                  {String(e.numero).padStart(2, "0")}
                </span>
                <Marca status={e.status} atual={ehAtual} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {e.rotulo}
                    {ehAtual && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                        Você está aqui
                      </span>
                    )}
                    {e.chave === proxima && (
                      <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Próximo
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.detalhe}
                    {e.dependeDe && e.status !== "concluido" && " · gerada a partir do croqui"}
                  </p>
                </div>
                <ChevronRight className="size-4 flex-shrink-0 text-muted-foreground" />
              </Link>
              {extras?.[e.chave] && <div className="pl-12">{extras[e.chave]}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
