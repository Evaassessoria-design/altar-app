import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  CalendarDays,
  MapPin,
  User,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils.ts";
import EventFormDialog from "./_components/event-form-dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

type FilterType = "all" | "upcoming" | "completed" | "cancelled";

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "upcoming", label: "Próximos" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
];

const TYPE_LABELS: Record<string, string> = {
  wedding: "Casamento",
  corporate: "Corporativo",
  birthday: "Aniversário",
  debutante: "Debutante",
  baptism: "Batizado",
  other: "Outro",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planning: { label: "Planejamento", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  confirmed: { label: "Confirmado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "Em Andamento", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  completed: { label: "Concluído", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default function EventsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Doc<"events"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"events"> | null>(null);

  const events = useQuery(api.events.list, { filter });
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);

  const handleCreate = async (values: Parameters<typeof createEvent>[0]) => {
    try {
      await createEvent(values);
      toast.success("Evento criado com sucesso!");
    } catch (err) {
      if (err instanceof ConvexError) {
        toast.error((err.data as { message: string }).message);
      } else {
        toast.error("Erro ao criar evento");
      }
    }
  };

  const handleUpdate = async (values: Omit<Parameters<typeof updateEvent>[0], "id">) => {
    if (!editingEvent) return;
    try {
      await updateEvent({ id: editingEvent._id, ...values });
      toast.success("Evento atualizado!");
    } catch (err) {
      if (err instanceof ConvexError) {
        toast.error((err.data as { message: string }).message);
      } else {
        toast.error("Erro ao atualizar evento");
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await removeEvent({ id: deletingId });
      toast.success("Evento excluído.");
    } catch {
      toast.error("Erro ao excluir evento");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eventos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {events?.length ?? 0} evento{(events?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer flex items-center gap-2">
          <Plus className="size-4" />
          Novo Evento
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {events === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>Nenhum evento encontrado</EmptyTitle>
            <EmptyDescription>
              {filter === "all"
                ? "Crie seu primeiro evento para começar"
                : "Nenhum evento nessa categoria ainda"}
            </EmptyDescription>
          </EmptyHeader>
          {filter === "all" && (
            <EmptyContent>
              <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
                <Plus className="size-4 mr-2" /> Criar Evento
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
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
                        {TYPE_LABELS[event.type] ?? event.type}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5 flex-shrink-0" />
                        <span>{format(new Date(event.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="size-3.5 flex-shrink-0" />
                        <span className="truncate">{event.clientName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground col-span-2">
                        <MapPin className="size-3.5 flex-shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </div>
                      {event.budget !== undefined && (
                        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                          <DollarSign className="size-3.5 flex-shrink-0" />
                          <span>
                            {event.budget.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingEvent(event as Doc<"events">)}
                      className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeletingId(event._id)}
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
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O evento será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
