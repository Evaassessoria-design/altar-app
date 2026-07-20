import { useParams, Link } from "react-router-dom";
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
  Loader2,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
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
  const photos = useQuery(
    api.gallery.listPhotos,
    activeTab === "all"
      ? { eventId }
      : { eventId, category: activeTab },
  );

  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl);
  const savePhoto = useMutation(api.gallery.savePhoto);
  const deletePhoto = useMutation(api.gallery.deletePhoto);
  const updatePhoto = useMutation(api.gallery.updatePhoto);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<Category>("evento");
  const [uploadQueue, setUploadQueue] = useState<string[]>([]); // filenames being uploaded
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"eventPhotos"> | null>(null);
  const [editingCaption, setEditingCaption] = useState<Id<"eventPhotos"> | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!arr.length) return;
      setUploading(true);
      setUploadQueue(arr.map((f) => f.name));

      for (const file of arr) {
        try {
          const uploadUrl = await generateUploadUrl();
          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
          await savePhoto({
            eventId,
            storageId,
            filename: file.name,
            category: uploadCategory,
          });
          setUploadQueue((q) => q.filter((n) => n !== file.name));
        } catch (e) {
          if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
          else toast.error(`Erro ao enviar ${file.name}`);
          setUploadQueue((q) => q.filter((n) => n !== file.name));
        }
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success(`${arr.length} foto${arr.length > 1 ? "s" : ""} adicionada${arr.length > 1 ? "s" : ""}!`);
    },
    [eventId, generateUploadUrl, savePhoto, uploadCategory],
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
      await updatePhoto({ id: photoId, caption: captionText || undefined });
      toast.success("Legenda salva!");
    } catch {
      toast.error("Erro ao salvar legenda");
    } finally {
      setEditingCaption(null);
    }
  };

  const photoList = photos ?? [];
  const lightboxPhoto = lightboxIndex !== null ? photoList[lightboxIndex] : null;

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

          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="cursor-pointer gap-1.5"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? `Enviando ${uploadQueue.length} foto${uploadQueue.length !== 1 ? "s" : ""}...` : "Selecionar Fotos"}
          </Button>
        </div>
      </motion.div>

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

      {/* Photo grid */}
      {photos === undefined ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : photoList.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Images className="size-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma foto nesta categoria.</p>
          <p className="text-xs mt-1">Use a área de upload acima para adicionar fotos.</p>
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
                  <img
                    src={photo.url ?? undefined}
                    alt={photo.caption ?? photo.filename}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Category badge */}
                  <div className={cn("absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold", cat.color)}>
                    {cat.label}
                  </div>
                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 gap-1">
                    {photo.caption && (
                      <p className="flex-1 text-white text-xs line-clamp-2">{photo.caption}</p>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCaption(photo._id); setCaptionText(photo.caption ?? ""); }}
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
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
              onClick={() => setLightboxIndex(null)}
            >
              <X className="size-5" />
            </button>

            {/* Nav prev */}
            {lightboxIndex > 0 && (
              <button
                className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i ?? 1) - 1); }}
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {/* Nav next */}
            {lightboxIndex < photoList.length - 1 && (
              <button
                className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
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
              <h3 className="font-semibold">Editar Legenda</h3>
              <input
                type="text"
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Ex: Mesa dos noivos, detalhe das flores..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => { if (e.key === "Enter") void handleSaveCaption(editingCaption); }}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingCaption(null)} className="cursor-pointer">
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
