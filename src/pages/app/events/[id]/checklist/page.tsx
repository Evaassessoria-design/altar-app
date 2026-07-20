import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

export default function EventChecklistPage() {
  const { id, phase } = useParams<{ id: string; phase: string }>();
  const safePhase = (phase === "pre" || phase === "post") ? phase : "pre";
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");

  const event = useQuery(api.events.get, { id: id as Id<"events"> });
  const items = useQuery(api.briefing.getChecklist, {
    eventId: id as Id<"events">,
    phase: safePhase,
  });
  const addItem = useMutation(api.briefing.addChecklistItem);
  const toggleItem = useMutation(api.briefing.toggleChecklistItem);
  const deleteItem = useMutation(api.briefing.deleteChecklistItem);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      await addItem({
        eventId: id as Id<"events">,
        phase: safePhase,
        name: newItemName.trim(),
        quantity: newItemQty ? parseInt(newItemQty) : undefined,
        order: (items?.length ?? 0) + 1,
      });
      setNewItemName("");
      setNewItemQty("");
    } catch (err) {
      if (err instanceof ConvexError) {
        toast.error((err.data as { message: string }).message);
      } else {
        toast.error("Erro ao adicionar item");
      }
    }
  };

  const handleToggle = async (itemId: Id<"checklistItems">, current: boolean) => {
    await toggleItem({ id: itemId, isChecked: !current });
  };

  const handleDelete = async (itemId: Id<"checklistItems">) => {
    await deleteItem({ id: itemId });
  };

  const checkedCount = items?.filter((i) => i.isChecked).length ?? 0;
  const totalCount = items?.length ?? 0;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const phaseLabel = safePhase === "pre" ? "Carregamento (Pré-evento)" : "Conferência (Pós-evento)";
  const phaseEmoji = safePhase === "pre" ? "🚚" : "✅";

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Back */}
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ArrowLeft className="size-4" />
        {event?.name ?? "Evento"}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {phaseEmoji} {phaseLabel}
          </h1>
          {totalCount > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {checkedCount} de {totalCount} itens concluídos
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Progresso</span>
            <span className="text-primary font-semibold">{progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Add new item */}
      <form onSubmit={handleAdd} className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h2 className="font-semibold text-sm">Adicionar Item</h2>
        <div className="flex gap-2">
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Nome do item..."
            className="flex-1"
          />
          <Input
            value={newItemQty}
            onChange={(e) => setNewItemQty(e.target.value)}
            placeholder="Qtd"
            type="number"
            min="1"
            className="w-20"
          />
          <Button type="submit" disabled={!newItemName.trim()} className="cursor-pointer flex-shrink-0">
            <Plus className="size-4" />
          </Button>
        </div>
      </form>

      {/* Items list */}
      {items === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckSquare />
            </EmptyMedia>
            <EmptyTitle>Checklist vazio</EmptyTitle>
            <EmptyDescription>Adicione itens acima para começar o checklist</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item._id}
              className={cn(
                "bg-card rounded-xl border border-border px-4 py-3 flex items-center gap-3 transition-opacity",
                item.isChecked && "opacity-60",
              )}
            >
              <button
                onClick={() => handleToggle(item._id, item.isChecked)}
                className="flex-shrink-0 cursor-pointer text-primary hover:scale-110 transition-transform"
              >
                {item.isChecked ? (
                  <CheckSquare className="size-5" />
                ) : (
                  <Square className="size-5 text-muted-foreground" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    item.isChecked && "line-through text-muted-foreground",
                  )}
                >
                  {item.name}
                </p>
                {item.quantity !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Qtd: {item.quantity} {item.unit ?? ""}
                  </p>
                )}
                {item.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(item._id)}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {totalCount > 0 && checkedCount === totalCount && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4 text-center">
          <p className="text-green-700 dark:text-green-400 font-semibold text-sm">
            Todos os itens conferidos!
          </p>
        </div>
      )}
    </div>
  );
}
