import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { ShoppingCart, Plus, Pencil, Trash2, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";

const CATEGORIES = [
  "Flores",
  "Tecidos",
  "Móveis",
  "Iluminação",
  "Bolo e Doces",
  "Descartáveis",
  "Ferramentas",
  "Transporte",
  "Outros",
];

const purchaseSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  category: z.string().optional(),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  supplier: z.string().optional(),
  unitPrice: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

function PurchaseDialog({
  open,
  onClose,
  defaultValues,
  title,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<PurchaseFormValues>;
  title: string;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: defaultValues ?? {},
  });

  const submit = async (values: PurchaseFormValues) => {
    await onSubmit(values);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Item *</Label>
            <Input placeholder="Ex: Rosas brancas" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <select
                {...register("category")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Input placeholder="Floricultura ABC" {...register("supplier")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Qtde</Label>
              <Input type="number" placeholder="10" {...register("quantity")} />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input placeholder="dz" {...register("unit")} />
            </div>
            <div className="space-y-1.5">
              <Label>Preço unit.</Label>
              <Input type="number" step="0.01" placeholder="0,00" {...register("unitPrice")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input placeholder="Notas..." {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EventSection({
  event,
  items,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  event: Doc<"events">;
  items: Doc<"purchaseItems">[];
  onAdd: (eventId: Id<"events">) => void;
  onEdit: (item: Doc<"purchaseItems">) => void;
  onToggle: (id: Id<"purchaseItems">) => void;
  onDelete: (id: Id<"purchaseItems">) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const purchased = items.filter((i) => i.isPurchased).length;
  const total = items.length;
  const totalValue = items.reduce((sum, i) => {
    if (i.unitPrice && i.quantity) return sum + i.unitPrice * i.quantity;
    return sum;
  }, 0);

  const grouped = CATEGORIES.reduce<Record<string, Doc<"purchaseItems">[]>>((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});
  const uncategorized = items.filter((i) => !i.category || !CATEGORIES.includes(i.category));
  if (uncategorized.length > 0) grouped["Outros"] = (grouped["Outros"] ?? []).concat(uncategorized.filter((i) => !grouped["Outros"]?.includes(i)));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/40 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{event.name}</p>
            <p className="text-xs text-muted-foreground">
              {purchased}/{total} comprado{total !== 1 ? "s" : ""}
              {totalValue > 0 && ` · ${totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
            </p>
          </div>
          {total > 0 && (
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${total > 0 ? (purchased / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform ml-2", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="border-t border-border">
          {total === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground text-center">
              Nenhum item ainda.{" "}
              <button
                onClick={() => onAdd(event._id)}
                className="text-primary hover:underline cursor-pointer"
              >
                Adicionar
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(grouped).map(([cat, catItems]) => (
                <div key={cat}>
                  <p className="px-5 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                    {cat}
                  </p>
                  {catItems.map((item) => (
                    <div
                      key={item._id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-3 transition-colors",
                        item.isPurchased && "opacity-60",
                      )}
                    >
                      <button
                        onClick={() => onToggle(item._id)}
                        className={cn(
                          "size-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors",
                          item.isPurchased
                            ? "bg-primary border-primary"
                            : "border-border hover:border-primary",
                        )}
                      >
                        {item.isPurchased && <Check className="size-3 text-primary-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", item.isPurchased && "line-through text-muted-foreground")}>
                          {item.name}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {item.quantity && (
                            <span>{item.quantity}{item.unit ? ` ${item.unit}` : ""}</span>
                          )}
                          {item.supplier && <span>· {item.supplier}</span>}
                          {item.unitPrice && item.quantity && (
                            <span className="text-primary font-medium">
                              · {(item.unitPrice * item.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(item._id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-3 border-t border-border">
            <button
              onClick={() => onAdd(event._id)}
              className="text-sm text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              <Plus className="size-3.5" /> Adicionar item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ComprasContent() {
  const events = useQuery(api.events.list, {});
  const togglePurchase = useMutation(api.purchases.togglePurchase);
  const deletePurchase = useMutation(api.purchases.deletePurchase);
  const addPurchase = useMutation(api.purchases.addPurchase);
  const updatePurchase = useMutation(api.purchases.updatePurchase);

  const [addingToEvent, setAddingToEvent] = useState<Id<"events"> | null>(null);
  const [editing, setEditing] = useState<Doc<"purchaseItems"> | null>(null);

  // We need to load purchases for each event
  // This is done per EventSection component
  const [eventFilter, setEventFilter] = useState<"all" | "upcoming" | "completed">("all");

  const filteredEvents = (events ?? []).filter((e) => {
    if (eventFilter === "upcoming") return e.status !== "completed" && e.status !== "cancelled";
    if (eventFilter === "completed") return e.status === "completed";
    return e.status !== "cancelled";
  });

  const handleAdd = async (values: PurchaseFormValues) => {
    if (!addingToEvent) return;
    try {
      await addPurchase({
        eventId: addingToEvent,
        name: values.name,
        category: values.category || undefined,
        quantity: values.quantity ? parseFloat(values.quantity) : undefined,
        unit: values.unit || undefined,
        supplier: values.supplier || undefined,
        unitPrice: values.unitPrice ? parseFloat(values.unitPrice) : undefined,
        notes: values.notes || undefined,
      });
      toast.success("Item adicionado!");
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao adicionar item");
    }
  };

  const handleEdit = async (values: PurchaseFormValues) => {
    if (!editing) return;
    try {
      await updatePurchase({
        id: editing._id,
        name: values.name,
        category: values.category || undefined,
        quantity: values.quantity ? parseFloat(values.quantity) : undefined,
        unit: values.unit || undefined,
        supplier: values.supplier || undefined,
        unitPrice: values.unitPrice ? parseFloat(values.unitPrice) : undefined,
        notes: values.notes || undefined,
      });
      toast.success("Item atualizado!");
      setEditing(null);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao atualizar item");
    }
  };

  const handleToggle = async (id: Id<"purchaseItems">) => {
    try {
      await togglePurchase({ id });
    } catch (e) {
      toast.error("Erro ao atualizar item");
    }
  };

  const handleDelete = async (id: Id<"purchaseItems">) => {
    try {
      await deletePurchase({ id });
      toast.success("Item removido.");
    } catch (e) {
      toast.error("Erro ao remover item");
    }
  };

  if (events === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(["all", "upcoming", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setEventFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer",
              eventFilter === f
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "Todos" : f === "upcoming" ? "Em andamento" : "Concluídos"}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
            <EmptyTitle>Nenhum evento encontrado</EmptyTitle>
            <EmptyDescription>Crie eventos para gerenciar suas compras</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((event) => (
            <EventSectionWithData
              key={event._id}
              event={event as Doc<"events">}
              onAdd={(id) => setAddingToEvent(id)}
              onEdit={(item) =>
                setEditing({
                  ...item,
                })
              }
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <PurchaseDialog
        open={!!addingToEvent}
        onClose={() => setAddingToEvent(null)}
        title="Adicionar Item"
        onSubmit={handleAdd}
      />

      {editing && (
        <PurchaseDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar Item"
          defaultValues={{
            name: editing.name,
            category: editing.category,
            quantity: editing.quantity?.toString(),
            unit: editing.unit,
            supplier: editing.supplier,
            unitPrice: editing.unitPrice?.toString(),
            notes: editing.notes,
          }}
          onSubmit={handleEdit}
        />
      )}
    </>
  );
}

function EventSectionWithData({
  event,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  event: Doc<"events">;
  onAdd: (eventId: Id<"events">) => void;
  onEdit: (item: Doc<"purchaseItems">) => void;
  onToggle: (id: Id<"purchaseItems">) => void;
  onDelete: (id: Id<"purchaseItems">) => void;
}) {
  const items = useQuery(api.purchases.listPurchases, { eventId: event._id });

  if (items === undefined) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  return (
    <EventSection
      event={event}
      items={items}
      onAdd={onAdd}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />
  );
}

export default function ComprasPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Compras</h1>
        <p className="text-sm text-muted-foreground">Lista de compras por evento</p>
      </div>
      <ComprasContent />
    </div>
  );
}
