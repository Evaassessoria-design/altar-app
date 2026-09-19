import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AlertTriangle, CalendarClock, Check, Plus, X } from "lucide-react";
import {
  agruparTarefas,
  OPCOES_DE_STATUS_DE_TRABALHO,
  OPCOES_DE_TIPO_DE_TRABALHO,
  ROTULO_DO_STATUS_DE_TRABALHO,
  ROTULO_DO_TIPO_DE_TRABALHO,
  TODOS,
  type StatusDeTrabalho,
  type TipoDeTrabalho,
} from "@/lib/central-inbox.ts";
import { CLASSE_DA_PRIORIDADE, ROTULO_DA_PRIORIDADE, type Prioridade } from "@/lib/central-fila.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TAREFAS DA OPERAÇÃO — follow-up com dono, prazo e fim
//
// A tarefa existe fora da conversa de propósito: um follow-up de trial nasce
// do calendário, e um atendimento encerrado não pode levar embora a pendência
// que ele gerou.
//
// "Contato de cobrança" é falar com a pessoa sobre o pagamento. Nada aqui
// toca em assinatura, cobrança ou no Asaas — a Central lembra, quem movimenta
// dinheiro é o fluxo financeiro, por decisão humana, fora desta tela.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_DO_SELECT =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

type Tarefa = NonNullable<ReturnType<typeof useQuery<typeof api.adminWorkItems.listar>>>[number];

export function Tarefas() {
  const [status, setStatus] = useState<StatusDeTrabalho | "">("");
  const [tipo, setTipo] = useState<TipoDeTrabalho | "">("");
  const [responsavel, setResponsavel] = useState("");
  const [criando, setCriando] = useState(false);

  const operadores = useQuery(api.admin.listarOperadores, {});
  const tarefas = useQuery(api.adminWorkItems.listar, {
    status: status || undefined,
    tipo: tipo || undefined,
    responsavelUserId: (responsavel || undefined) as Id<"users"> | undefined,
    limite: 200,
  });

  const grupos = agruparTarefas(tarefas ?? []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Situação da tarefa"
            className={CLASSE_DO_SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusDeTrabalho | "")}
          >
            <option value={TODOS}>Todas as situações</option>
            {OPCOES_DE_STATUS_DE_TRABALHO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>

          <select
            aria-label="Tipo da tarefa"
            className={CLASSE_DO_SELECT}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeTrabalho | "")}
          >
            <option value={TODOS}>Todos os tipos</option>
            {OPCOES_DE_TIPO_DE_TRABALHO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>

          <select
            aria-label="Responsável"
            className={CLASSE_DO_SELECT}
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
          >
            <option value={TODOS}>Qualquer responsável</option>
            {(operadores ?? []).map((o) => (
              <option key={o._id} value={o._id}>
                {o.name}
              </option>
            ))}
          </select>

          <Button size="sm" className="ml-auto" onClick={() => setCriando((v) => !v)}>
            <Plus className="size-3.5" /> Nova tarefa
          </Button>
        </div>

        {criando && <NovaTarefa onPronto={() => setCriando(false)} />}
      </div>

      {tarefas === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : tarefas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
          Nenhuma tarefa com estes filtros.
        </p>
      ) : (
        <div className="space-y-4">
          <Grupo
            titulo="Vencidas"
            tarefas={grupos.vencidas}
            operadores={operadores ?? []}
            alerta
          />
          <Grupo titulo="Vencem hoje" tarefas={grupos.hoje} operadores={operadores ?? []} />
          <Grupo titulo="Próximas" tarefas={grupos.proximas} operadores={operadores ?? []} />
          <Grupo titulo="Sem prazo" tarefas={grupos.semPrazo} operadores={operadores ?? []} />
          <Grupo titulo="Concluídas" tarefas={grupos.concluidas} operadores={operadores ?? []} />
          <Grupo titulo="Canceladas" tarefas={grupos.canceladas} operadores={operadores ?? []} />
        </div>
      )}
    </div>
  );
}

function NovaTarefa({ onPronto }: { onPronto: () => void }) {
  const criar = useMutation(api.adminWorkItems.criar);
  const operadores = useQuery(api.admin.listarOperadores, {});
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoDeTrabalho>("follow_up");
  const [venceEm, setVenceEm] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto] items-center">
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="O que precisa ser feito"
        aria-label="Título da nova tarefa"
      />
      <select
        aria-label="Tipo da nova tarefa"
        className={CLASSE_DO_SELECT}
        value={tipo}
        onChange={(e) => setTipo(e.target.value as TipoDeTrabalho)}
      >
        {OPCOES_DE_TIPO_DE_TRABALHO.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Input
        type="date"
        value={venceEm}
        onChange={(e) => setVenceEm(e.target.value)}
        aria-label="Prazo da nova tarefa"
      />
      <select
        aria-label="Responsável pela nova tarefa"
        className={CLASSE_DO_SELECT}
        value={responsavel}
        onChange={(e) => setResponsavel(e.target.value)}
      >
        <option value={TODOS}>Sem responsável</option>
        {(operadores ?? []).map((o) => (
          <option key={o._id} value={o._id}>
            {o.name}
          </option>
        ))}
      </select>
      <Button
        disabled={ocupado || titulo.trim().length === 0}
        onClick={async () => {
          setOcupado(true);
          try {
            await criar({
              titulo: titulo.trim(),
              tipo,
              venceEm: venceEm || undefined,
              responsavelUserId: (responsavel || undefined) as Id<"users"> | undefined,
            });
            toast.success("Tarefa criada.");
            setTitulo("");
            setVenceEm("");
            onPronto();
          } catch (erro) {
            toast.error(erroLegivel(erro));
          } finally {
            setOcupado(false);
          }
        }}
      >
        Criar
      </Button>
    </div>
  );
}

