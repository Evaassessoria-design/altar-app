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
  FileText,
  Tag,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { LeadDocumentsDialog } from "./_components/lead-documents.tsx";
import { ResponsavelInline, ResponsavelSelect } from "@/components/responsavel-select.tsx";
import { descreverUltimaAtualizacao } from "@/convex/lib/ultimaAtualizacao.ts";
import { ROTULO_DO_STATUS } from "@/convex/lib/propostaComercial.ts";
import { EVENT_TYPES, rotuloDoTipoDeEvento } from "@/lib/event-types.ts";
import type { FunctionReturnType } from "convex/server";

// O resumo vem do servidor; o tipo é LIDO de lá, nunca redigitado aqui — um
// campo que mude de nome passa a ser erro de compilação, e não texto errado
// no card.
type ResumoDeProposta =
  FunctionReturnType<typeof api.propostas.resumoPorLead>["porLead"][string]["ultima"];
import { descreverUltimoContato } from "@/lib/ultimo-contato.ts";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { valorDigitado } from "@/lib/valor-digitado.ts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { formatEventDayOnly } from "@/lib/event-date.ts";
import {
  desfecho,
  etapaAoCriarNoGrupo,
  etapaAoSoltarNoGrupo,
  GRUPOS,
  grupoDaEtapa,
  visaoDaUrl,
  type Grupo,
  type GrupoId,
  type Visao,
} from "@/lib/funil-grupos.ts";
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

/** As cores dos quatro grupos da visão resumida — as da etapa que abre cada um. */
const COR_DO_GRUPO: Record<GrupoId, { cor: string; fundo: string }> = {
  novos: { cor: "text-blue-600 dark:text-blue-400", fundo: "bg-blue-50 dark:bg-blue-900/20" },
  atendimento: { cor: "text-indigo-700 dark:text-indigo-400", fundo: "bg-indigo-50 dark:bg-indigo-900/20" },
  proposta: { cor: "text-yellow-700 dark:text-yellow-400", fundo: "bg-yellow-50 dark:bg-yellow-900/20" },
  fechamento: { cor: "text-green-700 dark:text-green-400", fundo: "bg-green-50 dark:bg-green-900/20" },
};

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
              {/* `inputMode="decimal"`: com `type="number"`, o que o campo
                  devolve para "1.500,00" depende do navegador. */}
              <Input inputMode="decimal" placeholder="1.500,00" {...register("budget")} />
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
      eventName: `${lead.clientName} - ${rotuloDoTipoDeEvento(lead.eventType) ?? "Evento"}`,
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

/** Um dado do card: ícone + texto que trunca em vez de vazar. */
function DadoDoCard({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
      <span className="flex-shrink-0">{icone}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A etapa real, como etiqueta. Na visão agrupada é o que diz onde o lead está. */
function EtiquetaDaEtapa({ etapa }: { etapa: Stage }) {
  const config = STAGES.find((s) => s.id === etapa)!;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        config.bg,
        config.color,
      )}
    >
      <span className="truncate">{config.label}</span>
    </span>
  );
}

const emReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─────────────────────────────────────────────────────────────────────────────
// ABRIR LEAD
//
// O card carregava todas as ações do lead num rodapé só — avançar etapa,
// registrar conversa, proposta, criar evento e documentos —, e no quadro de
// sete colunas a última delas ("Documentos") passava da borda direita. As
// ações não sumiram: moraram aqui, no lead aberto, com espaço para o dedo.
// O card ficou com o que se lê de relance e as duas ações de todo dia.
//
// Nada aqui é interface nova de verdade: são os mesmos botões, as mesmas
// mutations e os mesmos diálogos (conversão, documentos, edição, exclusão).
// ─────────────────────────────────────────────────────────────────────────────
function LeadAberto({
  lead,
  proposta,
  open,
  onClose,
  onEdit,
  onDelete,
  onMoveStage,
  onDocumentos,
  onConverter,
}: {
  lead: Doc<"leads">;
  proposta?: { quantidade: number; ultima: ResumoDeProposta };
  open: boolean;
  onClose: () => void;
  onEdit: (lead: Doc<"leads">) => void;
  onDelete: (lead: Doc<"leads">) => void;
  onMoveStage: (lead: Doc<"leads">, stage: Stage) => void;
  onDocumentos: () => void;
  onConverter: () => void;
}) {
  const navigate = useNavigate();
  const criarProposta = useMutation(api.propostas.create);
  const registrarContato = useMutation(api.funil.registrarContato);
  const [criandoProposta, setCriandoProposta] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const ultimoContato = descreverUltimoContato(lead.lastInteraction);
  const atualizado = descreverUltimaAtualizacao(lead);
  const nextStage = STAGES[STAGES.findIndex((s) => s.id === lead.stage) + 1];
  const grupo = grupoDaEtapa(lead.stage);

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

  // Uma proposta nasce COM os dados do lead — nome, tipo, data, local e
  // número de convidados são copiados. Redigitar o que já está na tela é o
  // tipo de trabalho que faz a decoradora deixar para depois.
  const novaProposta = () => {
    setCriandoProposta(true);
    void criarProposta({ leadId: lead._id })
      .then((id) => navigate(`/propostas/${id}`))
      .catch((e) =>
        toast.error(
          e instanceof ConvexError
            ? (e.data as { message: string }).message
            : "Não foi possível criar a proposta.",
        ),
      )
      .finally(() => setCriandoProposta(false));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{lead.clientName}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <EtiquetaDaEtapa etapa={lead.stage} />
            <span className="text-xs text-muted-foreground">Grupo: {grupo.rotulo}</span>
          </div>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</h3>
          {lead.clientPhone ? (
            <a
              href={`https://wa.me/55${lead.clientPhone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:underline"
            >
              <Phone className="size-4 text-muted-foreground" /> {lead.clientPhone}
              <span className="text-xs text-muted-foreground">(WhatsApp)</span>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">Sem telefone cadastrado.</p>
          )}
          <ResponsavelInline
            registro={lead}
            prefixo="Atendendo: "
            className="block text-sm text-muted-foreground"
          />
          {/* ÚLTIMO CONTATO — "falei com a cliente", distinto de "Atualizado"
              (alguém mexeu no registro). Ver src/lib/ultimo-contato.ts. */}
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <MessageCircle className="size-4" />
            Último contato:{" "}
            <span className="text-foreground">{ultimoContato ?? "nenhum registrado"}</span>
          </p>
          {/* Um toque, sem diálogo: registrar conversa é o gesto mais
              frequente do funil. Some nos estágios finais — cobrar follow-up
              de lead fechado ou perdido é ruído. */}
          {lead.stage !== "contracted" && lead.stage !== "discarded" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void registrar()}
              disabled={registrando}
              title="Grava a data e a hora de agora como último contato"
              className="w-full sm:w-auto cursor-pointer gap-1.5 h-10 sm:h-9"
            >
              <MessageCircle className="size-4" />
              {registrando ? "Registrando..." : "Registrar contato"}
            </Button>
          )}
        </section>

        <section className="space-y-1.5 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evento</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>{rotuloDoTipoDeEvento(lead.eventType) ?? "—"}</dd>
            <dt className="text-muted-foreground">Data</dt>
            <dd>{lead.eventDate ? formatEventDayOnly(lead.eventDate) : "sem data"}</dd>
            <dt className="text-muted-foreground">Orçamento</dt>
            <dd>{lead.budget ? emReais(lead.budget) : "não informado"}</dd>
          </dl>
          {lead.notes && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{lead.notes}</p>
          )}
          {/* "Faz quanto tempo que eu não olho isto?" — o Convex só dá a data
              de CRIAÇÃO. Ver convex/lib/ultimaAtualizacao.ts. */}
          {atualizado && <p className="text-xs text-muted-foreground">Atualizado {atualizado}</p>}
        </section>

        {/* A PROPOSTA DESTA NEGOCIAÇÃO. O número é o da proposta, não o
            `budget` anotado à mão, e os dois podem divergir de propósito. */}
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposta</h3>
          {proposta ? (
            <Link
              to={`/propostas/${proposta.ultima._id}`}
              className="flex items-center gap-2 text-sm hover:underline"
            >
              <FileText className="size-4 text-muted-foreground flex-shrink-0" />
              <span className="min-w-0 break-words">
                {emReais(proposta.ultima.investimento)}
                {" · "}
                {proposta.ultima.vencida ? "venceu" : ROTULO_DO_STATUS[proposta.ultima.status]}
                {proposta.quantidade > 1 && ` · ${proposta.quantidade} propostas`}
              </span>
            </Link>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={novaProposta}
              disabled={criandoProposta}
              className="w-full sm:w-auto cursor-pointer gap-1.5 h-10 sm:h-9"
            >
              <FileText className="size-4" />
              {criandoProposta ? "Criando..." : "Criar proposta"}
            </Button>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etapa</h3>
          <div className="flex flex-wrap gap-2">
            {lead.stage !== "contracted" && lead.stage !== "discarded" && nextStage && (
              <Button
                size="sm"
                onClick={() => onMoveStage(lead, nextStage.id)}
                className="cursor-pointer gap-1.5 h-10 sm:h-9"
              >
                <ArrowRight className="size-4" /> Avançar para {nextStage.label}
              </Button>
            )}
            {lead.stage === "contracted" && !lead.convertedEventId && (
              <Button
                size="sm"
                onClick={onConverter}
                className="cursor-pointer gap-1.5 h-10 sm:h-9 bg-green-600 hover:bg-green-700 text-white"
              >
                <ArrowRight className="size-4" /> Criar Evento
              </Button>
            )}
            {lead.convertedEventId && (
              <Link
                to={`/eventos/${lead.convertedEventId}`}
                className="text-sm text-green-700 dark:text-green-400 hover:underline"
              >
                ✓ Evento criado — abrir
              </Link>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Para escolher outra etapa, use Editar.
          </p>
        </section>

        <DialogFooter className="border-t border-border pt-3 gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onDelete(lead)}
            className="cursor-pointer gap-1.5 text-muted-foreground hover:text-destructive h-10 sm:h-9"
          >
            <Trash2 className="size-4" /> Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onDocumentos} className="flex-1 cursor-pointer gap-1.5 h-10 sm:h-9">
              <Paperclip className="size-4" /> Documentos
            </Button>
            <Button variant="outline" onClick={() => onEdit(lead)} className="flex-1 cursor-pointer gap-1.5 h-10 sm:h-9">
              <Pencil className="size-4" /> Editar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadCard({
  lead,
  isDragging,
  mostrarEtapa,
  onEdit,
  onDelete,
  onMoveStage,
  onDragStart,
  onDragEnd,
  onDropBefore,
  proposta,
  abrirConversao,
  aoFecharConversao,
}: {
  lead: Doc<"leads">;
  isDragging: boolean;
  /** Na visão agrupada a coluna não diz a etapa — o card diz. */
  mostrarEtapa: boolean;
  /** A proposta mais recente deste lead. Ausente = ainda não há nenhuma. */
  proposta?: { quantidade: number; ultima: ResumoDeProposta };
  /**
   * Chegou da tela da proposta aceita, pedindo para converter ESTE lead.
   *
   * Ela vinha de "Aceita — crie o evento pelo Funil" e caía num quadro com
   * quarenta cartões, para procurar o dela e clicar em "Criar Evento". O
   * endereço já sabia de quem era a proposta; faltava carregar essa
   * informação. Mesmo precedente do `?ambiente=` da Galeria.
   */
  abrirConversao?: boolean;
  aoFecharConversao?: () => void;
  onEdit: (lead: Doc<"leads">) => void;
  onDelete: (lead: Doc<"leads">) => void;
  onMoveStage: (lead: Doc<"leads">, stage: Stage) => void;
  onDragStart: (lead: Doc<"leads">) => void;
  onDragEnd: () => void;
  onDropBefore: (target: Doc<"leads">) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [converting, setConverting] = useState(false);
  const [documentos, setDocumentos] = useState(false);
  const ultimoContato = descreverUltimoContato(lead.lastInteraction);

  // Fecha o lead aberto antes de abrir outro diálogo por cima dele: dois
  // modais empilhados prendem o foco no de baixo e, no celular, o de cima
  // aparece atrás.
  const doLeadAberto = (acao: () => void) => () => {
    setAberto(false);
    acao();
  };

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
        // `min-w-0` + `overflow-hidden`: nada do card passa da borda, nem nome
        // comprido nem botão — era o "Documentos" saindo pela direita.
        "min-w-0 overflow-hidden bg-background border border-border rounded-xl p-3 space-y-2.5 shadow-sm cursor-grab active:cursor-grabbing transition-shadow",
        isDragging && "opacity-50 ring-2 ring-primary/40 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-semibold text-sm leading-snug break-words line-clamp-2">{lead.clientName}</p>
          {mostrarEtapa && <EtiquetaDaEtapa etapa={lead.stage} />}
        </div>
        <div className="flex flex-shrink-0 -mr-1 -mt-1">
          <button
            onClick={() => onEdit(lead)}
            aria-label={`Editar ${lead.clientName}`}
            className="size-9 md:size-8 inline-flex items-center justify-center rounded-md hover:bg-accent cursor-pointer text-muted-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={() => onDelete(lead)}
            aria-label={`Excluir ${lead.clientName}`}
            className="size-9 md:size-8 inline-flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Os dados de relance, um por linha: nome do tipo, data e valor não
          disputam mais a mesma linha com quebra imprevisível. */}
      <div className="grid gap-1">
        {lead.clientPhone && (
          <DadoDoCard icone={<Phone className="size-3" />}>{lead.clientPhone}</DadoDoCard>
        )}
        {lead.eventType && (
          <DadoDoCard icone={<Tag className="size-3" />}>{rotuloDoTipoDeEvento(lead.eventType)}</DadoDoCard>
        )}
        {lead.eventDate && (
          <DadoDoCard icone={<CalendarDays className="size-3" />}>{formatEventDayOnly(lead.eventDate)}</DadoDoCard>
        )}
        {lead.budget ? (
          <span className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-primary">
            <DollarSign className="size-3 flex-shrink-0" />
            <span className="truncate">{emReais(lead.budget)}</span>
          </span>
        ) : null}
      </div>

      <ResponsavelInline
        registro={lead}
        prefixo="Atendendo: "
        className="block text-xs text-muted-foreground truncate"
      />

      {/* ÚLTIMO CONTATO — a pergunta que custa dinheiro no funil. Fica no
          card porque é ela que decide em quem tocar primeiro. */}
      {ultimoContato && (
        <DadoDoCard icone={<MessageCircle className="size-3" />}>
          Último contato: <span className="text-foreground">{ultimoContato}</span>
        </DadoDoCard>
      )}

      {/* A proposta de relance: valor e situação. Abrir é pelo lead. */}
      {proposta && (
        <DadoDoCard icone={<FileText className="size-3" />}>
          {emReais(proposta.ultima.investimento)}
          {" · "}
          {proposta.ultima.vencida ? "venceu" : ROTULO_DO_STATUS[proposta.ultima.status]}
        </DadoDoCard>
      )}

      {lead.convertedEventId && (
        <p className="text-xs text-green-700 dark:text-green-400">✓ Evento criado</p>
      )}

      {/* RODAPÉ: a ação principal e a secundária, lado a lado, cada uma com a
          sua metade. Antes eram até cinco links numa linha só. */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        <Button
          size="sm"
          onClick={() => setAberto(true)}
          className="min-w-0 cursor-pointer h-9 px-2 text-xs"
        >
          <span className="truncate">Abrir lead</span>
        </Button>
        {/* Proposta e contrato ficam com o LEAD, disponíveis em qualquer
            estágio — a papelada da negociação existe antes do evento. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDocumentos(true)}
          className="min-w-0 cursor-pointer h-9 px-2 gap-1 text-xs"
        >
          <Paperclip className="size-3.5 flex-shrink-0" />
          <span className="truncate">Documentos</span>
        </Button>
      </div>

      {aberto && (
        <LeadAberto
          lead={lead}
          proposta={proposta}
          open={aberto}
          onClose={() => setAberto(false)}
          onEdit={(l) => doLeadAberto(() => onEdit(l))()}
          onDelete={(l) => doLeadAberto(() => onDelete(l))()}
          onMoveStage={onMoveStage}
          onDocumentos={doLeadAberto(() => setDocumentos(true))}
          onConverter={doLeadAberto(() => setConverting(true))}
        />
      )}

      {(converting || abrirConversao) && (
        <ConvertDialog
          lead={lead}
          open
          onClose={() => {
            setConverting(false);
            // Limpa o endereço junto: sem isto, fechar o diálogo e recarregar
            // a página o abriria de novo, e ela ficaria presa nele.
            aoFecharConversao?.();
          }}
        />
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

/**
 * Uma coluna do quadro — de etapa ou de grupo. O cabeçalho e a área de soltar
 * são os mesmos; o que muda é quem decide o destino ao soltar.
 *
 * `oculta`: no celular só a coluna escolhida aparece (ver o seletor no topo);
 * do `md` para cima, todas.
 */
function Coluna({
  rotulo,
  cor,
  fundo,
  leads,
  isDragOver,
  oculta,
  larga,
  onAdd,
  onDragOver,
  onDrop,
  resumo,
  children,
}: {
  rotulo: string;
  cor: string;
  fundo: string;
  leads: Doc<"leads">[];
  isDragOver: boolean;
  oculta: boolean;
  /** Visão agrupada: quatro colunas que dividem a largura toda. */
  larga: boolean;
  onAdd?: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  /**
   * A linha de baixo do cabeçalho, quando a soma simples mentiria. Em
   * Fechamento, somar a coluna juntava o valor dos PERDIDOS ao dos ganhos.
   */
  resumo?: string;
  children: React.ReactNode;
}) {
  const totalBudget = leads.reduce((s, l) => s + (l.budget ?? 0), 0);

  return (
    <div
      className={cn(
        "flex-col w-full",
        // Mínimo de 240 px nos grupos: em tela média, quatro colunas
        // espremidas cortavam o rodapé do card; melhor rolar de lado.
        larga ? "md:flex-1 md:min-w-[240px]" : "md:min-w-[260px] md:w-[260px] lg:flex-1",
        oculta ? "hidden md:flex" : "flex",
      )}
    >
      <div className={cn("flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl mb-3", fundo)}>
        <div className="min-w-0">
          <p className={cn("font-semibold text-sm truncate", cor)}>{rotulo}</p>
          <p className="text-xs text-muted-foreground truncate">
            {resumo ?? (
              <>
                {leads.length} lead{leads.length !== 1 ? "s" : ""}
                {totalBudget > 0 && ` · ${emReais(totalBudget)}`}
              </>
            )}
          </p>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            aria-label={`Nova oportunidade em ${rotulo}`}
            className="size-9 flex-shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-background/50 cursor-pointer text-muted-foreground"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <div
        className={cn(
          "flex flex-col gap-2 flex-1 rounded-xl p-1 -m-1 transition-colors",
          isDragOver && "bg-primary/5 ring-2 ring-primary/30",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
      >
        {children}
        {leads.length === 0 && (
          <div
            className={cn(
              "border-2 border-dashed border-border rounded-xl p-4 text-center text-xs text-muted-foreground",
              onAdd && "cursor-pointer hover:border-primary/40 transition-colors",
              isDragOver && "border-primary/50",
            )}
            onClick={onAdd}
          >
            {onAdd ? "+ Adicionar lead" : "Nenhum lead aqui"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FunilPage() {
  const leads = useQuery(api.funil.listLeads);
  // UMA consulta para o quadro inteiro. Uma por card seriam tantas assinaturas
  // reativas quantos leads abertos — custo que não aparece em teste e aparece
  // na conta.
  const propostas = useQuery(api.propostas.resumoPorLead, {});
  const createLead = useMutation(api.funil.createLead);
  const updateLead = useMutation(api.funil.updateLead);
  const deleteLead = useMutation(api.funil.deleteLead);

  const [creating, setCreating] = useState<Stage | null>(null);
  const [editing, setEditing] = useState<Doc<"leads"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"leads"> | null>(null);
  const [dragging, setDragging] = useState<Doc<"leads"> | null>(null);
  const [dragOverColuna, setDragOverColuna] = useState<string | null>(null);

  // ── "ACEITA — CRIE O EVENTO" CHEGA NO CARTÃO CERTO ────────────────────────
  // A tela da proposta aceita mandava para `/funil` e a decoradora caía num
  // quadro com quarenta cartões, para procurar o dela e clicar em "Criar
  // Evento". O endereço já sabia de quem era a proposta.
  //
  // O id vem da URL e é conferido contra os leads que o SERVIDOR devolveu: id
  // forjado, de outra conta ou de lead apagado simplesmente não casa com
  // nenhum cartão, e nada abre. A conversão em si continua passando pelos
  // guardas de sempre.
  const [searchParams, setSearchParams] = useSearchParams();
  const converterLeadId = (searchParams.get("converter") ?? null) as Id<"leads"> | null;
  const limparConversaoDaUrl = () => {
    const proximos = new URLSearchParams(searchParams);
    proximos.delete("converter");
    setSearchParams(proximos, { replace: true });
  };

  /**
   * O orçamento do lead, ou `null` quando não dá para ler.
   *
   * `parseFloat("1.500,00")` é 1.5 — o orçamento de mil e quinhentos entrava
   * como um e cinquenta, e é por esse número que a decoradora prioriza o
   * funil. Ver `src/lib/valor-digitado.ts`.
   */
  const orcamentoDoLead = (texto: string | undefined): number | null | "erro" => {
    if (!texto?.trim()) return null;
    const valor = valorDigitado(texto);
    if (valor === null || valor < 0) return "erro";
    return valor;
  };

  const handleCreate = async (values: LeadFormValues, responsibleId?: string) => {
    const budget = orcamentoDoLead(values.budget);
    if (budget === "erro") {
      toast.error("Orçamento não reconhecido. Ex.: 1.500,00");
      return;
    }
    try {
      await createLead({
        ...values,
        responsibleId: responsibleId as Id<"teamMembers"> | undefined,
        budget: budget ?? undefined,
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
    const budget = orcamentoDoLead(values.budget);
    if (budget === "erro") {
      toast.error("Orçamento não reconhecido. Ex.: 1.500,00");
      return;
    }
    try {
      // Edição é substituição: `null` limpa o campo. Com `undefined`, o pedido
      // era descartado no transporte e o valor antigo permanecia.
      await updateLead({
        id: editing._id,
        ...values,
        // `null` limpa o vínculo quando a decoradora escolhe "Ninguém definido".
        responsibleId: (responsibleId ?? null) as Id<"teamMembers"> | null,
        budget,
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
    setDragOverColuna(null);
  };
  const handleDropBefore = (target: Doc<"leads">) => {
    if (dragging) void moveTo(dragging, target.stage, target);
    endDrag();
  };

  // ── A VISÃO: QUATRO GRUPOS (INICIAL) OU AS SETE ETAPAS ───────────────────
  // Na URL, e não em estado solto: recarregar a página ou mandar o link
  // mantém a visão. Ver src/lib/funil-grupos.ts.
  const visao = visaoDaUrl(searchParams.get("visao"));
  // No celular aparece UMA coluna por vez, escolhida no seletor do topo.
  // `null` = a primeira. Some ao trocar de visão: o id de um grupo não
  // existe na lista de etapas, e vice-versa.
  const [colunaNoCelular, setColunaNoCelular] = useState<string | null>(null);
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false);
  const trocarVisao = (v: Visao) => {
    const proximos = new URLSearchParams(searchParams);
    if (v === "etapas") proximos.set("visao", "etapas");
    else proximos.delete("visao");
    setSearchParams(proximos, { replace: true });
    setColunaNoCelular(null);
  };

  type ColunaDoQuadro = {
    id: string;
    rotulo: string;
    cor: string;
    fundo: string;
    leads: Doc<"leads">[];
    /** Etapa ao criar pelo "+". `null` = a coluna não cria lead. */
    etapaAoCriar: Stage | null;
    /** Etapa ao soltar na coluna. `null` = ambíguo, a tela não escolhe. */
    etapaAoSoltar: Stage | null;
    grupo?: Grupo;
  };

  const colunas: ColunaDoQuadro[] =
    visao === "etapas"
      ? STAGES.map((s) => ({
          id: s.id,
          rotulo: s.label,
          cor: s.color,
          fundo: s.bg,
          leads: leadsById[s.id],
          etapaAoCriar: s.id,
          etapaAoSoltar: s.id,
        }))
      : GRUPOS.map((g) => ({
          id: g.id,
          rotulo: g.rotulo,
          cor: COR_DO_GRUPO[g.id].cor,
          fundo: COR_DO_GRUPO[g.id].fundo,
          // Na ordem do funil: dentro do grupo, os cards de cada etapa
          // ficam juntos, e cada um diz a sua.
          leads: g.etapas.flatMap((e) => leadsById[e]),
          etapaAoCriar: etapaAoCriarNoGrupo(g),
          etapaAoSoltar: etapaAoSoltarNoGrupo(g),
          grupo: g,
        }));
  const colunaVisivel = colunaNoCelular ?? colunas[0]?.id;

  const handleDropColuna = (coluna: ColunaDoQuadro) => {
    const arrastado = dragging;
    endDrag();
    if (!arrastado) return;
    if (coluna.etapaAoSoltar) {
      void moveTo(arrastado, coluna.etapaAoSoltar, null);
      return;
    }
    // Ficou no mesmo grupo: a etapa não muda, só vai para o fim da lista.
    if (coluna.grupo?.etapas.includes(arrastado.stage)) {
      void moveTo(arrastado, arrastado.stage, null);
      return;
    }
    // "Em atendimento" é contato realizado OU reunião agendada. Escolher uma
    // das duas aqui seria gravar uma etapa que ninguém escolheu.
    toast.info(
      `"${coluna.rotulo}" tem mais de uma etapa. Solte o lead em cima de um card da etapa certa, ou abra o lead e use Editar.`,
    );
  };

  const cardDe = (lead: Doc<"leads">) => (
    <LeadCard
      key={lead._id}
      lead={lead}
      isDragging={dragging?._id === lead._id}
      mostrarEtapa={visao === "grupos"}
      onEdit={setEditing}
      onDelete={setDeleting}
      onMoveStage={handleMoveStage}
      onDragStart={setDragging}
      onDragEnd={endDrag}
      onDropBefore={handleDropBefore}
      proposta={propostas?.porLead[lead._id]}
      abrirConversao={converterLeadId === lead._id}
      aoFecharConversao={limparConversaoDaUrl}
    />
  );

  /** Fechamento: ganhos e perdidos na mesma coluna, nunca na mesma lista. */
  const conteudoDoFechamento = (leadsDaColuna: Doc<"leads">[]) => {
    const ganhos = leadsDaColuna.filter((l) => desfecho(l.stage) === "ganho");
    const perdidos = leadsDaColuna.filter((l) => desfecho(l.stage) === "perdido");
    return (
      <>
        <p className="px-1 text-xs font-semibold text-green-700 dark:text-green-400">
          Ganhos · {ganhos.length}
        </p>
        {ganhos.map(cardDe)}
        {/* Perdidos começam recolhidos: são histórico, e abertos empurram
            os ganhos para fora da tela. */}
        <button
          onClick={() => setMostrarPerdidos((v) => !v)}
          aria-expanded={mostrarPerdidos}
          className="mt-2 h-9 px-1 flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 cursor-pointer hover:underline"
        >
          {mostrarPerdidos ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Perdidos · {perdidos.length}
        </button>
        {mostrarPerdidos && perdidos.map(cardDe)}
      </>
    );
  };

  /** Fechamento: quantos ganhos, quantos perdidos, e o valor só dos ganhos. */
  const resumoDoFechamento = (leadsDaColuna: Doc<"leads">[]) => {
    const g = leadsDaColuna.filter((l) => desfecho(l.stage) === "ganho");
    const p = leadsDaColuna.length - g.length;
    const valor = g.reduce((s, l) => s + (l.budget ?? 0), 0);
    return (
      `${g.length} ganho${g.length !== 1 ? "s" : ""}` +
      (valor > 0 ? ` (${emReais(valor)})` : "") +
      ` · ${p} perdido${p !== 1 ? "s" : ""}`
    );
  };

  const ativos = (leads ?? []).filter((l) => grupoDaEtapa(l.stage).ativo).length;
  const ganhos = (leads ?? []).filter((l) => desfecho(l.stage) === "ganho").length;

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Funil de Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {leads === undefined
              ? "..."
              : `${ativos} oportunidade${ativos !== 1 ? "s" : ""} em aberto · ${ganhos} ganha${ganhos !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setCreating("contact")} className="cursor-pointer gap-2 h-10">
          <Plus className="size-4" /> Novo Lead
        </Button>
      </div>

      {/* A troca de visão. "Ver todas as etapas" é o quadro antigo, intacto. */}
      <div className="mb-4 inline-flex self-start rounded-lg border border-border p-1 text-sm" role="group" aria-label="Visão do funil">
        <button
          onClick={() => trocarVisao("grupos")}
          aria-pressed={visao === "grupos"}
          className={cn(
            "h-9 px-3 rounded-md cursor-pointer",
            visao === "grupos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Visão resumida
        </button>
        <button
          onClick={() => trocarVisao("etapas")}
          aria-pressed={visao === "etapas"}
          className={cn(
            "h-9 px-3 rounded-md cursor-pointer",
            visao === "etapas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Ver todas as etapas
        </button>
      </div>

      {/* CELULAR: escolher a coluna, em vez de arrastar o quadro de lado. */}
      {leads !== undefined && (
        // Grupos: grade 2×2, os quatro sempre à vista — numa fileira só,
        // "Fechamento" ficava fora da tela de 375 px. Etapas: sete não cabem
        // em grade legível, então a fileira rola.
        <div className={cn("md:hidden mb-4", visao === "etapas" && "-mx-4 px-4 overflow-x-auto")}>
          <div
            role="tablist"
            aria-label="Coluna exibida"
            className={visao === "grupos" ? "grid grid-cols-2 gap-2" : "flex gap-2 w-max"}
          >
            {colunas.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === colunaVisivel}
                onClick={() => setColunaNoCelular(c.id)}
                className={cn(
                  "h-10 px-3 rounded-full border text-sm whitespace-nowrap cursor-pointer min-w-0 truncate",
                  c.id === colunaVisivel
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {c.rotulo} <span className="opacity-80">· {c.leads.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {leads === undefined ? (
        <div className="flex gap-4 pb-4">
          {(visao === "etapas" ? STAGES : GRUPOS).map((s, i) => (
            <Skeleton key={s.id} className={cn("h-64 rounded-xl flex-1 min-w-0", i > 0 && "hidden md:block")} />
          ))}
        </div>
      ) : (
        // `px-1`: a área de soltar de cada coluna tem `-m-1`, e na última ela
        // passava 4 px da borda — o bastante para uma barra de rolagem à toa.
        <div className="flex gap-4 pb-4 px-1 flex-1 md:overflow-x-auto">
          {colunas.map((c) => (
            <Coluna
              key={c.id}
              rotulo={c.rotulo}
              cor={c.cor}
              fundo={c.fundo}
              leads={c.leads}
              isDragOver={dragOverColuna === c.id}
              oculta={c.id !== colunaVisivel}
              larga={visao === "grupos"}
              onAdd={c.etapaAoCriar ? () => setCreating(c.etapaAoCriar) : undefined}
              onDragOver={() => setDragOverColuna(c.id)}
              onDrop={() => handleDropColuna(c)}
              resumo={c.grupo?.id === "fechamento" ? resumoDoFechamento(c.leads) : undefined}
            >
              {c.grupo?.id === "fechamento" ? conteudoDoFechamento(c.leads) : c.leads.map(cardDe)}
            </Coluna>
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
