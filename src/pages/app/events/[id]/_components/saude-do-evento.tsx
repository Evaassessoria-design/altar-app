import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// SAÚDE DO EVENTO — agora no topo, e dizendo o que fazer
//
// O percentual é o mesmo de sempre (`lib/saudeDoEvento.ts`, 7 critérios de
// cadastro) — não se inventa número. O que mudou é o que vem junto: a FASE em
// que o evento está, o PRÓXIMO PASSO (com o link para ele) e o que PRECISA DE
// ATENÇÃO. Tudo vem pronto de `health.getEventJourney`; esta tela só desenha.
//
// Os critérios do percentual ficam a um toque: explicam o número, mas não são
// o que a decoradora precisa ler primeiro.
// ─────────────────────────────────────────────────────────────────────────────

const FASE = {
  projeto: "Projeto",
  operacao: "Operação",
  concluido: "Tudo em dia",
} as const;

export function SaudeDoEvento({
  eventId,
  saude,
  fase,
  proximoPasso,
  atencao,
}: {
  eventId: string;
  saude: { percent: number; status: "complete" | "attention" | "incomplete"; checks: { key: string; label: string; ok: boolean }[] };
  fase: keyof typeof FASE;
  proximoPasso: { rotulo: string; detalhe: string; rota?: string } | null;
  atencao: string[];
}) {
  const cor =
    saude.status === "complete"
      ? "text-emerald-700 dark:text-emerald-400"
      : saude.status === "attention"
        ? "text-amber-700 dark:text-amber-400"
        : "text-destructive";
  const destino =
    proximoPasso?.rota === undefined
      ? undefined
      : proximoPasso.rota === ""
        ? `/eventos/${eventId}#contrato`
        : `/eventos/${eventId}/${proximoPasso.rota}`;

  return (
    <section aria-label="Saúde do evento" className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
        <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saúde</p>
          <p className={cn("text-3xl font-bold tabular-nums", cor)}>{saude.percent}%</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fase atual</p>
            <p className="font-medium">{FASE[fase]}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Próximo passo</p>
            {proximoPasso ? (
              destino ? (
                <Link to={destino} className="group inline-flex items-center gap-1 font-medium hover:underline">
                  {proximoPasso.rotulo}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <p className="font-medium">{proximoPasso.rotulo}</p>
              )
            ) : (
              <p className="font-medium">Nada pendente</p>
            )}
            {proximoPasso && <p className="text-xs text-muted-foreground">{proximoPasso.detalhe}</p>}
          </div>
        </div>
      </div>

      {atencao.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Precisa de atenção
          </p>
          <ul className="space-y-1">
            {atencao.map((a) => (
              <li key={a} className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 flex-shrink-0" /> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* O que forma o percentual — a explicação do número, não a notícia. */}
      <details className="border-t border-border px-5 py-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Como a saúde é calculada</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {saude.checks.map((c) => (
            <p key={c.key} className={cn("flex items-center gap-1.5", !c.ok && "text-muted-foreground")}>
              <span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}
            </p>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cada item vale o mesmo. A saúde mede o cadastro do evento; a fase e o próximo passo
          vêm da jornada abaixo.
        </p>
      </details>
    </section>
  );
}
