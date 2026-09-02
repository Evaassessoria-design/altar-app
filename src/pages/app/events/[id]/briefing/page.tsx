import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ArrowLeft, Save, ChevronRight, Sparkles, FileDown, Loader2, Truck } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { BRIEFING_AREAS, type BriefingFields } from "@/lib/briefing-areas.ts";
import { generateAssemblyPDF } from "@/lib/generate-assembly-pdf.ts";
import { generateLoadingPDF } from "@/lib/generate-loading-pdf.ts";

/**
 * Converte a logo em data URL para o jsPDF.
 *
 * Falha de rede ou imagem inválida NÃO pode impedir a geração do caderno:
 * devolve null e o cabeçalho sai sem logo.
 */
async function carregarLogo(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
import { AssemblyItemsSection } from "../_components/assembly-items-section.tsx";
import { SuggestItemsDialog } from "../_components/suggest-items-dialog.tsx";

// As áreas vêm de src/lib/briefing-areas.ts — mesma definição usada pelo PDF do
// evento e pelo Caderno de Montagem. Não redeclarar seções aqui.

export default function EventBriefingPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const [activeArea, setActiveArea] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportandoCarga, setExportandoCarga] = useState(false);

  const event = useQuery(api.events.get, { id: eventId });
  const briefing = useQuery(api.briefing.getBriefing, { eventId });
  const items = useQuery(api.assemblyItems.listByEvent, { eventId });
  const checklist = useQuery(api.briefing.getChecklist, { eventId, phase: "pre" });
  const health = useQuery(api.health.getEventHealth, { eventId });
  const renders = useQuery(api.layoutRenders.listByEvent, { eventId });
  // Identidade da empresa para o documento. Ambas degradam para null e o
  // caderno sai igualmente completo, só com o padrão do ALTAR.
  const empresa = useQuery(api.users.getCurrentUser);
  const logoUrl = useQuery(api.users.getLogoUrl);
  const eventTeam = useQuery(api.team.listEventTeam, { eventId });

  // LACUNA CONHECIDA: o evento não tem um campo "responsável operacional".
  // `health.getEventHealth` já usava a PRIMEIRA pessoa escalada como
  // responsável; aqui buscamos o telefone DELA, casando pelo nome, para que o
  // documento nunca mostre o nome de uma pessoa com o telefone de outra.
  // Um campo explícito de responsável é a próxima etapa — não inventamos um
  // contato paralelo agora.
  const responsavelTelefone = eventTeam?.find(
    (a) => a.member?.name === health?.responsible,
  )?.member?.phone;
  const upsertBriefing = useMutation(api.briefing.upsertBriefing);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<BriefingFields>({ defaultValues: {} });

  useEffect(() => {
    if (briefing !== undefined) {
      if (briefing) {
        const { _id, _creationTime, eventId: _e, userId, ...fields } = briefing;
        reset(fields);
      } else {
        reset({});
      }
    }
  }, [briefing, reset]);

  const onSave = async (data: BriefingFields) => {
    try {
      await upsertBriefing({ eventId, ...data });
      toast.success("Briefing salvo!");
      reset(data);
    } catch {
      toast.error("Erro ao salvar briefing");
    }
  };

  // Planta premium mais recente concluída — vira o mapa do caderno. Se não
  // existir, a seção simplesmente não aparece no PDF.
  const mapUrl =
    renders?.find((r) => r.status === "done" && r.outputUrl)?.outputUrl ?? null;

  /**
   * Folha de carregamento — LOGÍSTICA, não projeto.
   *
   * Documento irmão do Caderno, e de propósito separado dele: quem carrega o
   * caminhão precisa de item, quantidade e caixas de marcar; quem monta
   * precisa de referência e composição. Cobre o evento INTEIRO, não só a área
   * aberta na tela.
   */
  const handleExportarCarregamento = async () => {
    if (!event) return;
    setExportandoCarga(true);
    try {
      await generateLoadingPDF({
        event,
        items: (items ?? []) as never,
        empresa: empresa ?? null,
        responsible: health?.responsible,
        responsiblePhone: responsavelTelefone,
      });
      toast.success("Folha de carregamento gerada!");
    } catch {
      toast.error("Erro ao gerar a folha de carregamento.");
    } finally {
      setExportandoCarga(false);
    }
  };

  const handleExport = async () => {
    if (!event) return;
    setExporting(true);
    try {
      await generateAssemblyPDF({
        event,
        briefing,
        items: items ?? [],
        checklist: checklist ?? [],
        guestCount: health?.guestCount,
        assessoria: health?.assessoria,
        responsible: health?.responsible,
        mapUrl,
        audience: "equipe",
        empresa: empresa ?? null,
        logoDataUrl: await carregarLogo(logoUrl),
        responsiblePhone: responsavelTelefone,
      });
      toast.success("Caderno de montagem gerado!");
    } catch {
      toast.error("Erro ao gerar o caderno de montagem.");
    } finally {
      setExporting(false);
    }
  };

  const area = BRIEFING_AREAS[activeArea];

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] md:max-h-screen">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-border bg-background flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <Link
            to={`/eventos/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 cursor-pointer"
          >
            <ArrowLeft className="size-4" />
            {event?.name ?? "Evento"}
          </Link>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Briefing</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSuggesting(true)}
                className="cursor-pointer gap-1.5"
              >
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline">Criar itens do briefing</span>
                <span className="sm:hidden">Itens</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleExport()}
                disabled={exporting || !event}
                className="cursor-pointer gap-1.5"
              >
                {exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileDown className="size-3.5" />
                )}
                <span className="hidden sm:inline">Caderno de Montagem</span>
                <span className="sm:hidden">PDF</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleExportarCarregamento()}
                disabled={exportandoCarga || !event}
                className="cursor-pointer gap-1.5"
                title="Lista do que entra no caminhão, por ambiente, com saída e retorno"
              >
                {exportandoCarga ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Truck className="size-3.5" />
                )}
                <span className="hidden sm:inline">Carregamento</span>
                <span className="sm:hidden">Carga</span>
              </Button>
              <Button
                onClick={handleSubmit(onSave)}
                disabled={!isDirty || isSubmitting}
                size="sm"
                className="cursor-pointer flex items-center gap-1.5"
              >
                <Save className="size-3.5" />
                {isSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden max-w-3xl mx-auto w-full">
        {/* Navegação — desktop */}
        <aside className="hidden md:flex flex-col w-52 border-r border-border flex-shrink-0 overflow-y-auto py-3 px-2">
          {BRIEFING_AREAS.map((a, i) => (
            <button
              key={a.key}
              onClick={() => setActiveArea(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-left transition-colors cursor-pointer w-full",
                activeArea === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <span>{a.emoji}</span>
              <span className="truncate">{a.label}</span>
            </button>
          ))}
        </aside>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {/* Navegação — mobile */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
            {BRIEFING_AREAS.map((a, i) => (
              <button
                key={a.key}
                onClick={() => setActiveArea(i)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer flex-shrink-0",
                  activeArea === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground",
                )}
              >
                {a.emoji} {a.label}
              </button>
            ))}
          </div>

          {briefing === undefined ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit(onSave)}>
                <div className="mb-5 flex items-center gap-2">
                  <span className="text-2xl">{area.emoji}</span>
                  <h2 className="text-lg font-semibold">{area.label}</h2>
                </div>

                <div className="space-y-6">
                  {area.groups.map((group, gi) => (
                    <div key={gi} className="space-y-4">
                      {group.label && (
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
                          {group.label}
                        </h3>
                      )}
                      {group.fields.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <Label htmlFor={field.key}>{field.label}</Label>
                          {field.type === "textarea" ? (
                            <Textarea
                              id={field.key}
                              rows={3}
                              placeholder={`${field.label}...`}
                              {...register(field.key)}
                            />
                          ) : (
                            <Input
                              id={field.key}
                              placeholder={field.label}
                              {...register(field.key)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-8 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setActiveArea((s) => Math.max(0, s - 1))}
                    disabled={activeArea === 0}
                    className="cursor-pointer"
                  >
                    Anterior
                  </Button>
                  {activeArea < BRIEFING_AREAS.length - 1 ? (
                    <Button
                      type="button"
                      onClick={async () => {
                        if (isDirty) await handleSubmit(onSave)();
                        setActiveArea((s) => s + 1);
                      }}
                      className="cursor-pointer flex items-center gap-1.5"
                    >
                      Próximo <ChevronRight className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={!isDirty || isSubmitting}
                      className="cursor-pointer flex items-center gap-1.5"
                    >
                      <Save className="size-4" />
                      {isSubmitting ? "Salvando..." : "Salvar Briefing"}
                    </Button>
                  )}
                </div>
              </form>

              {/* Itens operacionais da área (fora do <form> para não submeter junto) */}
              {area.supportsItems && (
                <AssemblyItemsSection
                  eventId={eventId}
                  area={area.key}
                  areaLabel={area.label}
                />
              )}
            </>
          )}
        </div>
      </div>

      {suggesting && (
        <SuggestItemsDialog
          eventId={eventId}
          briefing={briefing}
          onClose={() => setSuggesting(false)}
        />
      )}
    </div>
  );
}
