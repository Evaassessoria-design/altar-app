import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ArrowLeft, Save, ChevronRight, Sparkles, FileDown, Loader2, Truck, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  BRIEFING_AREAS,
  areaTemTextoAntigo,
  type BriefingFields,
} from "@/lib/briefing-areas.ts";

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
import { suggestAssemblyItems } from "@/lib/assembly-suggestions.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { AUDIENCIAS, AUDIENCIA_PADRAO, opcaoDaAudiencia } from "@/lib/audiencia-do-caderno.ts";
import type { Audience } from "@/lib/briefing-areas.ts";

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
  // As peças do acervo reservadas — o segundo bloco da Folha de Carregamento.
  // A folha perguntava "o que vai no caminhão?" e respondia só metade: o
  // número que SAIU e o que VOLTOU já estavam gravados na reserva e viviam
  // noutra tela, que quem está no galpão com a prancheta não vai abrir.
  const acervo = useQuery(api.acervo.doEvento, { eventId });
  // Identidade da empresa para o documento. Ambas degradam para null e o
  // caderno sai igualmente completo, só com o padrão do ALTAR.
  const empresa = useQuery(api.users.getCurrentUser);
  const logoUrl = useQuery(api.users.getLogoUrl);

  // O telefone vem do VÍNCULO resolvido no servidor (convex/health.ts), não de
  // casar o nome com a lista de escalados. Casar por nome errava com duas
  // "Camila" e falhava sempre que o responsável era uma anotação livre.
  const responsavelTelefone = health?.responsiblePhone;
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

  // As descrições DESTA área que ainda não viraram item. `suggestAssemblyItems`
  // já sabe o que existe e não reoferece — então uma lista vazia significa
  // literalmente "não há nada aqui que o produto não esteja usando".
  const convertiveis = useMemo(
    () =>
      suggestAssemblyItems(briefing, items ?? []).filter(
        (s) => s.area === BRIEFING_AREAS[activeArea]?.key,
      ),
    [briefing, items, activeArea],
  );

  // Os itens estruturados DESTA área. É o que decide qual dos dois avisos a
  // tela mostra — o convite para converter, ou o lembrete de que o texto é
  // anotação.
  const itensDaArea = (items ?? []).filter(
    (i) => i.area === BRIEFING_AREAS[activeArea]?.key,
  );
  const textoEItemConvivem =
    itensDaArea.length > 0 &&
    convertiveis.length === 0 &&
    areaTemTextoAntigo(BRIEFING_AREAS[activeArea], briefing);

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
      await (await import("@/lib/generate-loading-pdf.ts")).generateLoadingPDF({
        event,
        items: (items ?? []) as never,
        // Reserva sem item resolvido (peça excluída do acervo depois de
        // reservada) é descartada em `montarPecasDoAcervo`: linha sem nome na
        // prancheta não ajuda ninguém a conferir.
        acervo: (acervo?.reservas ?? []).map((r) => ({
          _id: r._id,
          nome: r.item?.nome ?? "",
          unidade: r.item?.unidade,
          quantidade: r.quantidade,
          saiu: r.saiu,
          voltou: r.voltou,
        })),
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

  /**
   * O caderno, para quem ele for.
   *
   * O gerador já filtrava por audiência — itens de montagem por
   * `itemVisibleTo` e campos do briefing por `resolveAreasForAudience`. Esta
   * tela chamava com `"equipe"` fixo, então a versão da cliente, que a regra
   * sabia produzir, nunca chegava a existir.
   */
  const handleExport = async (audience: Audience = AUDIENCIA_PADRAO) => {
    if (!event) return;
    setExporting(true);
    try {
      await (await import("@/lib/generate-assembly-pdf.ts")).generateAssemblyPDF({
        event,
        briefing,
        items: items ?? [],
        checklist: checklist ?? [],
        guestCount: health?.guestCount,
        assessoria: health?.assessoria,
        responsible: health?.responsible,
        mapUrl,
        audience,
        empresa: empresa ?? null,
        logoDataUrl: await carregarLogo(logoUrl),
        responsiblePhone: responsavelTelefone,
      });
      toast.success(`Caderno gerado — ${opcaoDaAudiencia(audience).rotulo.toLowerCase()}.`);
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
              {/* Três cadernos, um evento. O menu pergunta PARA QUEM antes de
                  gerar, em vez de a tela decidir sozinha — e nenhum dos rótulos
                  mostra o valor de banco ("equipe", "cliente", "interno"). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
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
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Para quem é este caderno?</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AUDIENCIAS.map((a) => (
                    <DropdownMenuItem
                      key={a.valor}
                      onSelect={() => void handleExport(a.valor)}
                      className="cursor-pointer flex-col items-start gap-0.5 py-2"
                    >
                      <span className="text-sm font-medium">{a.rotulo}</span>
                      <span className="text-xs text-muted-foreground whitespace-normal">
                        {a.detalhe}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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

                {/* ── O QUE ESTE TEXTO ALCANÇA, E O QUE NÃO ──────────────────
                    "Tipo das Cadeiras: Dior" e "Quantidade: 120" descrevem o
                    combinado, e é só isso que fazem: quem monta, quem carrega,
                    quem compra e o Projeto Visual leem os ITENS da lista
                    abaixo, não estes campos.
                    Quem preenchia o texto e não a lista fazia metade do
                    trabalho e recebia metade do produto, sem nada na tela
                    dizendo isso. O aviso só aparece quando há de fato algo
                    aqui que ainda não virou item — senão seria ruído. */}
                {convertiveis.length > 0 && (
                  <div className="mb-5 rounded-lg border border-primary/30 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground leading-snug min-w-0 flex-1">
                      O que está escrito aqui <strong>não</strong> chega ao Caderno, às
                      Compras nem ao Projeto Visual — quem chega são os itens.{" "}
                      {convertiveis.length === 1
                        ? "Há 1 descrição que pode virar item."
                        : `Há ${convertiveis.length} descrições que podem virar itens.`}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setSuggesting(true)}
                      className="cursor-pointer gap-1.5 flex-shrink-0"
                    >
                      <Sparkles className="size-3.5" /> Criar itens
                    </Button>
                  </div>
                )}

                {/* ── QUANDO OS DOIS COEXISTEM ───────────────────────────────
                    Convertido o texto em item, o convite acima some — e o
                    campo continua escrito, para sempre, sem nada dizendo qual
                    dos dois o produto usa. Ela ajusta o item para 130 e o
                    texto segue dizendo 120.

                    Apagar o texto seria errado: é anotação dela, e pode
                    conter o que o item não comporta ("as douradas; as
                    prateadas ficam de reserva"). O certo é DIZER que é
                    anotação. */}
                {textoEItemConvivem && (
                  <p className="mb-5 text-xs text-muted-foreground border-l-2 border-border pl-2.5 leading-snug">
                    Esta área já tem {itensDaArea.length === 1 ? "1 item" : `${itensDaArea.length} itens`}{" "}
                    cadastrado{itensDaArea.length === 1 ? "" : "s"}. Os campos abaixo valem como{" "}
                    <strong>anotação</strong> — quem monta, compra e apresenta lê os itens.
                  </p>
                )}

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
          // Os itens que já existem. Sem isto, abrir o convite duas vezes
          // criava a segunda "Cadeira Dior" e a Folha de Carregamento passava
          // a pedir 240 cadeiras.
          jaExistentes={items ?? []}
          onClose={() => setSuggesting(false)}
        />
      )}
    </div>
  );
}
