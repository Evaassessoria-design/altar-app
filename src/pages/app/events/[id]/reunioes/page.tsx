import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import { dataDoDia } from "@/convex/lib/dataDoDia.ts";
import { formatEventDayOnly, formatEventWeekday } from "@/lib/event-date.ts";
import { mensagemSeguraDoErro } from "@/lib/mensagem-segura.ts";
import {
  ROTULO_DA_SITUACAO,
  normalizarLink,
  precisaDeDesfecho,
  servicoDoLink,
  type SituacaoDaReuniao,
  type SugestaoDaReuniao,
} from "@/convex/lib/reunioes.ts";

// ─────────────────────────────────────────────────────────────────────────────
// REUNIÕES DO EVENTO
//
// "Quando é a próxima?" e "o que ficou decidido na última?" — as duas
// perguntas que a decoradora faz antes de ligar para a cliente.
//
// Toda reunião reabre: realizada ou cancelada continua editável, porque a ata
// se completa depois e o clique trocado precisa de volta. A agenda da empresa
// (/agenda) mostra as mesmas reuniões — é leitura desta tabela, não cópia.
//
// A sugestão da IA é PRÉVIA: nada é gravado até a pessoa marcar o que aceita
// e salvar. As anotações originais nunca são reescritas por ela.
// ─────────────────────────────────────────────────────────────────────────────

type Reuniao = Doc<"reunioes">;
type Pendencia = NonNullable<Reuniao["pendencias"]>[number];

type Formulario = {
  titulo: string;
  data: string;
  horario: string;
  situacao: SituacaoDaReuniao;
  participantes: string;
  link: string;
  pauta: string;
  anotacoes: string;
  resumo: string;
  decisoes: string[];
  pendencias: Pendencia[];
  proximaData: string;
};

const SITUACOES: SituacaoDaReuniao[] = ["agendada", "realizada", "cancelada"];

const TOM_DA_SITUACAO: Record<SituacaoDaReuniao, string> = {
  agendada: "bg-primary/10 text-primary",
  realizada: "bg-muted text-foreground",
  cancelada: "bg-muted text-muted-foreground line-through",
};

function vazio(data = dataDoDia()): Formulario {
  return {
    titulo: "",
    data,
    horario: "",
    situacao: "agendada",
    participantes: "",
    link: "",
    pauta: "",
    anotacoes: "",
    resumo: "",
    decisoes: [],
    pendencias: [],
    proximaData: "",
  };
}

function doRegistro(r: Reuniao): Formulario {
  return {
    titulo: r.titulo,
    data: r.data,
    horario: r.horario ?? "",
    situacao: r.situacao,
    participantes: r.participantes ?? "",
    link: r.link ?? "",
    pauta: r.pauta ?? "",
    anotacoes: r.anotacoes ?? "",
    resumo: r.resumo ?? "",
    decisoes: r.decisoes ?? [],
    pendencias: r.pendencias ?? [],
    proximaData: r.proximaData ?? "",
  };
}

function quando(r: { data: string; horario?: string }) {
  return `${formatEventWeekday(r.data)}, ${formatEventDayOnly(r.data)} · ${r.horario ?? "horário a combinar"}`;
}

function avisarErro(e: unknown, padrao: string) {
  toast.error(mensagemSeguraDoErro(e) ?? padrao);
}

