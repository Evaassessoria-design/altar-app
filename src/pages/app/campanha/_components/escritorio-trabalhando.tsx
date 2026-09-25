import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import type { Cor } from "@/convex/lib/escritorio/autonomia";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { formatTimestamp } from "@/lib/safe-date.ts";
import { Bot, ChevronDown, ChevronUp, Play, Plug } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// O ESCRITÓRIO TRABALHANDO
//
// ── O PRINCÍPIO, NA TELA ────────────────────────────────────────────────────
// "O ALTAR não pede autorização para trabalhar. Ele pede decisão quando
// ultrapassa a autonomia que o usuário definiu."
//
// Por isso a configuração fica RECOLHIDA. O que se vê primeiro é o que ele
// fez; ajustar até onde ele vai é uma decisão que se toma uma vez, não toda
// manhã.
//
// ── NENHUM INTERRUPTOR MENTIROSO ────────────────────────────────────────────
// Capacidade que exige canal externo não aparece como "desligada" — aparece
// como INDISPONÍVEL, com a razão escrita. Um interruptor que a pessoa liga e
// que não faz nada ensina que os outros também podem ser decorativos.
// ─────────────────────────────────────────────────────────────────────────────

const TOM: Record<Cor, string> = {
  verde: "text-green-600 dark:text-green-400",
  amarelo: "text-amber-600 dark:text-amber-500",
  vermelho: "text-destructive",
};

export function EscritorioTrabalhando({ campanha }: { campanha: string }) {
  const politica = useQuery(api.escritorioCiclo.autonomia, { campanha });
  const historico = useQuery(api.escritorioCiclo.execucoes, { campanha });
  const rodar = useMutation(api.escritorioCiclo.rodarAgora);
  const definir = useMutation(api.escritorioCiclo.definirAutonomia);
  const [rodando, setRodando] = useState(false);
  const [config, setConfig] = useState(false);

  if (politica === undefined || historico === undefined) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  async function rodarAgora() {
    setRodando(true);
    try {
      const r = await rodar({ campanha });
      // Cada desfecho vira frase. "Pronto" esconderia que nada foi feito, e
      // nada feito é o resultado NORMAL da segunda rodada do dia.
      const detalhes: string[] = [];
      if (r.jaExistiam > 0) detalhes.push(`${r.jaExistiam} já estavam prontas`);
      if (r.naoCouberam > 0) detalhes.push(`${r.naoCouberam} ficaram para a próxima rodada`);
      if (r.bloqueadasPorAutonomia > 0) {
        detalhes.push(`${r.bloqueadasPorAutonomia} não foram feitas por configuração`);
      }
      toast.success(r.resumo, {
        description: detalhes.length > 0 ? detalhes.join(" · ") : undefined,
      });
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "O Escritório não conseguiu rodar agora",
      );
    } finally {
      setRodando(false);
    }
  }

  async function alternar(capacidade: string, ligada: boolean) {
    try {
      await definir({ campanha, capacidade, ligada });
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "Não deu para mudar",
      );
    }
  }

  const { hoje, ultima } = historico;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <Bot className="size-4 text-primary" /> O Escritório
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {politica.resumo.verdesAtivas} de {politica.resumo.verdesTotal} tarefas internas
            ligadas · {politica.recado}
          </p>
        </div>
        <Button
          size="sm"
          disabled={rodando}
          onClick={() => void rodarAgora()}
          className="flex-shrink-0 cursor-pointer gap-1.5"
        >
          <Play className="size-3.5" />
          {rodando ? "Trabalhando…" : "Rodar agora"}
        </Button>
      </div>

      {/* ── O QUE ELE FEZ HOJE ───────────────────────────────────────────
          "Nunca rodou hoje" é dito com todas as letras. Mostrar zeros faria
          parecer que ele rodou e não achou nada — que é outra coisa. */}
      {hoje.nuncaRodou ? (
        <p className="text-sm text-muted-foreground">
          O Escritório ainda não rodou hoje.
          {/* `formatTimestamp` devolve "—" em vez de lançar: `toLocaleDateString`
              sobre um carimbo inválido derruba o render inteiro até o
              ErrorBoundary, e foi assim que o Painel Admin caiu uma vez. */}
          {ultima && ` A última vez foi em ${formatTimestamp(ultima.criadoEm)}.`}
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hoje o Escritório fez
          </p>
          <ul className="space-y-1">
            {[
              [hoje.analisadas, "pessoa analisada", "pessoas analisadas"],
              [hoje.mensagensPreparadas, "mensagem escrita", "mensagens escritas"],
              [hoje.duplicidadesApontadas, "possível repetida", "possíveis repetidas"],
              [hoje.decisoesParaVoce, "decisão para você", "decisões para você"],
            ]
              .filter(([n]) => (n as number) > 0)
              .map(([n, um, muitos]) => (
                <li key={um as string} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-6 font-semibold tabular-nums">{n as number}</span>
                  <span className="text-muted-foreground">
                    {(n as number) === 1 ? (um as string) : (muitos as string)}
                  </span>
                </li>
              ))}
          </ul>
          {hoje.mensagensPreparadas === 0 && hoje.analisadas > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Nada novo a escrever — o trabalho já estava pronto.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {hoje.rodadas} {hoje.rodadas === 1 ? "rodada" : "rodadas"} hoje · nenhuma mensagem
            saiu do ALTAR
          </p>
        </div>
      )}

      {/* ── ATÉ ONDE ELE VAI ─────────────────────────────────────────────
          Recolhida: é decisão que se toma uma vez, não toda manhã. */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setConfig(!config)}
          aria-expanded={config}
          className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Até onde o Escritório vai sozinho
          </span>
          {config ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {config && (
          <div className="mt-3 space-y-3">
            {(["verde", "amarelo", "vermelho"] as const).map((cor) => {
              const doGrupo = politica.capacidades.filter((c) => c.cor === cor);
              if (doGrupo.length === 0) return null;
              return (
                <div key={cor}>
                  <p className={cn("mb-1.5 text-xs font-medium", TOM[cor])}>
                    {cor === "verde"
                      ? "Faz sozinho"
                      : cor === "amarelo"
                        ? "Falaria com alguém de fora"
                        : "Nunca é automático"}
                  </p>
                  <ul className="space-y-1.5">
                    {doGrupo.map((c) => (
                      <li key={c.id} className="flex items-start gap-2.5">
                        {/* Vermelho não tem interruptor: não é escolha. */}
                        {c.cor === "vermelho" ? (
                          <span
                            aria-hidden
                            className="mt-1 size-3.5 flex-shrink-0 rounded border border-border bg-muted"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            id={`cap-${c.id}`}
                            checked={c.escolhida}
                            disabled={!c.disponivel}
                            onChange={(e) => void alternar(c.id, e.target.checked)}
                            className="mt-1 size-3.5 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                        )}
                        <label
                          htmlFor={c.cor === "vermelho" ? undefined : `cap-${c.id}`}
                          className={cn(
                            "min-w-0 flex-1",
                            c.cor !== "vermelho" && c.disponivel && "cursor-pointer",
                          )}
                        >
                          <span className="block text-sm leading-tight">{c.rotulo}</span>
                          <span className="block text-xs leading-tight text-muted-foreground">
                            {c.descricao}
                          </span>
                          {/* A razão de não estar ativa, quando não é escolha
                              dele. É o que impede a leitura "está quebrado". */}
                          {!c.disponivel && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs leading-tight text-amber-600 dark:text-amber-500">
                              <Plug className="size-3" /> {c.porQueNao}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
