import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { AgendaSection } from "./_components/agenda-section.tsx";
import { OperationalSummary } from "./_components/operational-summary.tsx";
import { EventDocuments } from "./_components/event-documents.tsx";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  User,
  DollarSign,
  Pencil,
  ClipboardList,
  Images,
  CheckSquare,
  Trash2,
  MessageCircle,
  ChevronRight,
  Users,
  Plus,
  X,
  FileText,
  Upload,
  Sparkles,
  Image,
  Loader2,
  Download,
  Building2,
  Wand2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils.ts";
import { sortEventTeam } from "@/lib/event-team.ts";
import { useRef, useState } from "react";
import EventFormDialog from "../_components/event-form-dialog.tsx";
import { ContractImportDialog } from "./_components/contract-import-dialog.tsx";
import { LayoutAnalysisDialog } from "./_components/layout-analysis-dialog.tsx";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { generateEventPDF } from "@/lib/generate-event-pdf.ts";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planning: { label: "Planejamento", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  confirmed: { label: "Confirmado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "Em Andamento", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  completed: { label: "Concluído", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const TYPE_LABELS: Record<string, string> = {
  wedding: "Casamento",
  corporate: "Corporativo",
  birthday: "Aniversário",
  debutante: "Debutante",
  baptism: "Batizado",
  other: "Outro",
};

export default function EventDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importingContract, setImportingContract] = useState(false);

  const event = useQuery(api.events.get, { id: id as Id<"events"> });
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);
  const preChecklist = useQuery(api.briefing.getChecklist, { eventId: id as Id<"events">, phase: "pre" });
  const postChecklist = useQuery(api.briefing.getChecklist, { eventId: id as Id<"events">, phase: "post" });
  const eventTeam = useQuery(api.team.listEventTeam, { eventId: id as Id<"events"> });
  const allMembers = useQuery(api.team.listMembers);
  const addToEventTeam = useMutation(api.team.addToEventTeam);
  const removeFromEventTeam = useMutation(api.team.removeFromEventTeam);
  const updateEventTeamMember = useMutation(api.team.updateEventTeamMember);
  const [addingTeamMember, setAddingTeamMember] = useState(false);
  const [addTeamMemberId, setAddTeamMemberId] = useState("");
  const [addTeamTime, setAddTeamTime] = useState("");
  // Escala já criada: corrigir horário/observação sem precisar remover e
  // recadastrar a pessoa (o que perdia a observação junto).
  type EventTeamRow = NonNullable<typeof eventTeam>[number];
  const [editingAssignment, setEditingAssignment] = useState<EventTeamRow | null>(null);
  const [removingAssignment, setRemovingAssignment] = useState<EventTeamRow | null>(null);
  const [editTeamTime, setEditTeamTime] = useState("");
  const [editTeamNotes, setEditTeamNotes] = useState("");

  // AI / Contract state
  const contract = useQuery(api.contracts.getContract, { eventId: id as Id<"events"> });
  const health = useQuery(api.health.getEventHealth, { eventId: id as Id<"events"> });
  const generateUploadUrl = useMutation(api.contracts.generateUploadUrl);
  const saveContract = useMutation(api.contracts.saveContract);
  const generateChecklist = useAction(api.ai.generateChecklistFromBriefing);
  const briefing = useQuery(api.briefing.getBriefing, { eventId: id as Id<"events"> });
  const purchases = useQuery(api.purchases.listPurchases, { eventId: id as Id<"events"> });
  // Alimenta a Agenda com os alinhamentos já registrados nos fornecedores.
  const eventSuppliers = useQuery(api.suppliers.listByEvent, { eventId: id as Id<"events"> });

  const [contractUploading, setContractUploading] = useState(false);
  const [layoutAnalysing, setLayoutAnalysing] = useState(false);
  const [layoutReview, setLayoutReview] = useState<string | null>(null);
  const [checklistGenerating, setChecklistGenerating] = useState<"pre" | "post" | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const contractInputRef = useRef<HTMLInputElement>(null);
  const layoutInputRef = useRef<HTMLInputElement>(null);

  if (event === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (event === null) {
    return (
      <div className="p-4 md:p-6 text-center text-muted-foreground">
        Evento não encontrado.{" "}
        <Link to="/eventos" className="text-primary hover:underline">Voltar</Link>
      </div>
    );
  }

  const status = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.planning;
  const preChecked = preChecklist?.filter((i) => i.isChecked).length ?? 0;
  const preTotal = preChecklist?.length ?? 0;
  const postChecked = postChecklist?.filter((i) => i.isChecked).length ?? 0;
  const postTotal = postChecklist?.length ?? 0;

  const handleUpdate = async (values: {
    name?: string;
    type?: "wedding" | "corporate" | "birthday" | "debutante" | "baptism" | "other";
    date?: string;
    location?: string;
    clientName?: string;
    clientPhone?: string;
    budget?: number;
    status?: "planning" | "confirmed" | "in_progress" | "completed" | "cancelled";
    notes?: string;
  }) => {
    await updateEvent({ id: event._id, ...values });
    toast.success("Evento atualizado!");
    setEditing(false);
  };

  const handleDelete = async () => {
    await removeEvent({ id: event._id });
    toast.success("Evento excluído.");
    navigate("/eventos");
  };

  // ─── AI handlers ──────────────────────────────────────────────────────────

  const handleContractUpload = async (file: File) => {
    setContractUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await saveContract({ eventId: event._id, storageId, filename: file.name });
      toast.success("Contrato anexado!");
    } catch {
      toast.error("Erro ao fazer upload do contrato");
    } finally {
      setContractUploading(false);
    }
  };

  const handleLayoutUpload = async (file: File) => {
    setLayoutAnalysing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("read error"));
        reader.readAsDataURL(file);
      });
      setLayoutReview(base64);
    } catch {
      toast.error("Erro ao ler a imagem selecionada");
    } finally {
      setLayoutAnalysing(false);
    }
  };

  const handleGenerateChecklist = async (phase: "pre" | "post") => {
    setChecklistGenerating(phase);
    try {
      // Build a summary from the briefing
      const summary = briefing
        ? Object.entries(briefing)
            .filter(([k, v]) => !k.startsWith("_") && k !== "eventId" && k !== "userId" && typeof v === "string")
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : `Evento: ${event.name}, Tipo: ${event.type}, Data: ${event.date}, Local: ${event.location}`;
      const { itemsCreated } = await generateChecklist({
        eventId: event._id,
        phase,
        briefingSummary: summary || `Evento: ${event.name}`,
      });
      toast.success(`${itemsCreated} itens adicionados ao checklist!`);
    } catch {
      toast.error("Erro ao gerar checklist com IA");
    } finally {
      setChecklistGenerating(null);
    }
  };

  const handleDownloadPDF = async () => {
    setPdfGenerating(true);
    try {
      generateEventPDF({
        event,
        briefing: briefing ?? null,
        preChecklist: preChecklist ?? [],
        postChecklist: postChecklist ?? [],
        team: eventTeam ?? [],
        purchases: purchases ?? [],
      });
      toast.success("PDF gerado com sucesso!");
    } catch {
      toast.error("Erro ao gerar PDF");
    } finally {
      setPdfGenerating(false);
    }
  };

  const whatsappUrl = event.clientPhone
    ? `https://wa.me/55${event.clientPhone.replace(/\D/g, "")}`
    : null;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Back */}
      <Link
        to="/eventos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="size-4" /> Voltar
      </Link>

      {/* Event card */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", status.className)}>
                {status.label}
              </span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {TYPE_LABELS[event.type] ?? event.type}
              </span>
            </div>
            <h1 className="text-xl font-bold mt-1">{event.name}</h1>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => void handleDownloadPDF()}
              disabled={pdfGenerating}
              title="Baixar relatório em PDF"
              className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground disabled:opacity-50"
            >
              {pdfGenerating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4 text-primary flex-shrink-0" />
            <span>{format(new Date(event.date), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 text-primary flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
          {event.budget !== undefined && (
            <div className="flex items-center gap-2 font-semibold text-primary">
              <DollarSign className="size-4 flex-shrink-0" />
              <span>
                {event.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          )}
        </div>

        {event.notes && (
          <p className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
            {event.notes}
          </p>
        )}
      </div>

      {/* Client card */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <User className="size-4 text-primary" /> Informações do Cliente
        </h2>
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="font-medium">{event.clientName}</p>
          </div>
          {event.clientPhone && (
            <div>
              <p className="text-xs text-muted-foreground">Telefone</p>
              <div className="flex items-center gap-3">
                <p className="font-medium">{event.clientPhone}</p>
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline cursor-pointer"
                  >
                    <MessageCircle className="size-3.5" /> WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ações Rápidas */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
          <span className="text-lg">⚡</span> Ações Rápidas
        </h2>
        <div className="divide-y divide-border">
          <Link
            to={`/eventos/${id}/briefing`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ClipboardList className="size-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Questionário</p>
                <p className="text-xs text-muted-foreground">Briefing completo do evento</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link
            to={`/eventos/${id}/orcamento`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <DollarSign className="size-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Orçamento</p>
                <p className="text-xs text-muted-foreground">Receitas, custos e lucro</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link
            to={`/eventos/${id}/fotos`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Images className="size-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Galeria de Fotos</p>
                <p className="text-xs text-muted-foreground">Antes, montagem, evento e desmontagem</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link
            to={`/eventos/${id}/fornecedores`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Building2 className="size-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Fornecedores</p>
                <p className="text-xs text-muted-foreground">Dossiê operacional: assessoria, local, buffet, bar, doces, som & iluminação</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link
            to={`/eventos/${id}/planta`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Wand2 className="size-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Planta Premium</p>
                <p className="text-xs text-muted-foreground">Transforme o croqui em uma planta 2D profissional, preservando o projeto</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {/* Saúde do Evento */}
      {health && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
            <h2 className="font-semibold flex items-center gap-2">
              {health.status === "complete" ? "🟢" : health.status === "attention" ? "🟡" : "🔴"} Saúde do Evento
            </h2>
            <span className="text-lg font-bold">{health.percent}%</span>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {health.checks.map((c) => (
                <div key={c.key} className="flex items-center gap-1.5 text-sm">
                  <span>{c.ok ? "✓" : "○"}</span>
                  <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                </div>
              ))}
            </div>
            {health.attention.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">O que falta</p>
                {health.attention.map((a, i) => (
                  <p key={i} className="text-sm text-amber-600 dark:text-amber-500">⚠️ {a}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contrato + IA */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
          <FileText className="size-4 text-primary" /> Contrato
        </h2>
        <div className="p-5 space-y-4">
          {contract === undefined ? (
            <Skeleton className="h-12 w-full" />
          ) : contract ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="size-4 text-primary flex-shrink-0" />
                <p className="text-sm font-medium truncate">{contract.filename}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={contract.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  Visualizar
                </a>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {/* Upload contract button */}
            <input
              ref={contractInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleContractUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={contractUploading}
              onClick={() => contractInputRef.current?.click()}
              className="cursor-pointer gap-1.5"
            >
              {contractUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {contract ? "Substituir" : "Anexar Contrato"}
            </Button>

            {/* Ler contrato com IA → revisar → abastecer evento + financeiro + briefing */}
            {contract?.url && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setImportingContract(true)}
                className="cursor-pointer gap-1.5"
              >
                <Sparkles className="size-3.5" /> Ler contrato com IA
              </Button>
            )}
          </div>

          {event.contractAnalyzedAt ? (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
              <p className="text-primary font-medium">✓ Contrato importado e analisado</p>
              <p className="text-muted-foreground">
                {format(new Date(event.contractAnalyzedAt), "dd/MM/yyyy", { locale: ptBR })}
                {event.contractPendings && event.contractPendings.length > 0
                  ? ` · ${event.contractPendings.length} pendência(s) para revisar`
                  : ""}
              </p>
              {event.contractPendings && event.contractPendings.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {event.contractPendings.map((p, i) => (
                    <li key={i} className="text-amber-600 dark:text-amber-500">⚠️ {p}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : contract ? (
            <p className="text-xs text-muted-foreground">
              "Ler contrato com IA" identifica cliente, evento, financeiro e itens — você revisa e confirma antes de aplicar.
            </p>
          ) : null}
        </div>
      </div>

      {importingContract && contract?.url && (
        <ContractImportDialog
          event={event}
          contractUrl={contract.url}
          onClose={() => setImportingContract(false)}
        />
      )}

      {/* Análise de Croqui / Layout */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
          <Image className="size-4 text-primary" /> Análise de Croqui
        </h2>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Envie uma foto ou imagem do croqui/layout e a IA descreve o ambiente e lista os itens identificados para você revisar antes de aplicar ao briefing.
          </p>
          <input
            ref={layoutInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleLayoutUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            disabled={layoutAnalysing}
            onClick={() => layoutInputRef.current?.click()}
            className="cursor-pointer gap-1.5"
          >
            {layoutAnalysing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {layoutAnalysing ? "Analisando imagem..." : "Analisar Layout com IA"}
          </Button>
        </div>
      </div>

      {layoutReview && (
        <LayoutAnalysisDialog
          eventId={event._id}
          imageBase64={layoutReview}
          onClose={() => setLayoutReview(null)}
        />
      )}

      {/* Checklists */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
          <CheckSquare className="size-4 text-primary" /> Checklists
        </h2>
        <div className="divide-y divide-border">
          <div className="px-5 py-3 flex items-center justify-between gap-2">
            <Link
              to={`/eventos/${id}/checklist/pre`}
              className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span className="text-lg">🚚</span>
              <div>
                <p className="font-medium text-sm">Carregamento</p>
                <p className="text-xs text-muted-foreground">Checklist pré-evento</p>
              </div>
            </Link>
            <div className="flex items-center gap-2 flex-shrink-0">
              {preChecklist !== undefined && preTotal > 0 && (
                <span className="text-xs text-muted-foreground">{preChecked}/{preTotal}</span>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={checklistGenerating === "pre"}
                onClick={() => void handleGenerateChecklist("pre")}
                className="cursor-pointer gap-1 text-xs h-7 px-2"
              >
                {checklistGenerating === "pre" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                IA
              </Button>
              <Link to={`/eventos/${id}/checklist/pre`}>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </div>

          <div className="px-5 py-3 flex items-center justify-between gap-2">
            <Link
              to={`/eventos/${id}/checklist/post`}
              className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span className="text-lg">✅</span>
              <div>
                <p className="font-medium text-sm">Conferência</p>
                <p className="text-xs text-muted-foreground">Checklist pós-evento</p>
              </div>
            </Link>
            <div className="flex items-center gap-2 flex-shrink-0">
              {postChecklist !== undefined && postTotal > 0 && (
                <span className="text-xs text-muted-foreground">{postChecked}/{postTotal}</span>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={checklistGenerating === "post"}
                onClick={() => void handleGenerateChecklist("post")}
                className="cursor-pointer gap-1 text-xs h-7 px-2"
              >
                {checklistGenerating === "post" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                IA
              </Button>
              <Link to={`/eventos/${id}/checklist/post`}>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Pasta do evento — todos os documentos anexados, de todos os tipos
          que o backend já aceitava. */}
      <EventDocuments eventId={id as Id<"events">} />

      {/* Resumo operacional — contagens reais de checklist, compras,
          fornecedores, equipe, montagem e financeiro, mais as próximas
          ações derivadas do que já está cadastrado. */}
      <OperationalSummary eventId={id as Id<"events">} />

      {/* Equipe do Evento */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="size-4 text-primary" /> Equipe do Evento
          </h2>
          <button
            onClick={() => setAddingTeamMember(true)}
            className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
          >
            <Plus className="size-3.5" /> Adicionar
          </button>
        </div>
        {eventTeam === undefined ? (
          <div className="px-5 py-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : eventTeam.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground text-center">
            Você ainda não escalou ninguém para este evento.{" "}
            <button
              onClick={() => setAddingTeamMember(true)}
              className="text-primary hover:underline cursor-pointer"
            >
              Escalar alguém
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Ordenada por horário de chegada — a mesma leitura de horário que
                a Agenda do Evento usa (src/lib/event-team.ts). */}
            {sortEventTeam(eventTeam).map((assignment) => (
              <div key={assignment._id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {assignment.member?.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{assignment.member?.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{assignment.member?.role}</span>
                      {assignment.scheduledTime ? (
                        <span className="flex-shrink-0">· chega {assignment.scheduledTime}</span>
                      ) : (
                        <span className="flex-shrink-0 italic">· sem horário</span>
                      )}
                    </div>
                    {assignment.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {assignment.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditTeamTime(assignment.scheduledTime ?? "");
                      setEditTeamNotes(assignment.notes ?? "");
                      setEditingAssignment(assignment);
                    }}
                    aria-label={`Editar escala de ${assignment.member?.name}`}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setRemovingAssignment(assignment)}
                    aria-label={`Remover ${assignment.member?.name} do evento`}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agenda do Evento — prévia da futura integração com Google Agenda.
          Consolida horários que já existem (briefing + escala + alinhamentos).
          NÃO há integração real: sem OAuth, API, credencial ou sincronização. */}
      <AgendaSection
        eventId={id as Id<"events">}
        eventDate={event.date}
        briefing={briefing}
        team={eventTeam}
        suppliers={eventSuppliers}
      />

      {/* Add team member dialog */}
      <Dialog open={addingTeamMember} onOpenChange={(o) => { if (!o) { setAddingTeamMember(false); setAddTeamMemberId(""); setAddTeamTime(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Membro à Equipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Membro *</Label>
              {allMembers === undefined ? (
                <Skeleton className="h-10 w-full" />
              ) : allMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum membro cadastrado.{" "}
                  <Link to="/equipe" className="text-primary hover:underline">Cadastrar equipe</Link>
                </p>
              ) : (
                <select
                  value={addTeamMemberId}
                  onChange={(e) => setAddTeamMemberId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione...</option>
                  {allMembers
                    .filter((m) => !eventTeam?.some((a) => a.teamMemberId === m._id))
                    .map((m) => (
                      <option key={m._id} value={m._id}>{m.name} — {m.role}</option>
                    ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <Input
                placeholder="Ex: 14:00"
                value={addTeamTime}
                onChange={(e) => setAddTeamTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddingTeamMember(false); setAddTeamMemberId(""); setAddTeamTime(""); }} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              disabled={!addTeamMemberId}
              className="cursor-pointer"
              onClick={async () => {
                try {
                  await addToEventTeam({
                    eventId: id as Id<"events">,
                    teamMemberId: addTeamMemberId as Id<"teamMembers">,
                    scheduledTime: addTeamTime || undefined,
                  });
                  toast.success("Membro adicionado ao evento!");
                  setAddingTeamMember(false);
                  setAddTeamMemberId("");
                  setAddTeamTime("");
                } catch (e) {
                  if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
                  else toast.error("Erro ao adicionar membro");
                }
              }}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar escala — chama `team.updateEventTeamMember`, que existia no
          backend sem nenhuma tela usando. */}
      <Dialog
        open={!!editingAssignment}
        onOpenChange={(o) => { if (!o) setEditingAssignment(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escala de {editingAssignment?.member?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Horário de chegada</Label>
              <Input
                placeholder="Ex: 07:00"
                value={editTeamTime}
                onChange={(e) => setEditTeamTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Aparece na Agenda do Evento, agrupado com quem chega no mesmo horário.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input
                placeholder="Ex.: chega com a equipe de montagem"
                value={editTeamNotes}
                onChange={(e) => setEditTeamNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditingAssignment(null)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              className="cursor-pointer"
              onClick={async () => {
                if (!editingAssignment) return;
                try {
                  await updateEventTeamMember({
                    id: editingAssignment._id,
                    scheduledTime: editTeamTime.trim() || undefined,
                    notes: editTeamNotes.trim() || undefined,
                  });
                  toast.success("Escala atualizada.");
                  setEditingAssignment(null);
                } catch (e) {
                  if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
                  else toast.error("Não foi possível salvar a escala.");
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remover da escala passou a pedir confirmação: antes era um clique
          único e sem volta, num item que carrega horário e observação. */}
      <AlertDialog
        open={!!removingAssignment}
        onOpenChange={(o) => { if (!o) setRemovingAssignment(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar da escala deste evento?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingAssignment?.member?.name} sai da equipe deste evento, junto com o horário
              e a observação. A pessoa continua cadastrada em Equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
              onClick={async () => {
                if (!removingAssignment) return;
                try {
                  await removeFromEventTeam({ id: removingAssignment._id });
                  toast.success("Pessoa retirada da escala.");
                  setRemovingAssignment(null);
                } catch (e) {
                  if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
                  else toast.error("Não foi possível retirar da escala.");
                }
              }}
            >
              Retirar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      {editing && (
        <EventFormDialog
          open={editing}
          onClose={() => setEditing(false)}
          onSubmit={handleUpdate}
          defaultValues={event as Doc<"events">}
          title="Editar Evento"
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados deste evento (briefing, checklists) serão excluídos permanentemente.
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
