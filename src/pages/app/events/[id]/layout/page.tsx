import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import {
  ArrowLeft,
  Box,
  Circle,
  Copy,
  FileDown,
  Grid3x3,
  ListOrdered,
  Loader2,
  Map as MapIcon,
  Minus,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import type { DadosDoLayout, OrigemDoLayout } from "@/convex/lib/layoutSalao.ts";
import { problemasDoLayout } from "@/convex/lib/layoutSalao.ts";
import { distribuirMesas, type PecaDaBiblioteca } from "@/convex/lib/layoutSalaoBiblioteca.ts";
import {
  duplicarAlvo,
  elementoDaPeca,
  moverAlvo,
  novoIdLocal,
  removerAlvo,
  renumerarMesas,
  type Alvo,
} from "@/lib/layout-salao.ts";
import { resolveIdentidade } from "@/lib/brand.ts";
import { urlDeExibicao } from "@/lib/imagem-reduzida.ts";
import { Planta2D } from "@/components/layout-salao/planta-2d.tsx";
import { NovoLayoutDialog } from "@/components/layout-salao/novo-layout-dialog.tsx";
import { BibliotecaDialog, PainelPropriedades } from "@/components/layout-salao/painel-propriedades.tsx";
import type { Visao3DHandle } from "@/components/layout-salao/visao-3d.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT DO SALÃO — 2D editável + 3D + PDF para os clientes.
//
// O editor trabalha numa CÓPIA local do layout e só grava em "Salvar": mexer
// em dez mesas não pode virar dez gravações no 4G de galpão, e "desfazer"
// precisa de passado local. Sair com alteração pendente avisa.
//
// O 3D é carregado sob demanda (three.js é pesado) e, depois de aberto uma
// vez, continua montado por baixo — é de lá que sai a imagem 3D do PDF.
// ─────────────────────────────────────────────────────────────────────────────

const Visao3D = lazy(() =>
  import("@/components/layout-salao/visao-3d.tsx").then((m) => ({ default: m.Visao3D })),
);

const mensagemDe = (e: unknown, padrao: string) =>
  e instanceof ConvexError ? ((e.data as { message?: string })?.message ?? padrao) : padrao;

type Rascunho = {
  /** Ausente = ainda não gravado (veio de modelo ou da IA). */
  layoutId?: Id<"eventLayouts">;
  nome: string;
  origem: OrigemDoLayout;
  dados: DadosDoLayout;
};

type Foto = { url: string | null; previewUrl: string | null };

export default function LayoutDoSalaoPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;

  const event = useQuery(api.events.get, { id: eventId });
  const empresa = useQuery(api.users.getCurrentUser);
  const layouts = useQuery(api.layoutSalao.listarDoEvento, { eventId });

  const [layoutId, setLayoutId] = useState<Id<"eventLayouts"> | null>(null);
  const salvo = useQuery(api.layoutSalao.obter, layoutId ? { layoutId } : "skip");

  const criar = useMutation(api.layoutSalao.criar);
  const salvar = useMutation(api.layoutSalao.salvar);
  const duplicar = useMutation(api.layoutSalao.duplicar);
  const remover = useMutation(api.layoutSalao.remover);

  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [passado, setPassado] = useState<DadosDoLayout[]>([]);
  const [futuro, setFuturo] = useState<DadosDoLayout[]>([]);
  const [fotosNovas, setFotosNovas] = useState<Record<string, Foto>>({});
  const [avisos, setAvisos] = useState<string[]>([]);

  const [selecionado, setSelecionado] = useState<Alvo | null>(null);
  const [aba, setAba] = useState<"2d" | "3d">("2d");
  const [abriu3d, setAbriu3d] = useState(false);
  const [paredes, setParedes] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [novoAberto, setNovoAberto] = useState(false);
  const [bibliotecaAberta, setBibliotecaAberta] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const visao3d = useRef<Visao3DHandle>(null);

  const destaque = useMemo(() => {
    const cor = resolveIdentidade(empresa ?? null).cor;
    return `#${cor.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }, [empresa]);

  // Primeiro layout do evento abre sozinho.
  useEffect(() => {
    if (!layoutId && !rascunho && layouts && layouts.length > 0) setLayoutId(layouts[0]._id);
  }, [layouts, layoutId, rascunho]);

  // O que veio do servidor vira o rascunho — a não ser que ela esteja editando.
  useEffect(() => {
    if (!salvo || alterado) return;
    setRascunho({ layoutId: salvo._id, nome: salvo.nome, origem: salvo.origem, dados: salvo.dados });
  }, [salvo, alterado]);

  // Sair da página com alteração pendente pergunta.
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const fotos: Record<string, Foto> = useMemo(
    () => ({ ...(salvo?.fotos ?? {}), ...fotosNovas }),
    [salvo, fotosNovas],
  );
  const comFoto = useMemo(
    () => new Set((rascunho?.dados.elementos ?? []).filter((e) => e.fotoId && fotos[e.fotoId]).map((e) => e.id)),
    [rascunho, fotos],
  );

  // ── Edição ───────────────────────────────────────────────────────────────
  const aplicar = (novo: DadosDoLayout, registrar = true) => {
    if (!rascunho) return;
    if (registrar) {
      setPassado((p) => [...p.slice(-49), rascunho.dados]);
      setFuturo([]);
    }
    setRascunho({ ...rascunho, dados: novo });
    setAlterado(true);
  };

  // Arrastar: o passo do "desfazer" é registrado no INÍCIO do arraste, para
  // um arraste inteiro desfazer de uma vez (e não 200 micro-passos).
  const inicioDoArraste = useRef<DadosDoLayout | null>(null);
  const mover = (alvo: Alvo, cx: number, cy: number) => {
    if (!rascunho) return;
    if (!inicioDoArraste.current) inicioDoArraste.current = rascunho.dados;
    aplicar(moverAlvo(rascunho.dados, alvo, cx, cy), false);
  };
  const fimDoArraste = () => {
    const antes = inicioDoArraste.current;
    inicioDoArraste.current = null;
    if (antes) {
      setPassado((p) => [...p.slice(-49), antes]);
      setFuturo([]);
    }
  };

  const desfazer = () => {
    if (!rascunho || passado.length === 0) return;
    setFuturo((f) => [rascunho.dados, ...f]);
    setRascunho({ ...rascunho, dados: passado[passado.length - 1] });
    setPassado((p) => p.slice(0, -1));
    setAlterado(true);
  };
  const refazer = () => {
    if (!rascunho || futuro.length === 0) return;
    setPassado((p) => [...p, rascunho.dados]);
    setRascunho({ ...rascunho, dados: futuro[0] });
    setFuturo((f) => f.slice(1));
    setAlterado(true);
  };

  const centro = () => {
    const d = rascunho!.dados;
    return { x: d.salao.largura / 2, y: d.salao.comprimento / 2 };
  };

  const adicionarPeca = (peca: PecaDaBiblioteca) => {
    if (!rascunho) return;
    const c = centro();
    const el = elementoDaPeca(peca, c.x, c.y);
    aplicar({ ...rascunho.dados, elementos: [...rascunho.dados.elementos, el] });
    setSelecionado({ tipo: "elemento", id: el.id });
    setBibliotecaAberta(false);
    setAba("2d");
  };

  const adicionarMesa = () => {
    if (!rascunho) return;
    const [p] = distribuirMesas(rascunho.dados, 1);
    const c = centro();
    const mesa = { id: novoIdLocal("m"), cx: p?.cx ?? c.x, cy: p?.cy ?? c.y };
    aplicar({ ...rascunho.dados, mesas: { ...rascunho.dados.mesas, posicoes: [...rascunho.dados.mesas.posicoes, mesa] } });
    setSelecionado({ tipo: "mesa", id: mesa.id });
    if (!p) toast.warning("Não há espaço livre: a mesa foi colocada no centro. Arraste para o lugar certo.");
  };

  const adicionarPilar = () => {
    if (!rascunho) return;
    const c = centro();
    const pilar = { id: novoIdLocal("p"), cx: c.x, cy: c.y, lado: 0.5 };
    aplicar({ ...rascunho.dados, pilares: [...rascunho.dados.pilares, pilar] });
    setSelecionado({ tipo: "pilar", id: pilar.id });
  };

  const removerSelecionado = () => {
    if (!rascunho || !selecionado) return;
    aplicar(removerAlvo(rascunho.dados, selecionado));
    setSelecionado(null);
  };

  const duplicarSelecionado = () => {
    if (!rascunho || !selecionado) return;
    const r = duplicarAlvo(rascunho.dados, selecionado);
    if (!r) return;
    aplicar(r.dados);
    setSelecionado(r.novo);
  };

  // Teclado: setas movem 10 cm, Delete remove, Ctrl+Z desfaz.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, [role=dialog], [role=combobox]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (!selecionado || !rascunho) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removerSelecionado();
        return;
      }
      const passo = e.shiftKey ? 0.5 : 0.1;
      const dx = e.key === "ArrowRight" ? passo : e.key === "ArrowLeft" ? -passo : 0;
      const dy = e.key === "ArrowUp" ? passo : e.key === "ArrowDown" ? -passo : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      const lista = selecionado.tipo === "mesa" ? rascunho.dados.mesas.posicoes : selecionado.tipo === "pilar" ? rascunho.dados.pilares : rascunho.dados.elementos;
      const item = lista.find((i) => i.id === selecionado.id);
      if (item) aplicar(moverAlvo(rascunho.dados, selecionado, item.cx + dx, item.cy + dy));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  // ── Gravação ─────────────────────────────────────────────────────────────
  const problemas = rascunho ? problemasDoLayout(rascunho.dados) : [];

  const gravar = async () => {
    if (!rascunho || gravando) return;
    if (problemas.length > 0) {
      toast.error(problemas[0]);
      return;
    }
    setGravando(true);
    try {
      if (rascunho.layoutId) {
        await salvar({ layoutId: rascunho.layoutId, nome: rascunho.nome, dados: rascunho.dados });
      } else {
        const novo = await criar({ eventId, nome: rascunho.nome, dados: rascunho.dados, origem: rascunho.origem });
        setRascunho({ ...rascunho, layoutId: novo });
        setLayoutId(novo);
      }
      setAlterado(false);
      setAvisos([]);
      toast.success("Layout salvo.");
    } catch (e) {
      toast.error(mensagemDe(e, "Não foi possível salvar o layout."));
    } finally {
      setGravando(false);
    }
  };

  const trocarLayout = (novo: Id<"eventLayouts">) => {
    if (alterado && !window.confirm("Há alterações não salvas neste layout. Trocar mesmo assim e perdê-las?")) return;
    setAlterado(false);
    setPassado([]);
    setFuturo([]);
    setSelecionado(null);
    setAvisos([]);
    setRascunho(null);
    setLayoutId(novo);
  };

  const novaOpcao = async () => {
    if (!rascunho?.layoutId) return;
    if (alterado) {
      toast.warning("Salve as alterações antes de duplicar este layout.");
      return;
    }
    try {
      const novo = await duplicar({ layoutId: rascunho.layoutId, eventIdDestino: eventId, nome: `${rascunho.nome} (opção B)` });
      trocarLayout(novo);
      toast.success("Nova opção criada a partir desta.");
    } catch (e) {
      toast.error(mensagemDe(e, "Não foi possível duplicar."));
    }
  };

  const confirmarExclusao = async () => {
    if (!rascunho) return;
    if (!rascunho.layoutId) {
      setRascunho(null);
      setAlterado(false);
      setExcluir(false);
      return;
    }
    try {
      await remover({ layoutId: rascunho.layoutId });
      setRascunho(null);
      setAlterado(false);
      setLayoutId(null);
      toast.success("Layout excluído. As fotos da Galeria continuam lá.");
    } catch (e) {
      toast.error(mensagemDe(e, "Não foi possível excluir."));
    } finally {
      setExcluir(false);
    }
  };

  const gerarPdf = async () => {
    if (!rascunho || !event) return;
    setGerandoPdf(true);
    try {
      const { generateLayoutPDF } = await import("@/lib/generate-layout-pdf.ts");
      const referencias = rascunho.dados.elementos
        .filter((e) => e.fotoId && fotos[e.fotoId])
        .map((e) => ({ rotulo: e.rotulo || "Referência", url: urlDeExibicao(fotos[e.fotoId!]) }))
        .filter((r): r is { rotulo: string; url: string } => !!r.url);
      await generateLayoutPDF({
        evento: { name: event.name },
        nomeDoLayout: rascunho.nome,
        dados: rascunho.dados,
        empresa: empresa ?? null,
        vista3d: abriu3d ? visao3d.current?.capturar() : null,
        referencias,
      });
      if (!abriu3d) toast.message("Dica: abra a aba 3D antes de gerar o PDF para incluir a vista 3D.");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (event === undefined || layouts === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }
  if (event === null) {
    return <p className="text-muted-foreground">Evento não encontrado.</p>;
  }

  const carregandoLayout = layoutId !== null && !rascunho;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to={`/eventos/${id}`}
          aria-label={`Voltar para ${event.name}`}
          title={`Voltar para ${event.name}`}
          className="-m-2 p-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">Layout do salão</h1>
          <p className="text-sm text-muted-foreground truncate">{event.name}</p>
        </div>
      </div>

      {layouts.length === 0 && !rascunho ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center space-y-3">
          <MapIcon className="size-10 mx-auto text-primary" />
          <h2 className="font-semibold">Monte o layout do salão em escala</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Planta 2D com mesas numeradas, vista 3D e PDF pronto para enviar aos clientes. Comece por um modelo, reaproveite o salão de outro evento ou deixe a IA ler o croqui.
          </p>
          <Button onClick={() => setNovoAberto(true)}><Plus className="size-4 mr-1.5" /> Criar layout</Button>
        </div>
      ) : (
        <>
          {/* Barra do layout */}
          <div className="flex flex-wrap items-center gap-2">
            {layouts.length > 0 && (
              <Select value={rascunho?.layoutId ?? layoutId ?? undefined} onValueChange={(v) => trocarLayout(v as Id<"eventLayouts">)}>
                <SelectTrigger className="w-56" aria-label="Escolher layout">
                  <SelectValue placeholder={rascunho && !rascunho.layoutId ? "Novo (não salvo)" : "Escolha um layout"} />
                </SelectTrigger>
                <SelectContent>
                  {layouts.map((l) => (
                    <SelectItem key={l._id} value={l._id}>{l.nome} · {l.mesas} mesas</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {rascunho && (
              <Input
                className="w-48 h-9"
                aria-label="Nome do layout"
                value={rascunho.nome}
                maxLength={80}
                onChange={(e) => {
                  setRascunho({ ...rascunho, nome: e.target.value });
                  setAlterado(true);
                }}
              />
            )}
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setNovoAberto(true)}><Plus className="size-4 mr-1" /> Novo</Button>
              {rascunho?.layoutId && (
                <Button variant="outline" size="sm" onClick={novaOpcao}><Copy className="size-4 mr-1" /> Nova opção</Button>
              )}
              {rascunho && (
                <>
                  <Button variant="outline" size="sm" disabled={gerandoPdf} onClick={gerarPdf}>
                    {gerandoPdf ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileDown className="size-4 mr-1" />} PDF para os clientes
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setExcluir(true)}>
                    <Trash2 className="size-4 mr-1" /> Excluir
                  </Button>
                  <Button size="sm" disabled={gravando || (!alterado && !!rascunho.layoutId)} onClick={gravar}>
                    {gravando ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
                    {alterado || !rascunho.layoutId ? "Salvar" : "Salvo"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {avisos.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm space-y-1">
              <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="size-4" /> Confira antes de salvar</p>
              {avisos.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          )}
          {problemas.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm">
              {problemas.slice(0, 3).join(" ")}
            </div>
          )}

          {carregandoLayout || !rascunho ? (
            <Skeleton className="h-[60vh] w-full" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-border">
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button type="button" onClick={() => setAba("2d")}
                      className={cn("px-3 py-1.5 text-sm", aba === "2d" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                      Planta 2D
                    </button>
                    <button type="button" onClick={() => { setAba("3d"); setAbriu3d(true); }}
                      className={cn("px-3 py-1.5 text-sm flex items-center gap-1", aba === "3d" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                      <Box className="size-3.5" /> 3D
                    </button>
                  </div>
                  {aba === "2d" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setBibliotecaAberta(true)}><Square className="size-4 mr-1" /> Peça</Button>
                      <Button size="sm" variant="ghost" onClick={adicionarMesa}><Circle className="size-4 mr-1" /> Mesa</Button>
                      <Button size="sm" variant="ghost" onClick={adicionarPilar}><Grid3x3 className="size-4 mr-1" /> Pilar</Button>
                      <Button size="sm" variant="ghost" onClick={() => aplicar(renumerarMesas(rascunho.dados))}>
                        <ListOrdered className="size-4 mr-1" /> Renumerar
                      </Button>
                      <div className="ml-auto flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Desfazer" disabled={passado.length === 0} onClick={desfazer}><Undo2 className="size-4" /></Button>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Refazer" disabled={futuro.length === 0} onClick={refazer}><Redo2 className="size-4" /></Button>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Diminuir zoom" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><Minus className="size-4" /></Button>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Aumentar zoom" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}><Plus className="size-4" /></Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {(["perspectiva", "cima", "entrada", "palco"] as const).map((v) => (
                        <Button key={v} size="sm" variant="ghost" onClick={() => visao3d.current?.irPara(v)}>
                          {v === "perspectiva" ? "Perspectiva" : v === "cima" ? "De cima" : v === "entrada" ? "Da entrada" : "Do palco"}
                        </Button>
                      ))}
                      <div className="ml-auto flex items-center gap-2 pr-1">
                        <Switch id="paredes-3d" checked={paredes} onCheckedChange={setParedes} />
                        <Label htmlFor="paredes-3d" className="text-xs">Paredes</Label>
                      </div>
                    </>
                  )}
                </div>
                <div className="relative h-[62vh] min-h-[380px]">
                  <div className={cn("absolute inset-0 p-2", aba !== "2d" && "invisible")}>
                    <Planta2D
                      dados={rascunho.dados}
                      selecionado={selecionado}
                      onSelecionar={setSelecionado}
                      onMover={mover}
                      onFimDoArraste={fimDoArraste}
                      destaque={destaque}
                      comFoto={comFoto}
                      zoom={zoom}
                    />
                  </div>
                  {abriu3d && (
                    <div className={cn("absolute inset-0", aba !== "3d" && "invisible")}>
                      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin mr-2" /> Montando o 3D…</div>}>
                        <Visao3D ref={visao3d} dados={rascunho.dados} destaque={destaque} mostrarParedes={paredes} />
                      </Suspense>
                    </div>
                  )}
                </div>
                <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  {aba === "2d"
                    ? "Arraste peças e mesas para mover. Arraste o fundo para navegar. No computador: setas movem 10 cm, Delete remove."
                    : "Arraste para girar, pinça ou roda do mouse para aproximar, dois dedos para mover."}
                </p>
              </div>

              <div className="bg-card rounded-xl border border-border p-4 h-fit">
                <PainelPropriedades
                  eventId={eventId}
                  dados={rascunho.dados}
                  selecionado={selecionado}
                  fotos={fotos}
                  onAlterar={(d) => aplicar(d)}
                  onSelecionar={setSelecionado}
                  onRemover={removerSelecionado}
                  onDuplicar={duplicarSelecionado}
                  onFotoEscolhida={(fid, f) => setFotosNovas((x) => ({ ...x, [fid]: f }))}
                />
              </div>
            </div>
          )}
        </>
      )}

      <NovoLayoutDialog
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        eventId={eventId}
        onRascunho={(r) => {
          if (alterado && !window.confirm("Há alterações não salvas no layout aberto. Abrir o novo mesmo assim?")) return;
          setNovoAberto(false);
          setLayoutId(null);
          setRascunho({ nome: r.nome, origem: r.origem, dados: r.dados });
          setAlterado(true);
          setPassado([]);
          setFuturo([]);
          setSelecionado(null);
          setAvisos(r.avisos ?? []);
          toast.success("Rascunho aberto no editor. Ajuste e salve.");
        }}
        onCopiado={(novo) => {
          setNovoAberto(false);
          trocarLayout(novo);
          toast.success("Layout copiado para este evento.");
        }}
      />

      <BibliotecaDialog aberto={bibliotecaAberta} onFechar={() => setBibliotecaAberta(false)} onEscolher={adicionarPeca} />

      <AlertDialog open={excluir} onOpenChange={setExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este layout?</AlertDialogTitle>
            <AlertDialogDescription>
              {rascunho?.layoutId
                ? `"${rascunho.nome}" sai deste evento e não volta. As fotos de referência continuam na Galeria.`
                : "O rascunho ainda não foi salvo e será descartado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
