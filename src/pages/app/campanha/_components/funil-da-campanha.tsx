import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { GitBranch } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// O FUNIL, E AS TAXAS QUE ELE SUSTENTA
//
// ── POR QUE OS DESVIOS FICAM SEPARADOS ──────────────────────────────────────
// Doze etapas em doze caixas iguais viram uma lista, e uma lista não se lê como
// uma descida. "Não participou" e "Demonstração individual" não são degraus
// para baixo: são saídas laterais de quem continua alcançável.
//
// Separá-los deixa a coluna principal legível — e é ela que responde, numa
// olhada, se a campanha está andando.
//
// ── A TAXA SÓ APARECE QUANDO SIGNIFICA ALGUMA COISA ─────────────────────────
// Um cliente em dois convidados é "50% de conversão", e é uma frase que só
// serve para enganar quem a lê — inclusive quem escreveu. Abaixo da base
// mínima a tela mostra os dois números crus e NENHUMA porcentagem, com o
// motivo escrito ao lado.
// ─────────────────────────────────────────────────────────────────────────────

export function FunilDaCampanha({
  campanha,
  etapaAtiva,
  aoEscolherEtapa,
}: {
  campanha: string;
  etapaAtiva: string;
  aoEscolherEtapa: (etapa: string) => void;
}) {
  const dados = useQuery(api.admin.funilDaCampanha, { campanha });

  if (dados === undefined) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const principais = dados.porEstagio.filter((e) => !e.ramo);
  const ramos = dados.porEstagio.filter((e) => e.ramo);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <GitBranch className="size-4 text-primary" /> O funil
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {dados.total} {dados.total === 1 ? "pessoa" : "pessoas"} nesta campanha
          {!dados.completa && " (li até o limite da varredura — há mais)"}
        </p>
      </div>

      {dados.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém aqui ainda. Importe uma lista ou espere quem chegar pela landing.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {principais.map((e) => (
              <Etapa
                key={e.id}
                id={e.id}
                rotulo={e.rotulo}
                quantidade={e.quantidade}
                total={dados.total}
                ativa={etapaAtiva === e.id}
                aoClicar={aoEscolherEtapa}
              />
            ))}
          </div>

          {ramos.some((r) => r.quantidade > 0) && (
            <div className="space-y-1 border-t border-border pt-3">
              <p className="mb-1 text-xs text-muted-foreground">Fora da linha principal</p>
              {ramos
                .filter((r) => r.quantidade > 0)
                .map((e) => (
                  <Etapa
                    key={e.id}
                    id={e.id}
                    rotulo={e.rotulo}
                    quantidade={e.quantidade}
                    total={dados.total}
                    ativa={etapaAtiva === e.id}
                    aoClicar={aoEscolherEtapa}
                  />
                ))}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Taxas
            </p>
            {dados.taxas.map((t) => (
              <div key={t.chave} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">{t.rotulo}</span>
                  <span className="font-semibold tabular-nums">
                    {/* A base vai JUNTO, sempre. Taxa sem base é propaganda. */}
                    {t.percentual !== null ? `${t.percentual}%` : "—"}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {t.numerador}/{t.denominador}
                    </span>
                  </span>
                </div>
                {t.semPercentualPorque && (
                  <p className="text-xs leading-tight text-muted-foreground">
                    {t.semPercentualPorque}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Etapa({
  id,
  rotulo,
  quantidade,
  total,
  ativa,
  aoClicar,
}: {
  id: string;
  rotulo: string;
  quantidade: number;
  total: number;
  ativa: boolean;
  aoClicar: (etapa: string) => void;
}) {
  const largura = total > 0 ? Math.round((quantidade / total) * 100) : 0;
  return (
    <button
      onClick={() => aoClicar(ativa ? "" : id)}
      aria-pressed={ativa}
      className={cn(
        "relative flex w-full cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        ativa ? "ring-2 ring-primary" : "hover:bg-accent",
      )}
    >
      {/* A barra é fundo, não elemento — assim a linha continua legível em
          320px, onde uma barra ao lado do texto não caberia. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-primary/10"
        style={{ width: `${largura}%` }}
      />
      <span className="relative truncate">{rotulo}</span>
      <span className="relative font-semibold tabular-nums">{quantidade}</span>
    </button>
  );
}
