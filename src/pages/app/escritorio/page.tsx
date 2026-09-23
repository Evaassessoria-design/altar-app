import { useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { Loader2, Send, CircleSlash, AlertCircle, CheckCircle2 } from "lucide-react";
import { TrabalhoAberto } from "./_components/trabalho-aberto.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITÓRIO DE IA — A TELA
//
// ── O QUE ELA PRECISA COMUNICAR EM CINCO SEGUNDOS ───────────────────────────
// "Escrevo o que preciso e minha equipe trabalha."
//
// Por isso a caixa de texto vem ANTES dos cartões de agente. A pergunta da
// decoradora nunca é "quem faz isso?" — é "preciso que alguém faça isso". O
// ALTAR descobre quem; os cartões existem para ela saber que a equipe existe e
// o que cada um alcança, não para ela ter de escolher.
//
// ── O QUE ESTA TELA NÃO É ───────────────────────────────────────────────────
// Não é um chat. Não há histórico de conversa, não há "digitando…", não há
// turno. É uma caixa de DELEGAÇÃO e uma lista de TRABALHOS — o vocabulário de
// quem tem equipe, não o de quem usa um robô.
//
// Também não é a Central: aquela é a operação do SaaS ALTAR, atrás de
// `requireAdmin`, e continua onde estava.
// ─────────────────────────────────────────────────────────────────────────────

const EXEMPLOS = [
  "O que precisa da minha atenção hoje?",
  "Quais recebimentos estão vencidos?",
  "Quais leads estão sem retorno?",
  "Como estão meus próximos eventos?",
  "Tenho alguma compra urgente?",
] as const;

type Tarefa = Doc<"agentTasks">;

/** Hora curta. Data só quando não é hoje — no mesmo dia ela atrapalha. */
function quando(ms: number): string {
  const d = new Date(ms);
  const hoje = new Date();
  const mesmoDia =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function EscritorioPage() {
  const equipe = useQuery(api.escritorio.equipe, {});
  const historico = useQuery(api.escritorio.listar, {});
  const delegar = useMutation(api.escritorio.delegar);
  const executar = useAction(api.escritorioExecutor.executar);

  const [pedido, setPedido] = useState("");
  const [agenteId, setAgenteId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState<Id<"agentTasks"> | null>(null);

  const enviar = async () => {
    const texto = pedido.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const taskId = await delegar({ pedido: texto, agenteId: agenteId || undefined });
      setPedido("");
      // O trabalho já aparece no histórico (a consulta é reativa) enquanto a
      // action corre. Ela não fica olhando para um botão girando.
      setAberto(taskId as Id<"agentTasks">);
      await executar({ taskId: taskId as Id<"agentTasks"> });
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível delegar agora.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const tarefas = historico?.tarefas ?? [];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl md:text-3xl leading-tight">Escritório</h1>
        <p className="text-sm text-muted-foreground">
          Sua equipe lê o que já está no ALTAR e responde. Ela analisa e organiza — não
          envia mensagem, não mexe em dinheiro e não apaga nada.
        </p>
      </header>

      {/* ── A CAIXA ────────────────────────────────────────────────────────
          Vem antes de tudo. É a única coisa que ela precisa entender. */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <Textarea
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          placeholder="Escreva o que você precisa. Ex.: organize meu dia e me diga o que precisa da minha atenção."
          rows={3}
          // `text-base` no celular: abaixo de 16px o iOS dá zoom ao focar, e a
          // tela inteira salta na cara de quem está escrevendo.
          className="text-base resize-none min-h-24"
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={agenteId}
            onChange={(e) => setAgenteId(e.target.value)}
            aria-label="Quem cuida deste pedido"
            // `<select>` nativo: no celular abre a roda do sistema, que é o
            // melhor seletor daquele aparelho, e não fica embaixo do teclado.
            className="h-11 flex-1 min-w-40 rounded-md border border-input bg-transparent px-3 text-base md:text-sm cursor-pointer"
          >
            <option value="">O ALTAR escolhe quem cuida</option>
            {(equipe ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>

          <Button
            onClick={() => void enviar()}
            disabled={enviando || !pedido.trim()}
            // `h-11` e largura cheia no celular: é o botão principal da tela.
            className="cursor-pointer gap-2 h-11 w-full sm:w-auto"
          >
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {enviando ? "Trabalhando…" : "Delegar"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXEMPLOS.map((ex) => (
            <button
              key={ex}
              onClick={() => setPedido(ex)}
              disabled={enviando}
              // `min-h-9` + `text-xs`: alvo tocável sem virar botão gordo.
              className="min-h-9 rounded-full border border-border px-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer text-left"
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* ── A EQUIPE ───────────────────────────────────────────────────────
          Cartões compactos. Existem para ela saber quem existe e o que cada
          um alcança — não para escolher a cada pedido. */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Sua equipe
        </h2>
        {equipe === undefined ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {equipe.map((a) => {
              const emAndamento = tarefas.find(
                (t) => t.agenteId === a.id && (t.status === "queued" || t.status === "running"),
              );
              return (
                <button
                  key={a.id}
                  onClick={() => setAgenteId(a.id)}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors cursor-pointer",
                    agenteId === a.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{a.nome}</p>
                    {emAndamento ? (
                      <span className="flex items-center gap-1 text-[10px] text-primary flex-shrink-0">
                        <Loader2 className="size-3 animate-spin" /> trabalhando
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        disponível
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{a.funcao}</p>
                  {/* `line-clamp-2`: descrição longa não faz um cartão ficar
                      com o dobro da altura do vizinho. */}
                  <p className="mt-1 text-xs text-muted-foreground/90 line-clamp-2">
                    {a.descricao}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── OS TRABALHOS ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Trabalhos recentes
        </h2>

        {historico === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : tarefas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nada por aqui ainda. Escreva o primeiro pedido acima — um dos exemplos serve.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {tarefas.map((t) => (
                <li key={t._id}>
                  <LinhaDoTrabalho
                    tarefa={t}
                    nomeDoAgente={(equipe ?? []).find((a) => a.id === t.agenteId)?.nome}
                    onAbrir={() => setAberto(t._id)}
                  />
                </li>
              ))}
            </ul>
            {historico.temMais && (
              // A tela nunca afirma o que não sabe.
              <p className="text-xs text-muted-foreground">
                {tarefas.length} trabalhos carregados (há mais).
              </p>
            )}
          </>
        )}
      </section>

      {aberto && (
        <TrabalhoAberto
          taskId={aberto}
          nomeDoAgente={(equipe ?? []).find(
            (a) => a.id === tarefas.find((t) => t._id === aberto)?.agenteId,
          )?.nome}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function LinhaDoTrabalho({
  tarefa,
  nomeDoAgente,
  onAbrir,
}: {
  tarefa: Tarefa;
  nomeDoAgente?: string;
  onAbrir: () => void;
}) {
  const trabalhando = tarefa.status === "queued" || tarefa.status === "running";
  return (
    <button
      onClick={onAbrir}
      className="w-full text-left rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/40 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex-shrink-0">
          {trabalhando ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : tarefa.status === "refused" ? (
            <CircleSlash className="size-4 text-muted-foreground" />
          ) : tarefa.status === "failed" ? (
            <AlertCircle className="size-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="size-4 text-primary" />
          )}
        </span>
        {/* `min-w-0`: pedido longo é truncado em vez de estourar a linha. */}
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate">{tarefa.pedido}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {nomeDoAgente ?? "Equipe"}
            {tarefa.roteadoAutomaticamente && " · encaminhado pelo ALTAR"}
            {" · "}
            {quando(tarefa.criadoEm)}
            {trabalhando && " · trabalhando"}
          </p>
        </div>
      </div>
    </button>
  );
}