export default function ReunioesDoEventoPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const [busca, setBusca] = useSearchParams();
  const dados = useQuery(api.reunioes.doEvento, { eventId });
  const hoje = dataDoDia();

  // `null` = fechado; "nova" = criando; id = editando.
  const [aberta, setAberta] = useState<"nova" | Id<"reunioes"> | null>(null);
  const [inicialDaNova, setInicialDaNova] = useState<Partial<Formulario>>({});

  // Vindo da Agenda: /eventos/:id/reunioes?reuniao=<id> abre a reunião.
  const pedida = busca.get("reuniao");
  useEffect(() => {
    if (!pedida || !dados) return;
    if (dados.reunioes.some((r) => r._id === pedida)) setAberta(pedida as Id<"reunioes">);
    else toast.error("Essa reunião não foi encontrada neste evento.");
    setBusca({}, { replace: true });
  }, [pedida, dados, setBusca]);

  const editando = aberta && aberta !== "nova" ? dados?.reunioes.find((r) => r._id === aberta) : undefined;
  const event = dados?.evento;

  if (dados === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (dados === null) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">Evento não encontrado.</p>
        <Link to="/eventos" className="text-sm text-primary hover:underline">
          Voltar aos eventos
        </Link>
      </div>
    );
  }

  const novaReuniao = (inicial: Partial<Formulario> = {}) => {
    setInicialDaNova(inicial);
    setAberta("nova");
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/eventos/${id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {event?.name}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Reuniões</h1>
          <p className="text-sm text-muted-foreground">
            O que foi combinado com a cliente, registrado no evento.
          </p>
        </div>
        <Button onClick={() => novaReuniao()} className="flex-shrink-0">
          <Plus className="size-4" /> Nova reunião
        </Button>
      </div>

      {dados.reunioes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClock />
            </EmptyMedia>
            <EmptyTitle>Nenhuma reunião registrada</EmptyTitle>
            <EmptyDescription>
              Agende a próxima conversa com a cliente — briefing, prova, alinhamento final — e anote ali o
              que for decidido. Ela aparece também na Agenda.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => novaReuniao()}>
            <Plus className="size-4" /> Registrar a primeira
          </Button>
        </Empty>
      ) : (
        <div className="space-y-2">
          {dados.reunioes.map((r) => {
            const abertas = (r.pendencias ?? []).filter((p) => !p.feita).length;
            return (
              <div
                key={r._id}
                role="button"
                tabIndex={0}
                onClick={() => setAberta(r._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAberta(r._id);
                  }
                }}
                className="block w-full cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      TOM_DA_SITUACAO[r.situacao],
                    )}
                  >
                    {ROTULO_DA_SITUACAO[r.situacao]}
                  </span>
                  <span className="text-xs text-muted-foreground">{quando(r)}</span>
                </div>
                <p className="mt-1 font-medium">{r.titulo}</p>
                {r.participantes && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                    <Users className="size-3 flex-shrink-0" />
                    <span className="truncate">{r.participantes}</span>
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    r.decisoes?.length ? `${r.decisoes.length} decisão(ões)` : null,
                    r.pendencias?.length
                      ? abertas > 0
                        ? `${abertas} pendência(s) em aberto`
                        : "pendências concluídas"
                      : null,
                    !r.anotacoes && r.situacao === "realizada" ? "sem anotações" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Toque para abrir e anotar"}
                </p>
                {precisaDeDesfecho(r, hoje) && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    A data passou. Ela aconteceu? Abra e marque como realizada ou cancelada.
                  </p>
                )}
                {r.link && r.situacao === "agendada" && (
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" /> Entrar na sala ({servicoDoLink(r.link)})
                  </a>
                )}
              </div>
            );
          })}
          {dados.temMais && (
            <p className="text-xs text-muted-foreground">
              {dados.reunioes.length} carregadas (há mais neste evento).
            </p>
          )}
        </div>
      )}

      {aberta !== null && (aberta === "nova" || editando) && (
        <EditorDeReuniao
          key={aberta}
          eventId={eventId}
          reuniao={editando}
          inicial={aberta === "nova" ? { ...vazio(), ...inicialDaNova } : doRegistro(editando!)}
          onFechar={() => setAberta(null)}
          onCriada={(novaId) => setAberta(novaId)}
          onAgendarProxima={(f) => {
            setAberta(null);
            // Abre a próxima já com o dia combinado e os mesmos participantes;
            // nada é criado até ela salvar.
            setTimeout(
              () =>
                novaReuniao({
                  data: f.proximaData,
                  titulo: f.titulo,
                  participantes: f.participantes,
                  link: f.link,
                }),
              0,
            );
          }}
        />
      )}
    </div>
  );
}

