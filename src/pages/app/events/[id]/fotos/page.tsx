import { useParams, useSearchParams, Link } from "react-router-dom";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { gerarPreview, urlDeExibicao } from "@/lib/imagem-reduzida.ts";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  ArrowLeft,
  Upload,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Images,
  Download,
  Pencil,
  Check,
  Loader2, Camera, Star,} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
import {
  AVISO_REFERENCIA,
  PROJECT_SCOPES,
  scopeMeta,
  type ProjectScope,
} from "@/lib/photo-scope.ts";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { AcervoDeFotos } from "@/components/projeto/acervo-de-fotos.tsx";

type Category = "antes" | "montagem" | "evento" | "desmontagem";

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: "antes", label: "Antes", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "montagem", label: "Montagem", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "evento", label: "Evento", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "desmontagem", label: "Desmontagem", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

function categoryMeta(cat: Category) {
  return CATEGORIES.find((c) => c.value === cat)!;
}

export default function GaleriaPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;

  const event = useQuery(api.events.get, { id: eventId });
  const photoCounts = useQuery(api.gallery.getPhotoCounts, { eventId });

  const [activeTab, setActiveTab] = useState<Category | "all">("all");
  /**
   * Filtro por ambiente. `null` = todos.
   *
   * Mora na URL, não em `useState`, para que o Projeto Visual consiga mandar
   * a decoradora direto ao recorte certo: clicar em "+12 na Galeria" no bloco
   * do Jardim das oliveiras abre a galeria JÁ filtrada nele, em vez de largar
   * setenta fotos na tela para ela procurar.
   *
   * Nenhuma classificação acontece aqui — a Galeria continua sendo o único
   * lugar que edita foto. Isto é só o endereço de onde ela precisa chegar.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const ambienteFiltro = searchParams.get("ambiente")?.trim() || null;
  const setAmbienteFiltro = useCallback(
    (valor: string | null) => {
      setSearchParams(
        (atual) => {
          const proximo = new URLSearchParams(atual);
          if (valor) proximo.set("ambiente", valor);
          else proximo.delete("ambiente");
          return proximo;
        },
        // Filtrar não é navegar: o botão "voltar" tem de sair da galeria, não
        // desfazer sete cliques de filtro.
        { replace: true },
      );
    },
    [setSearchParams],
  );
  // Uma consulta SEM filtro de ambiente, só para saber quais ambientes
  // existem — ela alimenta as sugestões e os botões de filtro, e não pode
  // encolher quando o filtro está ligado (senão o botão some ao ser usado).
  const todasAsFotos = useQuery(api.gallery.listPhotos, { eventId });
  const photos = useQuery(api.gallery.listPhotos, {
    eventId,
    ...(activeTab === "all" ? {} : { category: activeTab }),
    ...(ambienteFiltro ? { ambiente: ambienteFiltro } : {}),
  });

  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl);
  const savePhoto = useMutation(api.gallery.savePhoto);
  const deletePhoto = useMutation(api.gallery.deletePhoto);
  const updatePhoto = useMutation(api.gallery.updatePhoto);
  const atualizarEvento = useMutation(api.events.update);
  const reaproveitar = useMutation(api.gallery.reaproveitar);
  const [abrindoAcervo, setAbrindoAcervo] = useState(false);
  const [trazendo, setTrazendo] = useState(false);

  /**
   * Traz uma foto de outro evento para a pasta deste.
   *
   * Ela nasce como "antes" e SEM classificação — escopo é decisão comercial
   * sobre ESTE projeto, e herdar "contratado" de outro casamento afirmaria
   * que a cliente de hoje comprou aquilo. Quem decide isso é ela, aqui.
   */
  const trazerDoAcervo = async (photoId: Id<"eventPhotos">) => {
    setTrazendo(true);
    try {
      await reaproveitar({ photoId, paraEventoId: eventId });
      toast.success("Foto trazida para este evento.");
      setAbrindoAcervo(false);
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível trazer esta foto.",
      );
    } finally {
      setTrazendo(false);
    }
  };

  /**
   * A capa do Projeto Visual.
   *
   * Vive AQUI, e não no Projeto, porque é aqui que ela olha foto por foto —
   * é o momento em que dá para decidir qual abre o casamento. O Projeto
   * continua sendo só leitura: esta é a única tela que escreve foto.
   *
   * Ação imediata, fora do formulário de legenda: misturar uma escrita em
   * `events` com o "Salvar" que grava em `eventPhotos` deixaria metade salva
   * se a outra metade falhasse.
   */
  const capaAtual = event?.coverPhotoId ?? null;
  const definirCapa = async (photoId: Id<"eventPhotos"> | null) => {
    try {
      // `null` REMOVE. `undefined` sumiria no transporte e a capa ficaria.
      await atualizarEvento({ id: eventId, coverPhotoId: photoId });
      toast.success(photoId ? "Capa do projeto definida." : "Capa removida.");
    } catch {
      toast.error("Não foi possível alterar a capa.");
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<Category>("evento");
  const [uploadQueue, setUploadQueue] = useState<string[]>([]); // filenames being uploaded
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"eventPhotos"> | null>(null);
  const [editingCaption, setEditingCaption] = useState<Id<"eventPhotos"> | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [scopeValue, setScopeValue] = useState<ProjectScope | null>(null);
  /** "Só para mim" — `eventPhotos.visibility === "interno"`. */
  const [soParaMim, setSoParaMim] = useState(false);
  const [ambienteTexto, setAmbienteTexto] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);

  const { enviar } = useEnvioDeArquivo(generateUploadUrl, {
    tipo: "imagem",
    aceitos: ["image/"],
  });

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!arr.length) return;
      setUploading(true);
      setUploadQueue(arr.map((f) => f.name));

      let enviadas = 0;
      for (const file of arr) {
        const r = await enviar(file);
        if (!r.ok) {
          toast.error(r.motivo);
          setUploadQueue((q) => q.filter((n) => n !== file.name));
          continue;
        }
        // ── A VERSÃO LEVE ────────────────────────────────────────────
        // Gerada DEPOIS que o original já está guardado: a foto dela nunca
        // depende disto dar certo. `null` é resultado legítimo (HEIC que o
        // navegador não decodifica, imagem já pequena) e o envio segue.
        //
        // Sequencial, e não em paralelo, porque `useEnvioDeArquivo` tem trava
        // de envio em curso — é a mesma trava que impede o clique duplo.
        let previewStorageId: Id<"_storage"> | undefined;
        const preview = await gerarPreview(file);
        if (preview) {
          const p = await enviar(preview);
          if (p.ok) previewStorageId = p.storageId;
        }

        try {
          await savePhoto({
            eventId,
            storageId: r.storageId,
            previewStorageId,
            filename: file.name,
            category: uploadCategory,
          });
          enviadas++;
        } catch (e) {
          toast.error(
            e instanceof ConvexError
              ? (e.data as { message: string }).message
              : `Erro ao salvar ${file.name}`,
          );
        } finally {
          setUploadQueue((q) => q.filter((n) => n !== file.name));
        }
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Contagem REAL. Antes o "N fotos adicionadas!" saia sempre, mesmo com
      // todas falhando — a pessoa fechava a tela achando que tinha subido.
      if (enviadas > 0) {
        toast.success(`${enviadas} foto${enviadas > 1 ? "s" : ""} adicionada${enviadas > 1 ? "s" : ""}!`);
      }
    },
    [eventId, enviar, savePhoto, uploadCategory],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deletePhoto({ id: deletingId });
      toast.success("Foto removida.");
      if (lightboxIndex !== null) setLightboxIndex(null);
    } catch {
      toast.error("Erro ao remover foto");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveCaption = async (photoId: Id<"eventPhotos">) => {
    try {
      await updatePhoto({
        id: photoId,
        caption: captionText || undefined,
        projectScope: scopeValue ?? undefined,
        // String vazia LIMPA o ambiente. `undefined` não mexeria, e aí tirar
        // uma foto do ambiente errado seria impossível.
        ambiente: ambienteTexto.trim(),
        // `null` LIMPA a marcação, pelo mesmo motivo: `undefined` some no
        // transporte e desmarcar "só para mim" seria impossível.
        visibility: soParaMim ? "interno" : null,
      });
      toast.success("Foto classificada.");
      // Fecha SO no sucesso. Fechando no `finally`, uma falha de rede levava
      // junto o texto que a pessoa acabou de escrever — e o aviso de erro
      // aparecia num editor que ja tinha sumido, sem nada para tentar de novo.
      setEditingCaption(null);
    } catch {
      toast.error("Erro ao salvar legenda. O texto continua aqui — tente de novo.");
    }
  };

  /** Os ambientes que esta decoradora já usou NESTE evento, em ordem. */
  const ambientesUsados = [
    ...new Set(
      (todasAsFotos ?? [])
        .map((p) => (p.ambiente ?? "").trim())
        .filter((a) => a.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const photoList = photos ?? [];
  const lightboxPhoto = lightboxIndex !== null ? photoList[lightboxIndex] : null;

  /**
   * Esc fecha, seta anda.
   *
   * ── O DEFEITO ─────────────────────────────────────────────────────────────
   * O visualizador é uma sobreposição feita à mão, não um `Dialog` — então não
   * herdou nada do que o Radix dá de graça. Abrir uma foto no notebook e
   * apertar Esc não fazia nada: era preciso achar o X, que é o reflexo que
   * ninguém tem quando a foto ocupa a tela inteira.
   *
   * As setas vêm junto porque uma galeria de trinta fotos de montagem é lida
   * seguidamente, e clicar em cada seta com o mouse é o que faz desistir na
   * décima.
   */
  useEffect(() => {
    if (lightboxIndex === null) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i !== null && i < photoList.length - 1 ? i + 1 : i));
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [lightboxIndex, photoList.length]);

  const tabCounts = {
    all: photoCounts?.total ?? 0,
    antes: photoCounts?.antes ?? 0,
    montagem: photoCounts?.montagem ?? 0,
    evento: photoCounts?.evento ?? 0,
    desmontagem: photoCounts?.desmontagem ?? 0,
  };

  if (event === undefined || photoCounts === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="size-4" /> {event?.name ?? "Evento"}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Images className="size-5 text-primary" /> Galeria de Fotos
          </h1>
          <p className="text-sm text-muted-foreground">{photoCounts.total} foto{photoCounts.total !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Upload zone */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          draggingOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-accent/30",
        )}
        onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
        />
        {/* Camera em input SEPARADO, de proposito.
            `capture` no input de cima nao adicionaria a camera: ele SUBSTITUI o
            seletor de arquivos por ela na maioria dos navegadores de celular —
            quem quisesse mandar uma foto que ja tem na galeria perderia o
            caminho. Dois botoes mantem as duas portas abertas, e no computador
            este aqui simplesmente abre o seletor comum. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
        />
        <div className="space-y-3">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Upload className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Arraste fotos aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP · múltiplos arquivos</p>
          </div>

          {/* Category selector */}
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setUploadCategory(cat.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border",
                  uploadCategory === cat.value
                    ? `${cat.color} border-current`
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Enviando como: <strong>{categoryMeta(uploadCategory).label}</strong>
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {/* Tirar foto vem PRIMEIRO: no galpao, durante a montagem, e o que
                se faz. Escolher da galeria e o caso de escritorio. */}
            <Button
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer gap-1.5 min-h-11"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {uploading ? `Enviando ${uploadQueue.length}...` : "Tirar foto"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer gap-1.5 min-h-11"
            >
              <Upload className="size-4" />
              Escolher arquivos
            </Button>
            {/* ── A TERCEIRA PORTA ────────────────────────────────────────
                "Já fiz esse arco em 2024" era uma frase que o produto não
                sabia ouvir: a Galeria só respondia pelo evento aberto, e
                cinco anos de trabalho ficavam em álbuns lacrados.

                Trazer do acervo NÃO envia nada: cria uma linha neste evento
                apontando para o mesmo arquivo. A conta de storage não cresce
                e o 4G do galpão não é usado para reenviar o que já está lá. */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAbrindoAcervo(true)}
              disabled={uploading}
              className="cursor-pointer gap-1.5 min-h-11"
            >
              <Images className="size-4" />
              Meu acervo
            </Button>
          </div>
        </div>
      </motion.div>

      {abrindoAcervo && (
        <Dialog open onOpenChange={(o) => !o && !trazendo && setAbrindoAcervo(false)}>
          {/* `svh` e não `vh`: no Safari do iPhone a barra de endereço faz
              `vh` prometer uma altura que a tela não tem, e o rodapé do
              diálogo fica embaixo do navegador. */}
          <DialogContent className="max-w-2xl max-h-[85svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Meu acervo de fotos</DialogTitle>
              <DialogDescription>
                As imagens dos seus outros eventos. Trazer uma para cá não envia arquivo
                nenhum — é o mesmo arquivo, com uma classificação própria daqui.
              </DialogDescription>
            </DialogHeader>
            <AcervoDeFotos
              excetoEventoId={eventId}
              ocupado={trazendo}
              onEscolher={(photoId) => void trazerDoAcervo(photoId)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {(["all", "antes", "montagem", "evento", "desmontagem"] as const).map((tab) => {
          const labels = { all: "Todas", antes: "Antes", montagem: "Montagem", evento: "Evento", desmontagem: "Desmontagem" };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {labels[tab]}
              <span className="ml-1.5 opacity-70">{tabCounts[tab]}</span>
            </button>
          );
        })}
      </div>

      {/* ── FILTRO POR AMBIENTE ────────────────────────────────────────────
          Só aparece quando há ambiente classificado: numa conta que ainda não
          usa o campo, uma fileira vazia de botões seria ruído.

          As abas de cima respondem QUANDO a foto foi tirada. Esta responde DE
          QUE PARTE DO EVENTO ela é — e é a pergunta do galpão, com o celular
          na mão: "quais são as referências da mesa do bolo?". */}
      {ambientesUsados.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setAmbienteFiltro(null)}
            className={cn(
              "flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
              ambienteFiltro === null
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            Todos os ambientes
          </button>
          {ambientesUsados.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmbienteFiltro(a)}
              className={cn(
                "flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
                ambienteFiltro === a
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {photos === undefined ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : photoList.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Images className="size-10 mx-auto mb-3 opacity-30" />
          {/* Diz QUAL recorte está vazio, e oferece a saída: "nenhuma foto
              nesta categoria" com um filtro de ambiente ligado manda procurar
              no lugar errado. */}
          {ambienteFiltro ? (
            <>
              <p>Nenhuma foto em “{ambienteFiltro}” neste recorte.</p>
              <button
                type="button"
                onClick={() => setAmbienteFiltro(null)}
                className="mt-2 cursor-pointer text-xs text-primary hover:underline"
              >
                Ver todos os ambientes
              </button>
            </>
          ) : (
            <>
              <p>Nenhuma foto nesta categoria.</p>
              <p className="text-xs mt-1">Use a área de upload acima para adicionar fotos.</p>
            </>
          )}
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
        >
          <AnimatePresence>
            {photoList.map((photo, idx) => {
              const cat = categoryMeta(photo.category);
              return (
                <motion.div
                  key={photo._id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="relative group rounded-xl overflow-hidden bg-muted aspect-square cursor-pointer"
                  onClick={() => setLightboxIndex(idx)}
                >
                  {/* A grade desenha um quadrado de ~138 px no telefone.
                      Baixar o ORIGINAL para isso era o defeito: até 15 MB por
                      célula. `urlDeExibicao` prefere a versão leve e cai no
                      original quando a foto é antiga. */}
                  <img
                    src={urlDeExibicao(photo) ?? undefined}
                    alt={photo.caption ?? photo.filename}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                  {/* Category badge — a FASE em que a foto foi tirada. */}
                  <div className={cn("absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold", cat.color)}>
                    {cat.label}
                  </div>
                  {/* Qual é a capa — a pergunta "e agora, qual delas eu
                      escolhi?" não pode exigir abrir uma por uma. */}
                  {capaAtual === photo._id && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background">
                      <Star className="size-3 fill-current" />
                      Capa
                    </div>
                  )}
                  {/* O que a imagem significa no projeto. Eixo separado da
                      fase: inspiração nunca pode passar por contratação. */}
                  {scopeMeta(photo.projectScope) && (
                    <div
                      className={cn(
                        "absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-semibold",
                        scopeMeta(photo.projectScope)!.classe,
                      )}
                    >
                      {scopeMeta(photo.projectScope)!.label}
                    </div>
                  )}
                  {/* Marcar e não conseguir ver o que está marcado obrigaria a
                      abrir foto por foto para saber o que sai no documento —
                      exatamente a conferência que o selo existe para poupar.
                      Fica embaixo à esquerda: os outros dois cantos já são da
                      capa e da classificação. */}
                  {photo.visibility === "interno" && (
                    <div className="absolute bottom-2 left-2 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-background">
                      Só para mim
                    </div>
                  )}
                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 gap-1">
                    {photo.caption && (
                      <p className="flex-1 text-white text-xs line-clamp-2">{photo.caption}</p>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCaption(photo._id); setCaptionText(photo.caption ?? ""); setScopeValue((photo.projectScope as ProjectScope | undefined) ?? null); setAmbienteTexto(photo.ambiente ?? ""); setSoParaMim(photo.visibility === "interno"); }}
                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                        title="Editar legenda"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(photo._id); }}
                        className="p-1.5 rounded-lg bg-red-500/70 hover:bg-red-500 text-white transition-colors cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && lightboxPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Close */}
            {/* Os três botões do visualizador eram só ícone, sem nome: o
                leitor de tela anunciava "botão, botão, botão". */}
            <button
              type="button"
              aria-label="Fechar foto"
              className="absolute top-4 right-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 z-10"
              onClick={() => setLightboxIndex(null)}
            >
              <X className="size-5" />
            </button>

            {/* Nav prev */}
            {lightboxIndex > 0 && (
              <button
                type="button"
                aria-label="Foto anterior"
                className="absolute left-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 z-10"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i ?? 1) - 1); }}
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {/* Nav next */}
            {lightboxIndex < photoList.length - 1 && (
              <button
                type="button"
                aria-label="Próxima foto"
                className="absolute right-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 z-10"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i ?? 0) + 1); }}
              >
                <ChevronRight className="size-6" />
              </button>
            )}

            <motion.div
              key={lightboxIndex}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-4xl max-h-[85vh] w-full flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                // ── AQUI É O ORIGINAL, DE PROPÓSITO ────────────────────
                // Tela cheia é o momento em que ela AMPLIA para decidir um
                // detalhe — o acabamento do arranjo, se a vela está torta.
                // Uma imagem por vez, escolhida com intenção: é exatamente
                // onde o arquivo inteiro se justifica. O download ao lado
                // também leva o original, que é o que ela enviou.
                src={lightboxPhoto.url ?? undefined}
                alt={lightboxPhoto.caption ?? lightboxPhoto.filename}
                className="max-h-[75vh] max-w-full rounded-xl object-contain"
              />
              {/* Info bar */}
              <div className="flex items-center gap-3 text-sm text-white/80 flex-wrap justify-center">
                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", categoryMeta(lightboxPhoto.category).color)}>
                  {categoryMeta(lightboxPhoto.category).label}
                </span>
                {lightboxPhoto.caption && <span>{lightboxPhoto.caption}</span>}
                <span className="text-white/40 text-xs">
                  {lightboxIndex + 1} / {photoList.length}
                </span>
                <a
                  href={lightboxPhoto.url ?? "#"}
                  download={lightboxPhoto.filename}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                  title="Download"
                >
                  <Download className="size-4" />
                </a>
                <button
                  onClick={() => { setDeletingId(lightboxPhoto._id); setLightboxIndex(null); }}
                  className="p-1.5 rounded-lg bg-red-500/50 hover:bg-red-500/80 transition-colors cursor-pointer"
                  title="Remover"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit caption dialog */}
      <AnimatePresence>
        {editingCaption && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setEditingCaption(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-xl border border-border p-5 w-full max-w-sm space-y-4"
            >
              <h3 className="font-semibold">Legenda e classificação</h3>
              <input
                type="text"
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Ex: Mesa principal, detalhe do arranjo, lounge montado..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => { if (e.key === "Enter") void handleSaveCaption(editingCaption); }}
                autoFocus
              />

              {/* O que esta imagem significa no projeto. Fica junto da legenda
                  porque é a hora em que a decoradora está descrevendo a foto. */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Classificação</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScopeValue(null)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer",
                      scopeValue === null
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    Sem classificação
                  </button>
                  {PROJECT_SCOPES.map((sc) => (
                    <button
                      key={sc.value}
                      type="button"
                      onClick={() => setScopeValue(sc.value)}
                      title={sc.detalhe}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer",
                        scopeValue === sc.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                {scopeValue === "referencia" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {AVISO_REFERENCIA}. Aparecerá marcada assim para não ser confundida com
                    item contratado.
                  </p>
                )}

                {/* ── SÓ PARA MIM ───────────────────────────────────────────
                    O eixo que faltava. "Classificação" responde o que a foto
                    É no projeto; isto responde QUEM pode vê-la.

                    Antes, a única forma de esconder a foto do problema — o
                    fornecedor mandou a cor errada, a peça chegou torta — era
                    não guardá-la, ou mentir sobre a fase dela. Ela é tirada
                    antes do evento, como toda referência, e ia junto no PDF
                    que leva o nome da empresa no rodapé.

                    Caixa, e não uma terceira fileira de pílulas: a pergunta é
                    de sim ou não, e mais uma fileira aqui embaralharia os
                    dois eixos que a tela acabou de separar. */}
                <label className="flex cursor-pointer items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={soParaMim}
                    onChange={(e) => setSoParaMim(e.target.checked)}
                    className="mt-0.5 size-4 cursor-pointer accent-primary"
                  />
                  <span className="text-xs">
                    Só para mim
                    <span className="block text-muted-foreground">
                      Fica na galeria e no evento, e não entra no projeto nem nos
                      documentos que vão para a cliente.
                    </span>
                  </span>
                </label>
              </div>

              {/* ── O AMBIENTE ────────────────────────────────────────────
                  O campo existia no schema e não tinha nenhuma tela: setenta
                  fotos de um casamento moravam todas em "antes", e "quais são
                  as referências da mesa do bolo?" não tinha resposta.

                  Texto livre, e não lista fechada, porque o vocabulário é
                  dela: "mesa do bolo" numa empresa é "mesa de doces" na
                  outra, e um evento traz "capela" que nenhuma lista previu.
                  Os ambientes já usados viram sugestão. */}
              <div className="space-y-1.5">
                <label htmlFor="foto-ambiente" className="text-xs font-medium">
                  Ambiente
                </label>
                <input
                  id="foto-ambiente"
                  type="text"
                  list="ambientes-do-evento"
                  value={ambienteTexto}
                  onChange={(e) => setAmbienteTexto(e.target.value)}
                  placeholder="Mesa do bolo, cerimônia, lounge, bar..."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="ambientes-do-evento">
                  {ambientesUsados.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>

              {/* ── A CAPA DO PROJETO ─────────────────────────────────────
                  Ação imediata, com confirmação própria — não entra no
                  "Salvar" abaixo, que grava na FOTO. Esta grava no EVENTO,
                  e uma falha de um lado não pode deixar o outro pela metade.

                  Uma capa por evento: escolher outra substitui, e é por isso
                  que não há "desmarcar" além do botão explícito. */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Capa do projeto</p>
                  <p className="text-[11px] text-muted-foreground">
                    {capaAtual === editingCaption
                      ? "Esta foto abre o Projeto Visual."
                      : "Abre o Projeto Visual no lugar do título."}
                  </p>
                </div>
                {capaAtual === editingCaption ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void definirCapa(null)}
                    className="flex-shrink-0 cursor-pointer"
                  >
                    Remover capa
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void definirCapa(editingCaption)}
                    className="flex-shrink-0 cursor-pointer gap-1.5"
                  >
                    <Star className="size-3.5" />
                    Usar como capa
                  </Button>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingCaption(null)} className="cursor-pointer" aria-label="Cancelar">
                  <X className="size-4" />
                </Button>
                <Button size="sm" onClick={() => void handleSaveCaption(editingCaption)} className="cursor-pointer gap-1.5">
                  <Check className="size-4" /> Salvar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover foto?</AlertDialogTitle>
            <AlertDialogDescription>A foto será excluída permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
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