function Grupo({
  titulo,
  tarefas,
  operadores,
  alerta,
}: {
  titulo: string;
  tarefas: Tarefa[];
  operadores: { _id: Id<"users">; name: string }[];
  alerta?: boolean;
}) {
  if (tarefas.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className={cn(
          "px-4 py-2 border-b border-border text-sm font-medium flex items-center gap-2",
          alerta && "text-red-700 dark:text-red-400",
        )}
      >
        {alerta ? <AlertTriangle className="size-4" /> : <CalendarClock className="size-4" />}
        {titulo}
        <span className="text-xs text-muted-foreground font-normal">({tarefas.length})</span>
      </div>
      <ul className="divide-y divide-border">
        {tarefas.map((t) => (
          <ItemDaTarefa key={t._id} tarefa={t} operadores={operadores} />
        ))}
      </ul>
    </div>
  );
}

function ItemDaTarefa({
  tarefa,
  operadores,
}: {
  tarefa: Tarefa;
  operadores: { _id: Id<"users">; name: string }[];
}) {
  const atualizar = useMutation(api.adminWorkItems.atualizar);
  const [ocupado, setOcupado] = useState(false);

  async function mudar(
    args: Parameters<typeof atualizar>[0],
    mensagem: string,
  ) {
    setOcupado(true);
    try {
      await atualizar(args);
      toast.success(mensagem);
    } catch (erro) {
      toast.error(erroLegivel(erro));
    } finally {
      setOcupado(false);
    }
  }

  const encerrada = tarefa.status === "concluido" || tarefa.status === "cancelado";

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", encerrada && "line-through text-muted-foreground")}>
            {tarefa.titulo}
          </p>
          <p className="text-xs text-muted-foreground">
            {ROTULO_DO_TIPO_DE_TRABALHO[tarefa.tipo as TipoDeTrabalho] ?? tarefa.tipo} ·{" "}
            {ROTULO_DO_STATUS_DE_TRABALHO[tarefa.status as StatusDeTrabalho]}
            {tarefa.venceEm ? ` · vence ${tarefa.venceEm}` : " · sem prazo"}
            {tarefa.criadoPor === "ia" ? " · sugerida pela IA" : ""}
          </p>
        </div>

        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            CLASSE_DA_PRIORIDADE[tarefa.prioridade as Prioridade],
          )}
        >
          {ROTULO_DA_PRIORIDADE[tarefa.prioridade as Prioridade]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <select
          aria-label={`Responsável por ${tarefa.titulo}`}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={tarefa.responsavelUserId ?? ""}
          disabled={ocupado}
          onChange={(e) => {
            const valor = e.target.value;
            void mudar(
              valor
                ? { workItemId: tarefa._id, responsavelUserId: valor as Id<"users"> }
                : { workItemId: tarefa._id, limparResponsavel: true },
              valor ? "Responsável definido." : "Responsável removido.",
            );
          }}
        >
          <option value="">Sem responsável</option>
          {operadores.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))}
        </select>

        <Input
          type="date"
          className="h-8 w-auto text-xs"
          value={tarefa.venceEm ?? ""}
          disabled={ocupado}
          aria-label={`Prazo de ${tarefa.titulo}`}
          onChange={(e) => {
            const valor = e.target.value;
            void mudar(
              valor
                ? { workItemId: tarefa._id, venceEm: valor }
                : { workItemId: tarefa._id, limparVencimento: true },
              valor ? "Prazo atualizado." : "Prazo removido.",
            );
          }}
        />

        {!encerrada ? (
          <>
            {tarefa.status === "aberto" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={ocupado}
                onClick={() =>
                  void mudar(
                    { workItemId: tarefa._id, status: "em_andamento" },
                    "Tarefa em andamento.",
                  )
                }
              >
                Começar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={ocupado}
              onClick={() =>
                void mudar({ workItemId: tarefa._id, status: "concluido" }, "Tarefa concluída.")
              }
            >
              <Check className="size-3.5" /> Concluir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={ocupado}
              onClick={() =>
                void mudar({ workItemId: tarefa._id, status: "cancelado" }, "Tarefa cancelada.")
              }
            >
              <X className="size-3.5" /> Cancelar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={ocupado}
            onClick={() => void mudar({ workItemId: tarefa._id, status: "aberto" }, "Tarefa reaberta.")}
          >
            Reabrir
          </Button>
        )}
      </div>
    </li>
  );
}
