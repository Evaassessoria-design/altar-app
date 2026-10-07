import { useState } from "react";
import { descreverUltimaAtualizacao } from "@/convex/lib/ultimaAtualizacao.ts";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  CalendarDays,
  MapPin,
  User,
  Users,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Search,
  X,
  CheckSquare,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { lerRecorteDeEventos, descreverRecorte } from "@/lib/recorte-de-eventos.ts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils.ts";
import EventFormDialog from "./_components/event-form-dialog.tsx";
import { ConfirmarExclusaoDeEvento } from "./_components/confirmar-exclusao.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { labelDoTipoDeEvento } from "@/lib/event-types.ts";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

import { formatEventDayOnly } from "@/lib/event-date.ts";
type FilterType = "all" | "upcoming" | "completed" | "cancelled";

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "upcoming", label: "Próximos" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planning: { label: "Planejamento", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  confirmed: { label: "Confirmado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "Em Andamento", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  completed: { label: "Concluído", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const HEALTH_CFG: Record<string, { dot: string; cls: string }> = {
  complete: { dot: "🟢", cls: "text-green-600 dark:text-green-400" },
  attention: { dot: "🟡", cls: "text-amber-600 dark:text-amber-400" },
  incomplete: { dot: "🔴", cls: "text-red-600 dark:text-red-400" },
};

function HealthBadge({ health }: { health?: { percent: number; status: string } }) {
  if (!health) return null;
  const m = HEALTH_CFG[health.status] ?? HEALTH_CFG.incomplete;
  return (
    <span
      className={cn("text-xs font-medium whitespace-nowrap", m.cls)}
      title="Saúde do Evento"
    >
      {m.dot} {health.percent}%
    </span>
  );
}

export default function EventsPage() {
  // ── O FILTRO MORA NA URL ───────────────────────────────────────────────
  // Os atalhos do Dashboard abrem esta tela já no recorte do card ("Próximos",
  // um status, um mês, o checklist pendente). Na URL, o voltar do navegador e
  // o link compartilhado levam ao mesmo recorte.
  const [params, setParams] = useSearchParams();
  const recorte = lerRecorteDeEventos(params);
  const filter: FilterType = recorte.filtro;
  const setFilter = (f: FilterType) => setParams(f === "all" ? {} : { filtro: f });
  const limparRecorte = () => setParams({});
  // O checklist pendente vem da MESMA leitura que fez o número do card.
  const painel = useQuery(api.dashboard.getDashboardStats, recorte.tipo === "checklist" ? {} : "skip");
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Doc<"events"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"events"> | null>(null);

  const [busca, setBusca] = useState("");

  const events = useQuery(api.health.listCards, { filter });

  // ── A BUSCA FILTRA A LISTA COMPLETA, E ISSO É DIFERENTE ────────────────
  // "Filtro entra na consulta" vale quando a tela mostra UMA PÁGINA: filtrar
  // o que já veio faria a contagem mentir sobre o que existe atrás. Aqui não
  // é o caso — `listCards` devolve TODOS os eventos da conta, sem teto.
  // Filtrar esse array é filtrar o conjunto inteiro, e a contagem continua
  // verdadeira.
  //
  // Isto amarra a busca ao fato de a consulta não paginar. Se um dia ela
  // paginar — e vai precisar, ver `docs/escala-e-projeto-visual.md` — a busca
  // tem que descer junto para o backend, ou a tela passa a mentir.
  const termo = busca.trim().toLowerCase();
  const visiveis = (events ?? []).filter((e) => {
    // Os recortes do Dashboard: os mesmos critérios dos números de lá —
    // `byStatus` conta todos os eventos daquele status; o gráfico de meses
    // conta todo evento com data no mês, de qualquer status.
    if (recorte.tipo === "status" && e.status !== recorte.status) return false;
    if (recorte.tipo === "mes" && e.date.slice(0, 7) !== recorte.mes) return false;
    if (!termo) return true;
    // Ela procura pelo nome do cliente, pelo local ou pela data — é assim que
    // se lembra de um evento, não pelo título que cadastrou meses atrás. E
    // "cliente" e não "noivos": o ALTAR também faz 15 anos e corporativo, e
    // `produto-generico.test.ts` cobra isso em todo texto de tela.
    return [e.name, e.clientName, e.location, e.date]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(termo));
  });
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);

  const handleCreate = async (values: Parameters<typeof createEvent>[0]) => {
    try {
      await createEvent(values);
      toast.success("Evento criado com sucesso!");
      return true;
    } catch (err) {
      if (err instanceof ConvexError) {
        toast.error((err.data as { message: string }).message);
      } else {
        toast.error("Erro ao criar evento");
      }
      return false;
    }
  };

  const handleUpdate = async (values: Omit<Parameters<typeof updateEvent>[0], "id">) => {
    if (!editingEvent) return;
    try {
      await updateEvent({ id: editingEvent._id, ...values });
      toast.success("Evento atualizado!");
      return true;
    } catch (err) {
      if (err instanceof ConvexError) {
        toast.error((err.data as { message: string }).message);
      } else {
        toast.error("Erro ao atualizar evento");
      }
      return false;
    }
  };

  // Erro (inclusive a recusa por recebimentos ou peças na rua) é mostrado
  // pela própria confirmação, que continua aberta — ver ConfirmarExclusaoDeEvento.
  const handleDelete = async () => {
    if (!deletingId) return;
    await removeEvent({ id: deletingId });
    toast.success("Evento excluído.");
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eventos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {termo
              ? `${visiveis.length} de ${events?.length ?? 0} evento${(events?.length ?? 0) !== 1 ? "s" : ""}`
              : `${events?.length ?? 0} evento${(events?.length ?? 0) !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer flex items-center gap-2">
          <Plus className="size-4" />
          Novo Evento
        </Button>
      </div>

      {/* O recorte que veio do Dashboard, dito com palavras, e a saída dele. */}
      {recorte.tipo !== "nenhum" && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <p className="flex-1">
            {descreverRecorte(recorte)}
            {recorte.tipo !== "checklist" && events !== undefined && (
              <span className="text-muted-foreground">
                {" "}· {visiveis.length} evento{visiveis.length === 1 ? "" : "s"}
              </span>
            )}
          </p>
          <button
            onClick={limparRecorte}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer min-h-9 px-1"
          >
            <X className="size-3.5" /> Ver todos
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              filter === f.value && recorte.tipo !== "status" && recorte.tipo !== "mes" && recorte.tipo !== "checklist"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── BUSCA ──────────────────────────────────────────────────────────
          Aparece a partir de uma dúzia de eventos. Com cinco, um campo de
          busca é ruído; com quarenta — que é o que uma decoradora real já
          tem — rolar a lista inteira para achar "Marina" é o trabalho que o
          produto deveria estar poupando. */}
      {(events?.length ?? 0) >= 12 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, local ou data"
            aria-label="Buscar eventos"
            // `h-11` e `text-base`: alvo de toque de verdade, e abaixo de 16px
            // o iOS dá zoom ao focar e a tela salta na cara de quem digita.
            className="h-11 pl-9 text-base md:text-sm"
          />
        </div>
      )}

      {recorte.tipo === "checklist" ? (
        painel === undefined ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : painel.checklistPorEvento.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><CheckSquare /></EmptyMedia>
              <EmptyTitle>Nenhum item de checklist pendente</EmptyTitle>
              <EmptyDescription>
                Os eventos dos próximos 30 dias estão com o checklist em dia — ou ainda não têm
                checklist. O checklist de cada evento fica na pasta dele.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-2">
            {painel.checklistPorEvento.map((ev) => (
              <li key={ev.eventId} className="bg-card rounded-xl border border-border p-4">
                <Link to={`/eventos/${ev.eventId}`} className="font-semibold text-sm hover:text-primary">
                  {ev.nome}
                </Link>
                <p className="text-xs text-muted-foreground">{formatEventDayOnly(ev.data)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ev.pre > 0 && (
                    <Link
                      to={`/eventos/${ev.eventId}/checklist/pre`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 min-h-9 text-xs hover:bg-accent"
                    >
                      Carregamento: {ev.pre} pendente{ev.pre === 1 ? "" : "s"} <ChevronRight className="size-3" />
                    </Link>
                  )}
                  {ev.post > 0 && (
                    <Link
                      to={`/eventos/${ev.eventId}/checklist/post`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 min-h-9 text-xs hover:bg-accent"
                    >
                      Conferência: {ev.post} pendente{ev.post === 1 ? "" : "s"} <ChevronRight className="size-3" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : events === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>Nenhum evento encontrado</EmptyTitle>
            <EmptyDescription>
              {/* Três situações diferentes que a tela dizia com a mesma frase.
                  "Crie seu primeiro evento" com quarenta no banco e a busca
                  escrita é o produto ignorando o que a pessoa acabou de fazer. */}
              {termo
                ? `Nenhum evento com “${busca.trim()}”. Tente o nome do cliente ou o local.`
                : recorte.tipo === "status" || recorte.tipo === "mes"
                  ? "Nenhum evento neste recorte. Use “Ver todos” para voltar à lista completa."
                  : filter === "all"
                  ? "Crie seu primeiro evento para começar"
                  : "Nenhum evento nessa categoria ainda"}
            </EmptyDescription>
          </EmptyHeader>
          {filter === "all" && !termo && recorte.tipo === "nenhum" && (
            <EmptyContent>
              <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
                <Plus className="size-4 mr-2" /> Criar Evento
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {visiveis.map((event) => {
            const status = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.planning;
            return (
              <div
                key={event._id}
                className="bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Link
                        to={`/eventos/${event._id}`}
                        className="font-semibold text-sm truncate hover:text-primary cursor-pointer transition-colors"
                      >
                        {event.name}
                      </Link>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", status.className)}>
                        {status.label}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {labelDoTipoDeEvento(event.type)}
                      </span>
                      <HealthBadge health={event.health} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5 flex-shrink-0" />
                        {formatEventDayOnly(event.date)}
                      </span>
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-[60%]">
                        <MapPin className="size-3.5 flex-shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </span>
                      {event.guestCount && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5 flex-shrink-0" />
                          {event.guestCount}
                        </span>
                      )}
                    </div>
                    {(event.assessoria || event.responsible || descreverUltimaAtualizacao(event)) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {event.assessoria && (
                          <span>Assessoria: <span className="text-foreground">{event.assessoria}</span></span>
                        )}
                        {/* "Resp." agora e uma escolha explicita da decoradora
                            (ou a unica pessoa escalada). Antes era quem tivesse
                            sido adicionado primeiro a equipe. */}
                        {event.responsible && (
                          <span>Resp.: <span className="text-foreground">{event.responsible}</span></span>
                        )}
                        {descreverUltimaAtualizacao(event) && (
                          <span>Atualizado {descreverUltimaAtualizacao(event)}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingEvent(event as Doc<"events">)}
                      aria-label={`Editar ${event.name}`}
                      className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeletingId(event._id)}
                      aria-label={`Excluir ${event.name}`}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <ChevronRight className="size-4 text-muted-foreground ml-1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <EventFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="Novo Evento"
      />

      {/* Edit Dialog */}
      {editingEvent && (
        <EventFormDialog
          open={!!editingEvent}
          onClose={() => setEditingEvent(null)}
          onSubmit={handleUpdate}
          defaultValues={editingEvent}
          title="Editar Evento"
        />
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <ConfirmarExclusaoDeEvento eventId={deletingId} onClose={() => setDeletingId(null)} onExcluir={handleDelete} />
      )}
    </div>
  );
}
