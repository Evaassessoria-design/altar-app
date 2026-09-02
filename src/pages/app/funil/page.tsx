import { useState } from "react";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
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
import {
  Phone,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  CalendarDays,
  DollarSign,
  Paperclip,
  MessageCircle,
} from "lucide-react";
import { LeadDocumentsDialog } from "./_components/lead-documents.tsx";
import { ResponsavelInline, ResponsavelSelect } from "@/components/responsavel-select.tsx";
import { descreverUltimaAtualizacao } from "@/convex/lib/ultimaAtualizacao.ts";
import { descreverUltimoContato } from "@/lib/ultimo-contato.ts";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

import { formatEventDayOnly } from "@/lib/event-date.ts";
// Os quatro estágios originais mantêm o mesmo id — lead já gravado continua
// caindo na coluna certa. Os três do meio foram acrescentados.
type Stage =
  | "contact"
  | "contacted"
  | "meeting"
  | "quote_sent"
  | "negotiating"
  | "contracted"
  | "discarded";

const STAGES: { id: Stage; label: string; color: string; bg: string }[] = [
  { id: "contact", label: "Novo contato", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
  { id: "contacted", label: "Contato realizado", color: "text-sky-700 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/20" },
  { id: "meeting", label: "Reunião agendada", color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
  { id: "quote_sent", label: "Orçamento enviado", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
  { id: "negotiating", label: "Negociação", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" },
  { id: "contracted", label: "Fechado", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
  { id: "discarded", label: "Perdido", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
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
  stage: z.enum([
    "contact",
    "contacted",
    "meeting",
    "quote_sent",
    "negotiating",
    "contracted",
    "discarded",
  ]),
  notes: z.string().optional(),
});

type LeadFormValues = z.infer<typeof leadSchema>;

function LeadDialog({
  open,
  onClose,
  defaultValues,
  defaultResponsibleId,
  anotacaoDoResponsavel,
  title,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<LeadFormValues>;
  defaultResponsibleId?: string;
  anotacaoDoResponsavel?: string;
  title: string;
  onSubmit: (values: LeadFormValues, responsibleId?: string) => Promise<void>;
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

  const [responsibleId, setResponsibleId] = useState<string | undefined>(defaultResponsibleId);

  const submit = async (values: LeadFormValues) => {
    await onSubmit(values, responsibleId);
    reset();
    setResponsibleId(undefined);
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
            <AutoTextarea minRows={2} placeholder="Notas sobre o cliente..." {...register("notes")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-responsavel">Quem está atendendo</Label>
            {/* Vínculo com a equipe. A anotação livre que já existia continua
                valendo quando não há vínculo — ver convex/lib/responsavel.ts. */}
            <ResponsavelSelect
              id="lead-responsavel"
              value={responsibleId as Id<"teamMembers"> | undefined}
              onChange={(id) => setResponsibleId(id)}
              anotacao={anotacaoDoResponsavel}
            />
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
      // O local já foi anotado durante a negociação. Sem isto, a decoradora
      // redigitava a fazenda que ela mesma cadastrou no lead.
      location: lead.venue ?? "",
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
  isDragging,
  onEdit,
  onDelete,
  onMoveStage,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  lead: Doc<"leads">;
  isDragging: boolean;
  onEdit: (lead: Doc<"leads">) => void;
  onDelete: (lead: Doc<"leads">) => void;
  onMoveStage: (lead: Doc<"leads">, stage: Stage) => void;
  onDragStart: (lead: Doc<"leads">) => void;
  onDragEnd: () => void;
  onDropBefore: (target: Doc<"leads">) => void;
}) {
  const [converting, setConverting] = useState(false);
  const [documentos, setDocumentos] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const registrarContato = useMutation(api.funil.registrarContato);
  const ultimoContato = descreverUltimoContato(lead.lastInteraction);
  const stageConfig = STAGES.find((s) => s.id === lead.stage)!;

  const registrar = async () => {
    setRegistrando(true);
    try {
      await registrarContato({ id: lead._id });
      toast.success("Contato registrado.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível registrar o contato.",
      );
    } finally {
      setRegistrando(false);
    }
  };

  const nextStage = STAGES[STAGES.findIndex((s) => s.id === lead.stage) + 1];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead._id);
        onDragStart(lead);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropBefore(lead);
      }}
      className={cn(
        "bg-background border border-border rounded-xl p-3 space-y-2 shadow-sm cursor-grab active:cursor-grabbing transition-shadow",
        isDragging && "opacity-50 ring-2 ring-primary/40 shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{lead.clientName}</p>
          {lead.clientPhone && (
            <a
              href={`https://wa.me/55${lead.clientPhone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              draggable={false}
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
            {formatEventDayOnly(lead.eventDate)}
          </span>
        )}
        {lead.budget && (
          <span className="flex items-center gap-1 text-primary font-medium">
            <DollarSign className="size-3" />
            {lead.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        )}
      </div>

      <ResponsavelInline
        registro={lead}
        prefixo="Atendendo: "
        className="block text-xs text-muted-foreground"
      />

      {/* ÚLTIMO CONTATO — a pergunta que custa dinheiro no funil. Distinto de
          "Atualizado", logo abaixo: aquilo é "alguém mexeu no registro", isto
          é "falei com a cliente". Ver src/lib/ultimo-contato.ts. */}
      {ultimoContato && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MessageCircle className="size-3" />
          Último contato: <span className="text-foreground">{ultimoContato}</span>
        </p>
      )}

      {/* "Faz quanto tempo que eu nao olho isto?" — o Convex so da a data de
          CRIACAO, entao um lead de janeiro revisado ontem parecia de janeiro.
          Isto NAO e contato com a cliente: quem responde por isso e
          `lastInteraction` (ver convex/lib/ultimaAtualizacao.ts). */}
      {descreverUltimaAtualizacao(lead) && (
        <p className="text-xs text-muted-foreground">
          Atualizado {descreverUltimaAtualizacao(lead)}
        </p>
      )}

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
        {/* Um clique, sem diálogo: registrar conversa é o gesto mais frequente
            do funil e não pode custar três toques. Some nos estágios finais —
            cobrar follow-up de lead fechado ou perdido é ruído. */}
        {lead.stage !== "contracted" && lead.stage !== "discarded" && (
          <button
            onClick={() => void registrar()}
            disabled={registrando}
            title="Grava a data e a hora de agora como último contato"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer disabled:opacity-50"
          >
            <MessageCircle className="size-3" />
            {registrando ? "Registrando..." : "Registrar contato"}
          </button>
        )}
        {/* Proposta e contrato ficam com o LEAD, disponíveis em qualquer
            estágio — a papelada da negociação existe antes do evento. */}
        <button
          onClick={() => setDocumentos(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer ml-auto"
        >
          <Paperclip className="size-3" /> Documentos
        </button>
      </div>

      {converting && (
        <ConvertDialog lead={lead} open={converting} onClose={() => setConverting(false)} />
      )}

      {documentos && (
        <LeadDocumentsDialog
          leadId={lead._id}
          clientName={lead.clientName}
          open={documentos}
          onClose={() => setDocumentos(false)}
        />
      )}
    </div>
  );
}

function KanbanColumn({
  stage,
  leads,
  draggingId,
  isDragOver,
  onAdd,
  onEdit,
  onDelete,
  onMoveStage,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onColumnDragOver,
  onDropColumn,
}: {
  stage: typeof STAGES[number];
  leads: Doc<"leads">[];
  draggingId: Id<"leads"> | null;
  isDragOver: boolean;
  onAdd: (stage: Stage) => void;
  onEdit: (lead: Doc<"leads">) => void;
  onDelete: (lead: Doc<"leads">) => void;
  onMoveStage: (lead: Doc<"leads">, stage: Stage) => void;
  onDragStart: (lead: Doc<"leads">) => void;
  onDragEnd: () => void;
  onDropBefore: (target: Doc<"leads">) => void;
  onColumnDragOver: (stage: Stage) => void;
  onDropColumn: (stage: Stage) => void;
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
      <div
        className={cn(
          "flex flex-col gap-2 flex-1 rounded-xl p-1 -m-1 transition-colors",
          isDragOver && "bg-primary/5 ring-2 ring-primary/30",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          onColumnDragOver(stage.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropColumn(stage.id);
        }}
      >
        {leads.map((lead) => (
          <LeadCard
            key={lead._id}
            lead={lead}
            isDragging={draggingId === lead._id}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveStage={onMoveStage}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropBefore={onDropBefore}
          />
        ))}
        {leads.length === 0 && (
          <div
            className={cn(
              "border-2 border-dashed border-border rounded-xl p-4 text-center text-xs text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors",
              isDragOver && "border-primary/50",
            )}
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
  const [dragging, setDragging] = useState<Doc<"leads"> | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

  const handleCreate = async (values: LeadFormValues, responsibleId?: string) => {
    try {
      await createLead({
        ...values,
        responsibleId: responsibleId as Id<"teamMembers"> | undefined,
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

  const handleEdit = async (values: LeadFormValues, responsibleId?: string) => {
    if (!editing) return;
    try {
      // Edição é substituição: `null` limpa o campo. Com `undefined`, o pedido
      // era descartado no transporte e o valor antigo permanecia.
      await updateLead({
        id: editing._id,
        ...values,
        // `null` limpa o vínculo quando a decoradora escolhe "Ninguém definido".
        responsibleId: (responsibleId ?? null) as Id<"teamMembers"> | null,
        budget: values.budget ? parseFloat(values.budget) : null,
        stage: values.stage as Stage,
        eventType: values.eventType || null,
        eventDate: values.eventDate || null,
        clientPhone: values.clientPhone || null,
        notes: values.notes || null,
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
    // Derivado de STAGES: acrescentar um estágio novo não exige lembrar de
    // inicializar a coluna aqui.
    Object.fromEntries(STAGES.map((s) => [s.id, [] as Doc<"leads">[]])) as unknown as Record<
      Stage,
      Doc<"leads">[]
    >,
  );

  // Ordem fracionária: insere entre vizinhos sem reindexar toda a coluna.
  const orderBetween = (list: Doc<"leads">[], index: number): number => {
    const prev = list[index - 1];
    const next = list[index];
    if (!prev && !next) return 0;
    if (!prev) return next.order - 1;
    if (!next) return prev.order + 1;
    return (prev.order + next.order) / 2;
  };

  // Persiste stage + order UMA vez, ao soltar (nunca durante o arraste).
  const moveTo = async (
    dragged: Doc<"leads">,
    targetStage: Stage,
    beforeLead: Doc<"leads"> | null,
  ) => {
    if (beforeLead && beforeLead._id === dragged._id) return;
    const targetList = leadsById[targetStage].filter((l) => l._id !== dragged._id);
    const index = beforeLead
      ? Math.max(0, targetList.findIndex((l) => l._id === beforeLead._id))
      : targetList.length;
    const newOrder = orderBetween(targetList, index);
    if (dragged.stage === targetStage && dragged.order === newOrder) return;
    try {
      await updateLead({ id: dragged._id, stage: targetStage, order: newOrder });
    } catch {
      toast.error("Erro ao mover lead");
    }
  };

  const endDrag = () => {
    setDragging(null);
    setDragOverStage(null);
  };
  const handleDropBefore = (target: Doc<"leads">) => {
    if (dragging) void moveTo(dragging, target.stage, target);
    endDrag();
  };
  const handleDropColumn = (stage: Stage) => {
    if (dragging) void moveTo(dragging, stage, null);
    endDrag();
  };

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
              draggingId={dragging?._id ?? null}
              isDragOver={dragOverStage === stage.id}
              onAdd={(s) => setCreating(s)}
              onEdit={setEditing}
              onDelete={setDeleting}
              onMoveStage={handleMoveStage}
              onDragStart={setDragging}
              onDragEnd={endDrag}
              onDropBefore={handleDropBefore}
              onColumnDragOver={setDragOverStage}
              onDropColumn={handleDropColumn}
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
          // Sem isto, editar um lead vinculado perderia o vínculo em silêncio.
          defaultResponsibleId={editing.responsibleId}
          anotacaoDoResponsavel={editing.responsible}
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
