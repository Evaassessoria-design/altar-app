import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronUp, Presentation } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// "ESTE EVENTO ESTÁ PRONTO PARA SER MOSTRADO?"
//
// ── POR QUE NÃO BASTA A SAÚDE DO EVENTO ─────────────────────────────────────
// A Saúde, logo acima nesta tela, mede se a OPERAÇÃO está coberta: contrato,
// fornecedor, equipe, financeiro. É a pergunta de quem vai executar.
//
// Esta é a pergunta de quem vai APRESENTAR. Um evento pode estar 100% saudável
// e o Projeto Visual abrir em branco, porque nenhuma foto foi classificada.
// Descobrir isso na frente da cliente é o problema que esta seção resolve.
//
// ── FECHADA POR PADRÃO ──────────────────────────────────────────────────────
// No dia a dia ela não é a pergunta. Vira a pergunta na véspera de mandar o
// projeto — e aí ela está a um toque, com número em vez de promessa.
// ─────────────────────────────────────────────────────────────────────────────

const SINAL: Record<string, { icone: string; classe: string }> = {
  pronto: { icone: "✓", classe: "text-green-600 dark:text-green-400" },
  atencao: { icone: "⚠", classe: "text-amber-600 dark:text-amber-500" },
  faltando: { icone: "✕", classe: "text-destructive" },
};

export function ProntoParaMostrar({ eventId }: { eventId: Id<"events"> }) {
  const [aberto, setAberto] = useState(false);
  // `skip` enquanto fechada: sete consultas por evento não devem rodar em toda
  // visita à tela para responder uma pergunta que ela faz uma vez por mês.
  const r = useQuery(api.health.getEventReadiness, aberto ? { eventId } : "skip");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Presentation className="size-4 text-primary" /> Pronto para mostrar?
        </h2>
        <div className="flex items-center gap-3">
          {r && (
            <span
              className={cn(
                "text-xs font-medium",
                r.apresentavel ? "text-green-600 dark:text-green-400" : "text-amber-600",
              )}
            >
              {r.apresentavel ? "Sim" : `${r.faltando + r.atencao} a resolver`}
            </span>
          )}
          {aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {aberto && (
        <div className="border-t border-border p-5">
          {r === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : r === null ? (
            <p className="text-sm text-muted-foreground">Evento não encontrado.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                O que a cliente vê: capa, referências classificadas, flores com foto e o
                projeto pronto para virar PDF. Diferente da Saúde acima, que mede a
                operação.
              </p>
              <div className="space-y-2">
                {r.itens.map((i) => (
                  <div key={i.chave} className="flex items-start gap-2 text-sm">
                    <span className={cn("mt-0.5 flex-shrink-0", SINAL[i.situacao].classe)}>
                      {SINAL[i.situacao].icone}
                    </span>
                    <div className="min-w-0">
                      <p className="leading-tight">
                        {i.rotulo}{" "}
                        <span className="text-muted-foreground">— {i.detalhe}</span>
                      </p>
                      {/* A ação só aparece quando há o que fazer. Um "tudo
                          certo" seguido de instrução ensina a ignorar o
                          texto. */}
                      {i.acao && (
                        <p className="text-xs leading-tight text-muted-foreground">{i.acao}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
