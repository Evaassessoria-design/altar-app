import { useParams, Link } from "react-router-dom";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
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
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ArrowLeft, Plus, Trash2, CheckSquare, Square, Pencil } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  CHECKLIST_PHASE_COPY,
  checklistProgress,
  sortChecklistItems,
} from "@/lib/checklist.ts";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";

/** Mensagem de erro do Convex, com texto de reserva. */
function erroDe(e: unknown, padrao: string): string {
  return e instanceof ConvexError ? (e.data as { message: string }).message : padrao;
}

/**
 * Edição de um item já cadastrado.
 *
 * A mutation `briefing.updateChecklistItem` já existia no backend e nenhuma
 * tela a chamava: só dava para marcar, desmarcar ou EXCLUIR. Corrigir um nome
 * digitado errado exigia apagar e cadastrar de novo — perdendo o histórico de
 * conferência do item.
 */
function ItemDialog({
  item,
  onClose,
  onSave,
}: {
  item: Doc<"checklistItems">;
  onClose: () => void;
  onSave: (values: {
    name: string;
    quantity?: number;
    unit?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        // Campo em branco limpa o valor; texto inválido não vira NaN no banco.
        quantity: quantity.trim() === "" ? undefined : Number(quantity),
        unit: unit.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const quantidadeInvalida = quantity.trim() !== "" && !Number.isFinite(Number(quantity));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar item</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Item *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                min="0"
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="un, cx, m..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <AutoTextarea
              minRows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: buscar no galpão 2"
            />
          </div>

          {quantidadeInvalida && (
            <p className="text-xs text-destructive">Quantidade precisa ser um número.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || quantidadeInvalida}
              className="cursor-pointer"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventChecklistPage() {
  const { id, phase } = useParams<{ id: string; phase: string }>();
  const safePhase = phase === "pre" || phase === "post" ? phase : "pre";
  const copy = CHECKLIST_PHASE_COPY[safePhase];

  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [editing, setEditing] = useState<Doc<"checklistItems"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"checklistItems"> | null>(null);

  const event = useQuery(api.events.get, { id: id as Id<"events"> });
  const items = useQuery(api.briefing.getChecklist, {
    eventId: id as Id<"events">,
    phase: safePhase,
  });
  const addItem = useMutation(api.briefing.addChecklistItem);
  const toggleItem = useMutation(api.briefing.toggleChecklistItem);
  const updateItem = useMutation(api.briefing.updateChecklistItem);
  const deleteItem = useMutation(api.briefing.deleteChecklistItem);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      await addItem({
        eventId: id as Id<"events">,
        phase: safePhase,
        name: newItemName.trim(),
        quantity: newItemQty ? Number(newItemQty) : undefined,
      });
      setNewItemName("");
      setNewItemQty("");
      toast.success("Item adicionado à lista.");
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível adicionar o item."));
    }
  };

  const handleToggle = async (item: Doc<"checklistItems">) => {
    try {
      await toggleItem({ id: item._id, isChecked: !item.isChecked });
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível atualizar o item."));
    }
  };

  const handleUpdate = async (values: {
    name: string;
    quantity?: number;
    unit?: string;
    notes?: string;
  }) => {
    if (!editing) return;
    try {
      await updateItem({ id: editing._id, ...values });
      toast.success("Item atualizado.");
      setEditing(null);
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível salvar as alterações."));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteItem({ id: deleting._id });
      toast.success("Item removido da lista.");
      setDeleting(null);
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível remover o item."));
    }
  };

  const progresso = checklistProgress(items ?? []);
  // Pendentes primeiro: é a ordem útil de quem está com a lista na mão.
  const ordenados = sortChecklistItems(items ?? []);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ArrowLeft className="size-4" />
        {event?.name ?? "Evento"}
      </Link>

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          {copy.emoji} {copy.titulo}
        </h1>
        {progresso.total > 0 && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {progresso.pendentes > 0
              ? `Faltam ${progresso.pendentes} de ${progresso.total} ${progresso.total === 1 ? "item" : "itens"}`
              : `${progresso.total} ${progresso.total === 1 ? "item conferido" : "itens conferidos"}`}
          </p>
        )}
      </div>

      {progresso.total > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Progresso</span>
            <span className="text-primary font-semibold">
              {progresso.concluidos} de {progresso.total} · {progresso.percentual}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progresso.percentual}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h2 className="font-semibold text-sm">Adicionar item</h2>
        <div className="flex gap-2">
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Ex.: Arranjo alto da mesa do bolo"
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
          <Button
            type="submit"
            disabled={!newItemName.trim()}
            className="cursor-pointer flex-shrink-0"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </form>

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
            <EmptyTitle>{copy.vazioTitulo}</EmptyTitle>
            <EmptyDescription>{copy.vazioDescricao}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {ordenados.map((item) => (
            <div
              key={item._id}
              className={cn(
                "bg-card rounded-xl border border-border px-4 py-3 flex items-center gap-3 transition-opacity",
                item.isChecked && "opacity-60",
              )}
            >
              <button
                onClick={() => handleToggle(item)}
                aria-label={item.isChecked ? `Reabrir ${item.name}` : `Concluir ${item.name}`}
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
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditing(item)}
                  aria-label={`Editar ${item.name}`}
                  className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => setDeleting(item)}
                  aria-label={`Remover ${item.name}`}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {progresso.completo && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4 text-center">
          <p className="text-green-700 dark:text-green-400 font-semibold text-sm">
            Todos os itens conferidos!
          </p>
        </div>
      )}

      {editing && (
        <ItemDialog item={editing} onClose={() => setEditing(null)} onSave={handleUpdate} />
      )}

      {/* Excluir era um clique único e sem volta — o mesmo padrão de confirmação
          já usado em Equipe, Fornecedores, Orçamento e Financeiro. */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item da lista?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.name}&rdquo; sai desta lista de conferência. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
