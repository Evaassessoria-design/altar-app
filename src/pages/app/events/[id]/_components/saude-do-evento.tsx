import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// SAÚDE DO EVENTO — PROGRESSO E RISCO SÃO COISAS DIFERENTES
//
// ── O QUE ESTAVA MISTURADO ──────────────────────────────────────────────────
// O número grande era o percentual, e a COR dele vinha de `saude.status` — que
// mede quanto do cadastro está preenchido. Um casamento com 85% e o CONTRATO
// faltando aparecia em âmbar de "quase lá", quando o certo era alarme: 85% de
// cadastro feito e o documento que sustenta o evento inexistente.
//
// Progresso responde "quanto do processo andou". Saúde responde "alguém precisa
// agir, e por quê". As duas perguntas não se somam, e a cor é da segunda.
//
// ── A SEPARAÇÃO, COM A MENOR MUDANÇA POSSÍVEL ───────────────────────────────
// Nenhum número novo foi inventado e nenhuma regra nova foi escrita aqui. O
// veredito é `vereditoDoEvento` (`convex/lib/jornadaDoEvento.ts`, R4 da
// auditoria de 30/09): determinístico, puro, com teste, e já vinha chegando a
// esta tela dentro de `health.getEventJourney` — só não era lido.
//
// O que mudou no desenho:
//   · o VEREDITO em palavras é a manchete, e dá a cor;
//   · o percentual continua existindo, rotulado como PROGRESSO, sem cor de
//     risco — ele não é um alarme;
//   · "Precisa de atenção" e os critérios continuam onde estavam.
// ─────────────────────────────────────────────────────────────────────────────

const FASE = {
  projeto: "Projeto",
  operacao: "Operação",
  concluido: "Tudo em dia",
} as const;

/** A cor é do VEREDITO, nunca do percentual. */
const COR_DO_NIVEL = {
  em_dia: "text-emerald-700 dark:text-emerald-400",
  atencao: "text-amber-700 dark:text-amber-400",
  risco: "text-destructive",
  cancelado: "text-muted-foreground",
} as const;

export function SaudeDoEvento({
  eventId,
  saude,
  veredito,
  fase,
  proximoPasso,
  atencao,
}: {
  eventId: string;
  saude: { percent: number; status: "complete" | "attention" | "incomplete"; checks: { key: string; label: string; ok: boolean }[] };
  veredito: { nivel: keyof typeof COR_DO_NIVEL; titulo: string; porque: string };
  fase: keyof typeof FASE;
  proximoPasso: { rotulo: string; detalhe: string; rota?: string } | null;
  atencao: string[];
}) {
  const cor = COR_DO_NIVEL[veredito.nivel];
  const destino =
    proximoPasso?.rota === undefined
      ? undefined
      : proximoPasso.rota === ""
        ? `/eventos/${eventId}#contrato`
        : `/eventos/${eventId}/${proximoPasso.rota}`;

  return (
    <section aria-label="Saúde do evento" className="bg-card rounded-xl border border-border overflow-hidden">
      {/* A MANCHETE É A FRASE, não o número: "esse evento está saudável?"
          tem resposta em português, com o motivo ao lado. */}
      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saúde</p>
          <p className={cn("text-2xl font-bold leading-tight", cor)}>{veredito.titulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{veredito.porque}</p>
          {/* O percentual continua, e continua útil — mas como PROGRESSO de
              cadastro, sem a cor que o fazia parecer alarme. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Progresso do cadastro:{" "}
            <strong className="tabular-nums text-foreground">{saude.percent}%</strong>
          </p>
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
          {/* NÃO "Precisa de atenção": é exatamente o título do veredito
              quando ele é âmbar, e o cartão passava a dizer a mesma frase
              duas vezes, uma como resposta e outra como rótulo de lista. O
              veredito é a CONCLUSÃO; esta lista são os FATOS que levaram a
              ela. Foi um teste de componente que cobrou a diferença. */}
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Riscos e pendências
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
        <summary className="cursor-pointer text-xs text-muted-foreground">Como o progresso é calculado</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {saude.checks.map((c) => (
            <p key={c.key} className={cn("flex items-center gap-1.5", !c.ok && "text-muted-foreground")}>
              <span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}
            </p>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cada item vale o mesmo, e o percentual mede o <strong>cadastro</strong> — quanto do
          processo já foi preenchido. A <strong>saúde</strong> acima é outra coisa: ela olha
          risco e prazo, e um evento pode estar 85% cadastrado e em risco por causa do que
          falta. A fase e o próximo passo vêm da jornada abaixo.
        </p>
      </details>
    </section>
  );
}