function EditorDeReuniao({
  eventId,
  reuniao,
  inicial,
  onFechar,
  onCriada,
  onAgendarProxima,
}: {
  eventId: Id<"events">;
  reuniao?: Reuniao;
  inicial: Formulario;
  onFechar: () => void;
  onCriada: (id: Id<"reunioes">) => void;
  onAgendarProxima: (f: Formulario) => void;
}) {
  const criar = useMutation(api.reunioes.criar);
  const atualizar = useMutation(api.reunioes.atualizar);
  const remover = useMutation(api.reunioes.remover);
  const sugerir = useAction(api.reunioesIa.sugerirResumo);

  const [f, setF] = useState<Formulario>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [novaDecisao, setNovaDecisao] = useState("");
  const [novaPendencia, setNovaPendencia] = useState("");
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestao, setSugestao] = useState<SugestaoDaReuniao | null>(null);

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }));

  // O que mudou desde o último salvamento — a tela avisa antes de perder.
  const alterado = useMemo(() => JSON.stringify(f) !== JSON.stringify(inicial), [f, inicial]);
  const linkInvalido = f.link.trim() ? (() => {
    const r = normalizarLink(f.link);
    return r.ok ? null : r.motivo;
  })() : null;
  // A sugestão lê as notas SALVAS: sugerir sobre o texto da tela, sem salvar,
  // produziria decisões que não existem no registro.
  const notasSalvas = (reuniao?.anotacoes ?? "").trim();
  const notasPendentesDeSalvar = f.anotacoes.trim() !== notasSalvas;

  const salvar = async (fecharDepois: boolean) => {
    if (!f.titulo.trim()) return toast.error("Dê um título à reunião (ex.: Reunião de briefing).");
    if (!f.data) return toast.error("Escolha a data da reunião.");
    if (linkInvalido) return toast.error(linkInvalido);
    setSalvando(true);
    try {
      if (!reuniao) {
        const id = await criar({
          eventId,
          titulo: f.titulo,
          data: f.data,
          horario: f.horario || undefined,
          participantes: f.participantes || undefined,
          link: f.link || undefined,
          pauta: f.pauta || undefined,
          situacao: f.situacao,
        });
        // O que só existe depois da reunião (ata, decisões…) vai num segundo
        // passo, para a criação continuar simples e idempotente.
        if (f.anotacoes || f.resumo || f.decisoes.length || f.pendencias.length || f.proximaData) {
          await atualizar({
            id,
            anotacoes: f.anotacoes || null,
            resumo: f.resumo || null,
            decisoes: f.decisoes,
            pendencias: f.pendencias,
            proximaData: f.proximaData || null,
          });
        }
        toast.success("Reunião registrada.");
        if (fecharDepois) onFechar();
        else onCriada(id);
      } else {
        await atualizar({
          id: reuniao._id,
          titulo: f.titulo,
          data: f.data,
          horario: f.horario || null,
          situacao: f.situacao,
          participantes: f.participantes || null,
          link: f.link || null,
          pauta: f.pauta || null,
          anotacoes: f.anotacoes || null,
          resumo: f.resumo || null,
          decisoes: f.decisoes,
          pendencias: f.pendencias,
          proximaData: f.proximaData || null,
        });
        toast.success("Reunião salva.");
        if (fecharDepois) onFechar();
      }
    } catch (e) {
      // O formulário continua aberto e preenchido: nada do que ela digitou se perde.
      avisarErro(e, "Não foi possível salvar. Confira os campos e tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const pedirSugestao = async () => {
    if (!reuniao) return;
    setSugerindo(true);
    setSugestao(null);
    try {
      setSugestao(await sugerir({ id: reuniao._id }));
    } catch (e) {
      avisarErro(e, "A sugestão não pôde ser gerada agora. As anotações continuam salvas.");
    } finally {
      setSugerindo(false);
    }
  };

  const fechar = () => {
    if (salvando) return;
    if (alterado && !window.confirm("Há alterações não salvas nesta reunião. Sair sem salvar?")) return;
    onFechar();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{reuniao ? "Reunião" : "Nova reunião"}</DialogTitle>
          <DialogDescription>
            Nada é enviado à cliente: o convite e o link você manda como sempre mandou.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <div>
            <Label htmlFor="r-titulo" className="text-xs">Título</Label>
            <Input
              id="r-titulo"
              value={f.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex.: Reunião de briefing, prova do bolo, alinhamento final"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="r-data" className="text-xs">Data</Label>
              <Input id="r-data" type="date" value={f.data} onChange={(e) => set("data", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="r-hora" className="text-xs">Horário</Label>
              <Input id="r-hora" type="time" value={f.horario} onChange={(e) => set("horario", e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Situação</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {SITUACOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("situacao", s)}
                  aria-pressed={f.situacao === s}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
                    f.situacao === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {ROTULO_DA_SITUACAO[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="r-part" className="text-xs">Participantes</Label>
            <Input
              id="r-part"
              value={f.participantes}
              onChange={(e) => set("participantes", e.target.value)}
              placeholder="Ex.: Helena e Tiago; a mãe da aniversariante; a gerente do buffet"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="r-link" className="text-xs">Link da sala (Meet, Zoom…)</Label>
            <Input
              id="r-link"
              value={f.link}
              onChange={(e) => set("link", e.target.value)}
              placeholder="Cole o link — ou deixe vazio se for presencial"
              className="mt-1"
              inputMode="url"
            />
            {linkInvalido && <p className="mt-1 text-xs text-destructive">{linkInvalido}</p>}
          </div>

          <div>
            <Label htmlFor="r-pauta" className="text-xs">Pauta</Label>
            <AutoTextarea
              id="r-pauta"
              minRows={2}
              value={f.pauta}
              onChange={(e) => set("pauta", e.target.value)}
              placeholder="O que precisa ser decidido nesta conversa"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="r-notas" className="text-xs">Anotações / ata</Label>
            <AutoTextarea
              id="r-notas"
              minRows={4}
              value={f.anotacoes}
              onChange={(e) => set("anotacoes", e.target.value)}
              placeholder="O que foi conversado, do jeito que você anotaria no caderno."
              className="mt-1"
            />
          </div>

          {/* ── Sugestão da IA: prévia, nunca gravação direta ── */}
          {reuniao && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground min-w-0">
                  A IA pode sugerir um resumo, decisões e pendências a partir das anotações salvas. Você revisa
                  antes; nada é gravado sozinho.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={sugerindo || notasSalvas.length < 20 || notasPendentesDeSalvar}
                  onClick={() => void pedirSugestao()}
                >
                  {sugerindo ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {sugerindo ? "Lendo as notas…" : "Sugerir resumo"}
                </Button>
              </div>
              {(notasSalvas.length < 20 || notasPendentesDeSalvar) && (
                <p className="text-xs text-muted-foreground">
                  {notasPendentesDeSalvar
                    ? "Salve as anotações primeiro — a sugestão lê o que está registrado."
                    : "Escreva as anotações da reunião para pedir uma sugestão."}
                </p>
              )}
              {sugestao && (
                <PreviaDaSugestao
                  sugestao={sugestao}
                  onAceitar={(aceito) => {
                    setF((x) => ({
                      ...x,
                      resumo: aceito.resumo ? aceito.resumo : x.resumo,
                      decisoes: [...x.decisoes, ...aceito.decisoes.filter((d) => !x.decisoes.includes(d))],
                      pendencias: [
                        ...x.pendencias,
                        ...aceito.pendencias
                          .filter((p) => !x.pendencias.some((q) => q.texto === p.texto))
                          .map((p) => ({ texto: p.texto, responsavel: p.responsavel, feita: false })),
                      ],
                    }));
                    setSugestao(null);
                    toast.info("Sugestão acrescentada ao formulário. Revise e salve.");
                  }}
                  onDescartar={() => setSugestao(null)}
                />
              )}
            </div>
          )}

          <div>
            <Label htmlFor="r-resumo" className="text-xs">Resumo</Label>
            <AutoTextarea
              id="r-resumo"
              minRows={2}
              value={f.resumo}
              onChange={(e) => set("resumo", e.target.value)}
              placeholder="Em poucas linhas, para quem não estava na reunião"
              className="mt-1"
            />
          </div>

          {/* Decisões */}
          <div>
            <Label className="text-xs">Decisões</Label>
            {f.decisoes.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nenhuma decisão registrada.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {f.decisoes.map((d, i) => (
                  <li key={`${i}-${d}`} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 flex-shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0 flex-1 break-words">{d}</span>
                    <button
                      type="button"
                      aria-label="Remover decisão"
                      onClick={() => set("decisoes", f.decisoes.filter((_, j) => j !== i))}
                      className="cursor-pointer p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!novaDecisao.trim()) return;
                set("decisoes", [...f.decisoes, novaDecisao.trim()]);
                setNovaDecisao("");
              }}
            >
              <Input
                value={novaDecisao}
                onChange={(e) => setNovaDecisao(e.target.value)}
                placeholder="Ex.: Paleta em tons de terracota"
                className="min-w-0"
              />
              <Button type="submit" variant="outline" size="sm" className="flex-shrink-0" disabled={!novaDecisao.trim()}>
                Adicionar
              </Button>
            </form>
          </div>

          {/* Pendências */}
          <div>
            <Label className="text-xs">Pendências</Label>
            {f.pendencias.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nenhuma pendência registrada.</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {f.pendencias.map((p, i) => (
                  <li key={i} className="rounded-lg border border-border p-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-label={p.feita ? "Marcar como em aberto" : "Marcar como feita"}
                        onClick={() =>
                          set(
                            "pendencias",
                            f.pendencias.map((q, j) => (j === i ? { ...q, feita: !q.feita } : q)),
                          )
                        }
                        className="cursor-pointer pt-0.5 text-primary"
                      >
                        {p.feita ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                      </button>
                      <span className={cn("min-w-0 flex-1 text-sm break-words", p.feita && "line-through text-muted-foreground")}>
                        {p.texto}
                      </span>
                      <button
                        type="button"
                        aria-label="Remover pendência"
                        onClick={() => set("pendencias", f.pendencias.filter((_, j) => j !== i))}
                        className="cursor-pointer p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-6">
                      <Input
                        value={p.responsavel ?? ""}
                        onChange={(e) =>
                          set(
                            "pendencias",
                            f.pendencias.map((q, j) => (j === i ? { ...q, responsavel: e.target.value || undefined } : q)),
                          )
                        }
                        placeholder="Quem faz"
                        className="h-8 text-xs min-w-0"
                      />
                      <Input
                        type="date"
                        value={p.prazo ?? ""}
                        aria-label="Prazo"
                        onChange={(e) =>
                          set(
                            "pendencias",
                            f.pendencias.map((q, j) => (j === i ? { ...q, prazo: e.target.value || undefined } : q)),
                          )
                        }
                        className="h-8 text-xs min-w-0"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!novaPendencia.trim()) return;
                set("pendencias", [...f.pendencias, { texto: novaPendencia.trim(), feita: false }]);
                setNovaPendencia("");
              }}
            >
              <Input
                value={novaPendencia}
                onChange={(e) => setNovaPendencia(e.target.value)}
                placeholder="Ex.: Enviar 3 opções de toalha"
                className="min-w-0"
              />
              <Button type="submit" variant="outline" size="sm" className="flex-shrink-0" disabled={!novaPendencia.trim()}>
                Adicionar
              </Button>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <Label htmlFor="r-proxima" className="text-xs">Próxima reunião</Label>
              <Input
                id="r-proxima"
                type="date"
                value={f.proximaData}
                onChange={(e) => set("proximaData", e.target.value)}
                className="mt-1"
              />
            </div>
            {reuniao && f.proximaData && !alterado && (
              <Button type="button" variant="outline" onClick={() => onAgendarProxima(f)}>
                <CalendarClock className="size-4" /> Agendar a próxima
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {reuniao ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={salvando}
              onClick={() => setConfirmarExclusao(true)}
            >
              <Trash2 className="size-4" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={salvando} onClick={fechar}>
              {alterado ? "Cancelar" : "Fechar"}
            </Button>
            <Button type="button" disabled={salvando || !alterado} onClick={() => void salvar(true)}>
              {salvando && <Loader2 className="size-4 animate-spin" />}
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>

        <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta reunião?</AlertDialogTitle>
              <AlertDialogDescription>
                A ata, o resumo, as decisões e as pendências desta reunião serão apagados. Se ela só não
                aconteceu, prefira marcar como cancelada — o registro fica.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  if (!reuniao) return;
                  void remover({ id: reuniao._id })
                    .then(() => {
                      toast.success("Reunião excluída.");
                      onFechar();
                    })
                    .catch((e) => avisarErro(e, "Não foi possível excluir a reunião."));
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function PreviaDaSugestao({
  sugestao,
  onAceitar,
  onDescartar,
}: {
  sugestao: SugestaoDaReuniao;
  onAceitar: (a: {
    resumo?: string;
    decisoes: string[];
    pendencias: { texto: string; responsavel?: string }[];
  }) => void;
  onDescartar: () => void;
}) {
  const [usarResumo, setUsarResumo] = useState(!!sugestao.resumo);
  const [decisoes, setDecisoes] = useState(() => sugestao.decisoes.map(() => true));
  const [pendencias, setPendencias] = useState(() => sugestao.pendencias.map(() => true));
  const nada = !sugestao.resumo && sugestao.decisoes.length === 0 && sugestao.pendencias.length === 0;

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
      <p className="text-xs font-medium">Prévia — marque o que quer aproveitar</p>
      {nada && <p className="text-xs text-muted-foreground">A IA não encontrou nada claro nas anotações.</p>}
      {sugestao.resumo && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={usarResumo} onChange={(e) => setUsarResumo(e.target.checked)} />
          <span className="min-w-0 break-words">
            <span className="text-xs text-muted-foreground">Resumo: </span>
            {sugestao.resumo}
          </span>
        </label>
      )}
      {sugestao.decisoes.map((d, i) => (
        <label key={`d${i}`} className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={decisoes[i]}
            onChange={(e) => setDecisoes((x) => x.map((v, j) => (j === i ? e.target.checked : v)))}
          />
          <span className="min-w-0 break-words">
            <span className="text-xs text-muted-foreground">Decisão: </span>
            {d.texto}
            <span className="block text-xs text-muted-foreground italic">nas notas: “{d.trecho}”</span>
          </span>
        </label>
      ))}
      {sugestao.pendencias.map((p, i) => (
        <label key={`p${i}`} className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={pendencias[i]}
            onChange={(e) => setPendencias((x) => x.map((v, j) => (j === i ? e.target.checked : v)))}
          />
          <span className="min-w-0 break-words">
            <span className="text-xs text-muted-foreground">Pendência: </span>
            {p.texto}
            {p.responsavel ? ` — ${p.responsavel}` : ""}
            <span className="block text-xs text-muted-foreground italic">nas notas: “{p.trecho}”</span>
          </span>
        </label>
      ))}
      {sugestao.descartados > 0 && (
        <p className="text-xs text-muted-foreground">
          {sugestao.descartados} item(ns) sugerido(s) foram descartados por não aparecerem nas anotações.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!nada && (
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onAceitar({
                resumo: usarResumo ? sugestao.resumo : undefined,
                decisoes: sugestao.decisoes.filter((_, i) => decisoes[i]).map((d) => d.texto),
                pendencias: sugestao.pendencias
                  .filter((_, i) => pendencias[i])
                  .map((p) => ({ texto: p.texto, responsavel: p.responsavel })),
              })
            }
          >
            Acrescentar ao formulário
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDescartar}>
          Descartar
        </Button>
      </div>
    </div>
  );
}
