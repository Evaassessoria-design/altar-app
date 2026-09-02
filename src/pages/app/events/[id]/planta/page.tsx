import { useState, useRef } from "react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import { useParams, Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ArrowLeft,
  Upload,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  History,
  Wand2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// IA VISUAL — Planta Premium.
// Fluxo: upload → interpretação → revisão → confirmação → geração → histórico.
// Nada é gerado sem a decoradora confirmar a leitura, e a interpretação é
// totalmente editável antes disso (mesmo padrão do import de contrato).
//
// Esta tela não conhece provedor nem modelo de imagem: só pergunta ao backend
// se existe provedor configurado no ambiente.
// ─────────────────────────────────────────────────────────────────────────────

type Element = { tipo: string; quantidade: number; observacao?: string };
type Interpretation = {
  ambientes: string[];
  elementos: Element[];
  circulacao?: string;
  acessos?: string;
  observacoes?: string;
};

type Sketch = { storageId: Id<"_storage">; filename: string; previewUrl: string };

export default function PlantaPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;

  const event = useQuery(api.events.get, { id: eventId });
  const renders = useQuery(api.layoutRenders.listByEvent, { eventId });
  const providerStatus = useQuery(api.layoutRenders.providerStatus);

  const generateUploadUrl = useMutation(api.layoutRenders.generateUploadUrl);
  const interpretSketch = useAction(api.aiVisual.interpretSketch);
  const generatePlan = useAction(api.aiVisual.generatePremiumPlan);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [uploading, setUploading] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [corrections, setCorrections] = useState("");

  const providerReady = providerStatus?.configured === true;

  // ── Upload do croqui (o arquivo original é preservado no storage) ──────────
  const handleUpload = async (file: File) => {
    setUploading(true);
    setInterpretation(null);
    setCorrections("");
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setSketch({
        storageId,
        filename: file.name,
        previewUrl: URL.createObjectURL(file),
      });
      toast.success("Croqui enviado. Agora interprete com a IA.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Erro ao enviar o croqui.",
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Interpretação (somente leitura — não grava nada) ───────────────────────
  const handleInterpret = async () => {
    if (!sketch) return;
    setInterpreting(true);
    try {
      const result = await interpretSketch({ eventId, storageId: sketch.storageId });
      setInterpretation(result);
      if (result.elementos.length === 0) {
        toast.warning("A IA não identificou elementos. Você pode preenchê-los manualmente.");
      } else {
        toast.success("Croqui interpretado. Confira as quantidades antes de gerar.");
      }
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível interpretar o croqui.",
      );
    } finally {
      setInterpreting(false);
    }
  };

  // ── Geração da planta premium (só após confirmação) ────────────────────────
  const handleGenerate = async () => {
    if (!sketch || !interpretation) return;
    setGenerating(true);
    try {
      await generatePlan({
        eventId,
        storageId: sketch.storageId,
        filename: sketch.filename,
        interpretation,
        corrections: corrections.trim() || undefined,
      });
      toast.success("Planta premium gerada! Veja no histórico abaixo.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Erro ao gerar a planta premium.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // ── Edição da interpretação ───────────────────────────────────────────────
  const patchInterpretation = (patch: Partial<Interpretation>) =>
    setInterpretation((prev) => (prev ? { ...prev, ...patch } : prev));

  const patchElement = (index: number, patch: Partial<Element>) =>
    setInterpretation((prev) =>
      prev
        ? {
            ...prev,
            elementos: prev.elementos.map((el, i) => (i === index ? { ...el, ...patch } : el)),
          }
        : prev,
    );

  const addElement = () =>
    setInterpretation((prev) =>
      prev ? { ...prev, elementos: [...prev.elementos, { tipo: "", quantidade: 0 }] } : prev,
    );

  const removeElement = (index: number) =>
    setInterpretation((prev) =>
      prev ? { ...prev, elementos: prev.elementos.filter((_, i) => i !== index) } : prev,
    );

  if (event === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (event === null) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-muted-foreground">Evento não encontrado.</p>
        <Link to="/eventos" className="text-primary hover:underline">
          Voltar para eventos
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/eventos/${id}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2 truncate">
            <Wand2 className="size-5 text-primary flex-shrink-0" /> Planta Premium
          </h1>
          <p className="text-sm text-muted-foreground truncate">{event.name}</p>
        </div>
      </div>

      {/* Aviso de provedor não configurado */}
      {providerStatus !== undefined && !providerReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
          <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Provedor de imagem não configurado para este ambiente.
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Upload, interpretação e revisão funcionam normalmente. A geração da planta
              fica indisponível até o provedor ser definido nas variáveis de ambiente do
              Convex.
            </p>
          </div>
        </div>
      )}

      {/* 1. Croqui */}
      <section className="bg-card rounded-xl border border-border overflow-hidden">
        <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
          <ImageIcon className="size-4 text-primary" /> 1. Croqui original
        </h2>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie o croqui do layout. O arquivo original é preservado e nunca é
            substituído — cada geração guarda a referência a ele.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer gap-1.5"
              variant={sketch ? "secondary" : "default"}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {sketch ? "Trocar croqui" : "Enviar croqui"}
            </Button>

            {sketch && (
              <Button
                onClick={() => void handleInterpret()}
                disabled={interpreting}
                className="cursor-pointer gap-1.5"
              >
                {interpreting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {interpreting ? "Interpretando..." : "Interpretar com IA"}
              </Button>
            )}
          </div>

          {sketch && (
            <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
              <img
                src={sketch.previewUrl}
                alt="Croqui enviado"
                className="w-full max-h-80 object-contain"
              />
              <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border truncate">
                {sketch.filename}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 2. Revisão da interpretação */}
      {interpretation && (
        <section className="bg-card rounded-xl border border-border overflow-hidden">
          <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary" /> 2. Revisão
          </h2>
          <div className="p-5 space-y-5">
            <p className="text-xs text-muted-foreground">
              A IA apenas leu o croqui — nada foi aplicado. Corrija o que estiver errado:
              estas quantidades são o que a geração vai preservar.
            </p>

            {/* Ambientes */}
            <div className="space-y-1.5">
              <Label>Ambientes</Label>
              <Input
                value={interpretation.ambientes.join(", ")}
                onChange={(e) =>
                  patchInterpretation({
                    ambientes: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Salão principal, Área externa"
              />
            </div>

            {/* Elementos e contagem */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Elementos e quantidades</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={addElement}
                  className="cursor-pointer gap-1 h-8"
                >
                  <Plus className="size-3.5" /> Adicionar
                </Button>
              </div>

              {interpretation.elementos.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nenhum elemento identificado. Adicione manualmente.
                </p>
              ) : (
                <div className="space-y-2">
                  {interpretation.elementos.map((el, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <Input
                        value={el.tipo}
                        onChange={(e) => patchElement(i, { tipo: e.target.value })}
                        placeholder="mesa redonda"
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={el.quantidade}
                        onChange={(e) =>
                          patchElement(i, { quantidade: Number(e.target.value) || 0 })
                        }
                        className="w-24"
                      />
                      <Input
                        value={el.observacao ?? ""}
                        onChange={(e) => patchElement(i, { observacao: e.target.value })}
                        placeholder="observação"
                        className="flex-1 hidden sm:block"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeElement(i)}
                        className="cursor-pointer text-destructive h-9 w-9 p-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Circulação</Label>
                <Input
                  value={interpretation.circulacao ?? ""}
                  onChange={(e) => patchInterpretation({ circulacao: e.target.value })}
                  placeholder="Não identificado"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Acessos</Label>
                <Input
                  value={interpretation.acessos ?? ""}
                  onChange={(e) => patchInterpretation({ acessos: e.target.value })}
                  placeholder="Não identificado"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações do croqui</Label>
              <Textarea
                rows={2}
                value={interpretation.observacoes ?? ""}
                onChange={(e) => patchInterpretation({ observacoes: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Correções e instruções suas</Label>
              <Textarea
                rows={3}
                value={corrections}
                onChange={(e) => setCorrections(e.target.value)}
                placeholder="Ex.: as duas mesas do canto são imperiais, não redondas."
              />
              <p className="text-xs text-muted-foreground">
                Suas correções têm prioridade sobre a leitura automática.
              </p>
            </div>

            {/* 3. Geração */}
            <div className="border-t border-border pt-4 space-y-2">
              <Button
                onClick={() => void handleGenerate()}
                disabled={generating || !providerReady}
                className="w-full cursor-pointer gap-2 py-5 text-base"
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                {generating ? "Gerando planta premium..." : "GERAR PLANTA PREMIUM"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {providerReady
                  ? "A geração preserva a geometria, a ocupação e as quantidades confirmadas acima."
                  : "Provedor de imagem não configurado para este ambiente."}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4. Histórico */}
      <section className="bg-card rounded-xl border border-border overflow-hidden">
        <h2 className="font-semibold px-5 py-4 border-b border-border flex items-center gap-2">
          <History className="size-4 text-primary" /> Histórico de versões
          {renders !== undefined && renders.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({renders.length})
            </span>
          )}
        </h2>

        {renders === undefined ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : renders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhuma planta gerada ainda.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {renders.map((r) => (
              <div key={r._id} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Versão {r.generationVersion}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestampComHora(r.createdAt)}
                  </span>
                </div>

                {r.status === "failed" && r.errorMessage && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {r.errorMessage}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <figure className="space-y-1">
                    <figcaption className="text-xs text-muted-foreground">Croqui original</figcaption>
                    {r.sketchUrl && (
                      <a href={r.sketchUrl} target="_blank" rel="noreferrer">
                        <img
                          src={r.sketchUrl}
                          alt={`Croqui da versão ${r.generationVersion}`}
                          className="w-full rounded-lg border border-border object-contain max-h-48 bg-muted/30"
                        />
                      </a>
                    )}
                  </figure>
                  <figure className="space-y-1">
                    <figcaption className="text-xs text-muted-foreground">Planta premium</figcaption>
                    {r.outputUrl ? (
                      <a href={r.outputUrl} target="_blank" rel="noreferrer">
                        <img
                          src={r.outputUrl}
                          alt={`Planta premium versão ${r.generationVersion}`}
                          className="w-full rounded-lg border border-border object-contain max-h-48 bg-muted/30"
                        />
                      </a>
                    ) : (
                      <div className="w-full h-48 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                        {r.status === "generating" ? "Gerando..." : "Sem resultado"}
                      </div>
                    )}
                  </figure>
                </div>

                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    Detalhes da geração
                  </summary>
                  <dl className="mt-2 space-y-1 pl-1">
                    <MetaRow label="Provedor" value={r.provider} />
                    <MetaRow label="Modelo" value={r.model} />
                    <MetaRow label="Versão do prompt" value={r.promptVersion} />
                    <MetaRow
                      label="Contagem confirmada"
                      value={
                        r.interpretation.elementos
                          .map((e) => `${e.tipo}: ${e.quantidade}`)
                          .join(" · ") || "—"
                      }
                    />
                    {r.corrections && <MetaRow label="Correções" value={r.corrections} />}
                  </dl>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: "generating" | "done" | "failed" }) {
  const cfg = {
    generating: { label: "Gerando", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    done: { label: "Concluída", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    failed: { label: "Falhou", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  }[status];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground/70 flex-shrink-0">{label}:</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
