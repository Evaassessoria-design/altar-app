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
import { ArrowLeft, Save, ChevronRight, Sparkles, FileDown, Loader2, Truck, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  BRIEFING_AREAS,
  areaTemTextoAntigo,
  blocosDaArea,
  type BriefingFields,
  type BriefingGroup,
} from "@/lib/briefing-areas.ts";
import { ConferenciaDeMobiliario } from "../_components/conferencia-de-mobiliario.tsx";
import { ReferenciasDoBloco } from "../_components/referencias-do-bloco.tsx";

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
import { AUDIENCIAS, rotuloDaVersao, type VersaoDoCaderno } from "@/lib/audiencia-do-caderno.ts";
import { CadernoDeMontagemDialog } from "../_components/caderno-de-montagem-dialog.tsx";

// As áreas vêm de src/lib/briefing-areas.ts — mesma definição usada pelo PDF do
// evento e pelo Caderno de Montagem. Não redeclarar seções aqui.

export default function EventBriefingPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const [activeArea, setActiveArea] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [exportandoCarga, setExportandoCarga] = useState(false);

  const event = useQuery(api.events.get, { id: eventId });
  const briefing = useQuery(api.briefing.getBriefing, { eventId });
  const items = useQuery(api.assemblyItems.listByEvent, { eventId });
  const health = useQuery(api.health.getEventHealth, { eventId });
  // As peças do acervo reservadas — o segundo bloco da Folha de Carregamento.
  // A folha perguntava "o que vai no caminhão?" e respondia só metade: o
  // número que SAIU e o que VOLTOU já estavam gravados na reserva e viviam
  // noutra tela, que quem está no galpão com a prancheta não vai abrir.
  const acervo = useQuery(api.acervo.doEvento, { eventId });
  // Identidade da empresa para o documento. Ambas degradam para null e o
  // caderno sai igualmente completo, só com o padrão do ALTAR.
  const empresa = useQuery(api.users.getCurrentUser);

  // O telefone vem do VÍNCULO resolvido no servidor (convex/health.ts), não de
  // casar o nome com a lista de escalados. Casar por nome errava com duas
  // "Camila" e falhava sempre que o responsável era uma anotação livre.
  const responsavelTelefone = health?.responsiblePhone;
  const upsertBriefing = useMutation(api.briefing.upsertBriefing);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm<BriefingFields>({ defaultValues: {} });
  // As respostas curtas (Sim / Não / A definir) e os blocos condicionais leem
  // o valor ATUAL do formulário, não o salvo — o cantinho das crianças abre
  // no toque em "Sim", antes de salvar.
  const valores = watch();
  // Bloco aberto/fechado pela decoradora. Ausente = a regra padrão (abaixo).
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

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
   * O caderno, para quem ele for — agora com prévia.
   *
   * O menu escolhe a versão; o diálogo monta o caderno (`montarCaderno`),
   * mostra o mesmo conteúdo que vai para o PDF e só então baixa. Eram três
   * opções; "Uso interno" saiu (ver `audiencia-do-caderno.ts`).
   */
  const [cadernoAberto, setCadernoAberto] = useState<VersaoDoCaderno | null>(null);

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
                    disabled={!event}
                    className="cursor-pointer gap-1.5"
                  >
                    <FileDown className="size-3.5" />
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
                      onSelect={() => setCadernoAberto(a.valor)}
                      className="cursor-pointer flex-col items-start gap-0.5 py-2"
                    >
                      <span className="text-sm font-medium">{rotuloDaVersao(a.valor, event?.type)}</span>
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
              {/* Sem <form>: os blocos misturam campos e itens, e um Enter ou
                  um botão de item dentro de um formulário submeteria o
                  briefing inteiro. Salvar é sempre um gesto explícito. */}
              <div>
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

                {area.conferenciaDeMobiliario && <ConferenciaDeMobiliario eventId={eventId} />}

                <div className="space-y-3">
                  {area.groups.map((group, gi) => {
                    if (group.mostrarSe && valores[group.mostrarSe.campo] !== group.mostrarSe.valor) {
                      return null;
                    }
                    const chave = `${area.key}:${group.key ?? gi}`;
                    const conteudo = (
                      <BlocoDoBriefing
                        group={group}
                        register={register}
                        valores={valores}
                        escolher={(campo, valor) =>
                          setValue(campo, valor, { shouldDirty: true })
                        }
                      >
                        {group.itens && (
                          <AssemblyItemsSection
                            eventId={eventId}
                            area={area.key}
                            areaLabel={area.label}
                            bloco={group.itens}
                          />
                        )}
                        {group.referencias && (
                          <ReferenciasDoBloco eventId={eventId} ambiente={group.referencias.ambiente} />
                        )}
                      </BlocoDoBriefing>
                    );
                    // Grupo sem título (Informações Gerais) é o de sempre: aberto.
                    if (!group.label) return <div key={chave}>{conteudo}</div>;
                    const aberto = abertos[chave] ?? blocoComecaAberto(group, gi, valores, itensDaArea);
                    return (
                      <section key={chave} className="rounded-xl border border-border bg-card">
                        <button
                          type="button"
                          onClick={() => setAbertos((a) => ({ ...a, [chave]: !aberto }))}
                          aria-expanded={aberto}
                          className="flex w-full items-start justify-between gap-2 px-4 py-3 text-left cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{group.label}</span>
                            {group.descricao && (
                              <span className="block text-xs text-muted-foreground">{group.descricao}</span>
                            )}
                          </span>
                          {aberto ? (
                            <ChevronUp className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
                          )}
                        </button>
                        {aberto && <div className="border-t border-border px-4 py-3">{conteudo}</div>}
                      </section>
                    );
                  })}
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
                      type="button"
                      onClick={handleSubmit(onSave)}
                      disabled={!isDirty || isSubmitting}
                      className="cursor-pointer flex items-center gap-1.5"
                    >
                      <Save className="size-4" />
                      {isSubmitting ? "Salvando..." : "Salvar Briefing"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Itens operacionais da área (fora do <form> para não submeter junto) */}
              {area.supportsItems && (
                <AssemblyItemsSection
                  eventId={eventId}
                  area={area.key}
                  areaLabel={area.label}
                  blocosDaArea={blocosDaArea(area).map((b) => b.bloco)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {cadernoAberto && (
        <CadernoDeMontagemDialog
          eventId={eventId}
          versao={cadernoAberto}
          onClose={() => setCadernoAberto(null)}
        />
      )}
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

/**
 * Um bloco começa aberto quando é o primeiro da aba ou quando já tem algo
 * escrito ou cadastrado — quem volta ao briefing vê o que preencheu. Os
 * complementares começam fechados: são o texto antigo, não o centro da aba.
 */
function blocoComecaAberto(
  group: BriefingGroup,
  indice: number,
  valores: Partial<BriefingFields>,
  itensDaArea: readonly { bloco?: string }[],
): boolean {
  if (group.complementar) return false;
  if (indice === 0) return true;
  const temTexto = group.fields.some((f) => {
    const v = valores[f.key];
    return typeof v === "string" && v.trim().length > 0;
  });
  const temItem = !!group.itens && itensDaArea.some((i) => i.bloco === group.itens!.bloco);
  return temTexto || temItem;
}

function BlocoDoBriefing({
  group,
  register,
  valores,
  escolher,
  children,
}: {
  group: BriefingGroup;
  register: ReturnType<typeof useForm<BriefingFields>>["register"];
  valores: Partial<BriefingFields>;
  escolher: (campo: keyof BriefingFields, valor: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {group.fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={field.type === "escolha" ? undefined : field.key}>{field.label}</Label>
          {field.dica && <p className="text-[11px] text-muted-foreground -mt-1">{field.dica}</p>}
          {field.type === "escolha" ? (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={field.label}>
              {(field.opcoes ?? []).map((o) => {
                const marcado = valores[field.key] === o.valor;
                return (
                  <button
                    key={o.valor}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    // Tocar de novo na resposta marcada a desfaz: "ninguém
                    // respondeu" é diferente de "Não".
                    onClick={() => escolher(field.key, marcado ? "" : o.valor)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors",
                      marcado
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {o.rotulo}
                  </button>
                );
              })}
            </div>
          ) : field.type === "textarea" ? (
            <Textarea id={field.key} rows={3} placeholder={`${field.label}...`} {...register(field.key)} />
          ) : (
            <Input id={field.key} placeholder={field.label} {...register(field.key)} />
          )}
        </div>
      ))}
      {children}
    </div>
  );
}
