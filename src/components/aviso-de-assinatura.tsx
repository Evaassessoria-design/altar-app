import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import { avisoDeBloqueio, avisoDeTolerancia } from "@/lib/acesso-bloqueado.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO QUE SUBSTITUIU O REDIRECIONAMENTO.
//
// Antes, uma conta vencida era mandada para o paywall em TODAS as rotas e o
// aplicativo fechava. Agora ela navega e lê os próprios dados — e este aviso é
// o que garante que ela saiba do estado e tenha o caminho de volta à vista.
//
// Não se fecha de propósito: some quando a conta volta, não quando a pessoa
// clica. Um aviso de cobrança dispensável é um aviso que ninguém lê.
//
// A regra de QUANDO aparecer vive em `src/lib/acesso-bloqueado.ts`, testada
// sem renderizar nada. Aqui só há desenho.
// ─────────────────────────────────────────────────────────────────────────────

export function AvisoDeAssinatura() {
  const status = useQuery(api.users.getSubscriptionStatus);
  const acesso = status?.access;

  const bloqueio = avisoDeBloqueio(acesso);
  const tolerancia = avisoDeTolerancia(acesso);

  if (bloqueio.bloqueada) {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-900/20"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {bloqueio.titulo}
            </p>
            <p className="mt-0.5 text-sm text-amber-800/80 dark:text-amber-300/80">
              {bloqueio.descricao}
            </p>
          </div>
        </div>
        <Link
          to="/paywall"
          className="inline-flex min-h-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          {bloqueio.acao}
        </Link>
      </div>
    );
  }

  if (tolerancia) {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 flex-shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{tolerancia}</p>
        </div>
        <Link
          to="/paywall"
          className="inline-flex min-h-9 flex-shrink-0 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Regularizar
        </Link>
      </div>
    );
  }

  return null;
}
