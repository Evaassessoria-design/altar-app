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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Phone, Plus, Pencil, Trash2, ArrowRight, CalendarDays, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

type Stage = "contact" | "quote_sent" | "contracted" | "discarded";

const STAGES: { id: Stage; label: string; color: string; bg: string }[] = [
  { id: "contact", label: "Contato Inicial", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
  { id: "quote_sent", label: "Orçamento Enviado", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
  { id: "contracted", label: "Contratado", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
  { id: "discarded", label: "Descartado", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
];

const EVENT_TYPES = [
  { value: "wedding", label: "Casamento" },
  { value: "corporate", label: "Corporativo" },
  { value: "birthday", label: "Aniversário" },
  { value: "debutante", label: "Debutante" },
  { value: "baptism", label: "Batizado" },
  { value: "other", label: "Outro" },
];

const leadSchema = z.object({
  clientName: z.string().min(2, "Nome obrigatório"),
  clientPhone: z.string().optional(),
  eventType: z.string().optional(),
  eventDate: z.string().optional(),
  budget: z.string().optional(),
  stage: z.enum(["contact", "quote_sent", "contracted", "discarded"]),
  notes: z.string().optional(),
});

type LeadFormValues = z.infer<typeof leadSchema>;

function LeadDialog({
  open,
  onClose,
  defaultValues,
  title,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<LeadFormValues>;
  title: string;
  onSubmit: (values: LeadFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: { stage: "contact", ...defaultValues },
  });

  const submit = async (values: LeadFormValues) => {
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
            <Label>Nome do Cliente *</Label>
            <Input placeholder="Maria Silva" {...register("clientName")} />
            {errors.clientName && <p className="text-xs text-destructive">{errors.clientName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input placeholder="(11) 99999-9999" {...register("clientPhone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Evento</Label>
              <select
                {...register("eventType")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data do Evento</Label>
              <Input type="date" {...register("eventDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Orçamento (R$)</Label>
              <Input type="number" placeholder="0,00" {...register("budget")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Etapa</Label>
            <select
              {...register("stage")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input placeholder="Notas sobre o cliente..." {...register("notes")} />
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

const convertSchema = z.object({
  eventName: z.string().min(2, "Nome do evento obrigatório"),
  eventDate: z.string().min(1, "Data obrigatória"),
  location: z.string().min(1, "Local obrigatório"),
  type: z.enum(["wedding", "corporate", "birthday", "debutante", "baptism", "other"]),
});

type ConvertFormValues = z.infer<typeof convertSchema>;

function ConvertDialog({
  lead,
  open,
  onClose,
}: {
  lead: Doc<"leads">;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const convertToEvent = useMutation(api.funil.convertToEvent);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConvertFormValues>({
    resolver: zodResolver(convertSchema),
    defaultValues: {
      eventName: `${lead.clientName} - ${EVENT_TYPES.find((t) => t.value === lead.eventType)?.label ?? "Evento"}`,
      eventDate: lead.eventDate ?? "",
      type: (lead.eventType as ConvertFormValues["type"]) ?? "other",
    },
  });

  const submit = async (values: ConvertFormValues) => {
    try {
      const eventId = await convertToEvent({
        leadId: lead._id,
        ...values,
        clientName: lead.clientName,
        clientPhone: lead.clientPhone,
        budget: lead.budget,
      });
      toast.success("Convertido em evento!");
      onClose();
      navigate(`/eventos/${eventId}`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao converter");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Converter em Evento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nome do Evento *</Label>
            <Input {...register("eventName")} />
            {errors.eventName && <p className="text-xs text-destructive">{errors.eventName.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="datetime-local" {...register("eventDate")} />
              {errors.eventDate && <p className="text-xs text-destructive">{errors.eventDate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <select
                {...register("type")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Local *</Label>
            <Input placeholder="Salão de Festas ABC" {...register("location")} />
            {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Convertendo..." : "Converter em Evento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeadCard({
  lead,
  onEdit,
  onDelete,
  onMoveStage,
}: {
  lead: Doc<"leads">;
  onEdit: (lead: Doc<"leads">) => void;
  onDelete: (lead: Doc<"leads">) => void;
  onMoveStage: (lead: Doc<"leads">, stage: Stage) => void;
}) {
  const [converting, setConverting] = useState(false);
  const stageConfig = STAGES.find((s) => s.id === lead.stage)!;
  const nextStage = STAGES[STAGES.findIndex((s) => s.id === lead.stage) + 1];

  return (
    <div className="bg-background border border-border rounded-xl p-3 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{lead.clientName}</p>
          {lead.clientPhone && (
            <a
              href={`https://wa.me/55${lead.clientPhone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Phone className="size-3" /> {lead.clientPhone}
            </a>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(lead)}
            className="p-1 rounded hover:bg-accent cursor-pointer text-muted-foreground"
          >
            <Pencil className="size-3" />
          </button>
          <button
            onClick={() => onDelete(lead)}
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {lead.eventType && (
          <span className="bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
            {EVENT_TYPES.find((t) => t.value === lead.eventType)?.label ?? lead.eventType}
          </span>
        )}
        {lead.eventDate && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="size-3" />
            {format(new Date(lead.eventDate), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        )}
        {lead.budget && (
          <span className="flex items-center gap-1 text-primary font-medium">
            <DollarSign className="size-3" />
            {lead.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        )}
      </div>

      {lead.notes && (
        <p className="text-xs text-muted-foreground italic line-clamp-2">{lead.notes}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        {lead.stage !== "contracted" && lead.stage !== "discarded" && nextStage && (
          <button
            onClick={() => onMoveStage(lead, nextStage.id)}
            className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ArrowRight className="size-3" />
            {nextStage.label}
          </button>
        )}
        {lead.stage === "contracted" && !lead.convertedEventId && (
          <button
            onClick={() => setConverting(true)}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline cursor-pointer font-medium"
          >
            <ArrowRight className="size-3" /> Criar Evento
          </button>
        )}
        {lead.convertedEventId && (
          <span className="text-xs text-muted-foreground">✓ Evento criado</span>
        )}
      </div>

      {converting && (
        <ConvertDialog lead={lead} open={converting} onClose={() => setConverting(false)} />
      )}
    </div>
  );
}

function KanbanColumn({
  stage,
  leads,
  onAdd,
  onEdit,
  onDelete,
  onMoveStage,
}: {
  stage: typeof STAGES[number];
  leads: Doc<"leads">[];
  onAdd: (stage: Stage) => void;
  onEdit: (lead: Doc<"leads">) => void;
  onDelete: (lead: Doc<"leads">) => void;
  onMoveStage: (lead: Doc<"leads">, stage: Stage) => void;
}) {
  const totalBudget = leads.reduce((s, l) => s + (l.budget ?? 0), 0);

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] md:w-auto md:flex-1">
      <div className={cn("flex items-center justify-between px-3 py-2.5 rounded-xl mb-3", stage.bg)}>
        <div>
          <p className={cn("font-semibold text-sm", stage.color)}>{stage.label}</p>
          <p className="text-xs text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {totalBudget > 0 && ` · ${totalBudget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
          </p>
        </div>
        <button
          onClick={() => onAdd(stage.id)}
          className="p-1 rounded-lg hover:bg-background/50 cursor-pointer text-muted-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {leads.map((lead) => (
          <LeadCard
            key={lead._id}
            lead={lead}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveStage={onMoveStage}
          />
        ))}
        {leads.length === 0 && (
          <div
            className="border-2 border-dashed border-border rounded-xl p-4 text-center text-xs text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => onAdd(stage.id)}
          >
            + Adicionar lead
          </div>
        )}
      </div>
    </div>
  );
}

export default function FunilPage() {
  const leads = useQuery(api.funil.listLeads);
  const createLead = useMutation(api.funil.createLead);
  const updateLead = useMutation(api.funil.updateLead);
  const deleteLead = useMutation(api.funil.deleteLead);

  const [creating, setCreating] = useState<Stage | null>(null);
  const [editing, setEditing] = useState<Doc<"leads"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"leads"> | null>(null);

  const handleCreate = async (values: LeadFormValues) => {
    try {
      await createLead({
        ...values,
        budget: values.budget ? parseFloat(values.budget) : undefined,
        stage: values.stage as Stage,
        eventType: values.eventType || undefined,
        eventDate: values.eventDate || undefined,
        clientPhone: values.clientPhone || undefined,
        notes: values.notes || undefined,
      });
      toast.success("Lead adicionado!");
    } catch (e) {
      toast.error("Erro ao criar lead");
    }
  };

  const handleEdit = async (values: LeadFormValues) => {
    if (!editing) return;
    try {
      await updateLead({
        id: editing._id,
        ...values,
        budget: values.budget ? parseFloat(values.budget) : undefined,
        stage: values.stage as Stage,
        eventType: values.eventType || undefined,
        eventDate: values.eventDate || undefined,
        clientPhone: values.clientPhone || undefined,
        notes: values.notes || undefined,
      });
      toast.success("Lead atualizado!");
      setEditing(null);
    } catch (e) {
      toast.error("Erro ao atualizar lead");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteLead({ id: deleting._id });
      toast.success("Lead removido.");
      setDeleting(null);
    } catch (e) {
      toast.error("Erro ao remover lead");
    }
  };

  const handleMoveStage = async (lead: Doc<"leads">, stage: Stage) => {
    try {
      await updateLead({ id: lead._id, stage });
    } catch (e) {
      toast.error("Erro ao mover lead");
    }
  };

  const leadsById = STAGES.reduce<Record<Stage, Doc<"leads">[]>>(
    (acc, s) => {
      acc[s.id] = (leads ?? []).filter((l) => l.stage === s.id).sort((a, b) => a.order - b.order);
      return acc;
    },
    { contact: [], quote_sent: [], contracted: [], discarded: [] },
  );

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Funil de Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {leads === undefined ? "..." : `${leads.filter((l) => l.stage !== "discarded").length} oportunidades ativas`}
          </p>
        </div>
        <Button onClick={() => setCreating("contact")} className="cursor-pointer gap-2">
          <Plus className="size-4" /> Novo Lead
        </Button>
      </div>

      {leads === undefined ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => (
            <Skeleton key={s.id} className="min-w-[240px] h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leadsById[stage.id]}
              onAdd={(s) => setCreating(s)}
              onEdit={setEditing}
              onDelete={setDeleting}
              onMoveStage={handleMoveStage}
            />
          ))}
        </div>
      )}

      {creating && (
        <LeadDialog
          open={!!creating}
          onClose={() => setCreating(null)}
          title="Novo Lead"
          defaultValues={{ stage: creating }}
          onSubmit={handleCreate}
        />
      )}

      {editing && (
        <LeadDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar Lead"
          defaultValues={{
            clientName: editing.clientName,
            clientPhone: editing.clientPhone,
            eventType: editing.eventType,
            eventDate: editing.eventDate,
            budget: editing.budget?.toString(),
            stage: editing.stage,
            notes: editing.notes,
          }}
          onSubmit={handleEdit}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.clientName} será removido do funil.
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
