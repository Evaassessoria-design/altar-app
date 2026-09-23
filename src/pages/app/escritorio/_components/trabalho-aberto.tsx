import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Loader2, CircleSlash, AlertCircle } from "lucide-react";
import { ROTULO_DA_FONTE, type Fonte } from "@/convex/lib/escritorio/agentes.ts";

// ─────────────────────────────────────────────────────────────────────────────
// UM TRABALHO, ABERTO
//
// ── O QUE APARECE AQUI, E O QUE NUNCA APARECE ───────────────────────────────
// Aparece: o que ela pediu, quem cuidou, a resposta, e — em português — as
// áreas consultadas.
//
// NUNCA aparece: o prompt interno, o nome do modelo, o nome técnico das
// consultas, id de registro, stack trace ou a mensagem crua do provedor. Não é
// só estética: a mensagem de erro de um cliente de IA pode carregar URL de
// gateway e, no pior caso, um pedaço da chave — e isto aqui fica gravado no
// histórico dela.
//
// O erro já chega traduzido do executor (`erroSeguro`). Esta tela não tem como
// mostrar o original porque ele não está no registro.
// ─────────────────────────────────────────────────────────────────────────────

function rotulos(fontes: readonly string[] | undefined): string[] {
  return (fontes ?? [])
    .map((f) => ROTULO_DA_FONTE[f as Fonte])
    .filter((r): r is string => !!r);
}

export function TrabalhoAberto({
  taskId,
  nomeDoAgente,
  onClose,
}: {
  taskId: Id<"agentTasks">;
  nomeDoAgente?: string;
  onClose: () => void;
}) {
  // Reativa: o diálogo abre com a tarefa ainda `queued` e se preenche sozinho
  // quando o executor termina. É o que faz a espera parecer trabalho e não
  // travamento.
  const tarefa = useQuery(api.escritorio.obter, { taskId });

  const trabalhando =
    tarefa && (tarefa.status === "queued" || tarefa.status === "running");
  const areas = rotulos(tarefa?.fontesConsultadas);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* `svh` e não `vh`: no Safari do iPhone a barra de endereço faz `vh`
          prometer uma altura que a tela não tem. */}
      <DialogContent className="max-w-2xl max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {nomeDoAgente ?? "Sua equipe"}
          </DialogTitle>
        </DialogHeader>

        {tarefa === undefined ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : tarefa === null ? (
          // Tarefa de outra conta, ou apagada. A consulta devolve `null` e a
          // tela não afirma que existe.
          <p className="py-8 text-center text-sm text-muted-foreground">
            Este trabalho não está disponível.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase mb-1">
                Você pediu
              </p>
              {/* `whitespace-pre-line` + `break-words`: pedido com quebra de
                  linha e palavra longa não estoura o diálogo a 320 px. */}
              <p className="text-sm whitespace-pre-line break-words">{tarefa.pedido}</p>
            </div>

            {trabalhando ? (
              <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Sua equipe está trabalhando nisso.
              </p>
            ) : tarefa.status === "refused" ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="flex items-center gap-2 text-sm font-medium mb-1.5">
                  <CircleSlash className="size-4 text-muted-foreground" />
                  Sua equipe não faz isso
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {tarefa.resultado}
                </p>
              </div>
            ) : tarefa.status === "failed" ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="flex items-center gap-2 text-sm font-medium mb-1.5">
                  <AlertCircle className="size-4 text-amber-600" />
                  Não deu certo desta vez
                </p>
                <p className="text-sm text-muted-foreground">{tarefa.erro}</p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase mb-1">
                  Resposta
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-line break-words">
                  {tarefa.resultado}
                </p>
              </div>
            )}

            {areas.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase mb-1">
                  Onde consultei
                </p>
                {/* Em português, sempre. A decoradora nunca lê o nome técnico
                    de uma consulta. */}
                <p className="text-xs text-muted-foreground">{areas.join(" · ")}</p>
              </div>
            )}

            {tarefa.provedor === "local" && tarefa.status === "completed" && (
              // ── A HONESTIDADE QUE ESTE PRODUTO PRECISA TER ──────────────
              // Os NÚMEROS acima são os mesmos do Financeiro, do Funil e das
              // Compras — vieram das mesmas consultas, desta conta. O que não
              // aconteceu foi a redação por IA. Deixar isso implícito seria o
              // produto se dando um crédito que não teve.
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Resumo montado pelo próprio ALTAR — a redação por IA não está
                disponível neste ambiente. Os números vêm dos seus dados, como sempre.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
