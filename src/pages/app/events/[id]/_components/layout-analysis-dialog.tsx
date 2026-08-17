import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// Fluxo do croqui/layout, espelhando o ContractImportDialog: LER → INTERPRETAR →
// MOSTRAR → REVISAR → CONFIRMAR → APLICAR. Nada é gravado no briefing sem
// confirmação explícita da decoradora.
export function LayoutAnalysisDialog({
  eventId,
  imageBase64,
  onClose,
}: {
  eventId: Id<"events">;
  imageBase64: string;
  onClose: () => void;
}) {
  const analyse = useAction(api.ai.analyseLayout);
  const upsertBriefingFields = useMutation(api.briefing.upsertBriefingFields);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [furnitureList, setFurnitureList] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await analyse({ eventId, imageUrl: imageBase64 });
        if (!active) return;
        if (!result.description && !result.furnitureList) {
          setError("Não foi possível identificar informações nesta imagem.");
          setLoading(false);
          return;
        }
        setDescription(result.description ?? "");
        setFurnitureList(result.furnitureList ?? "");
      } catch {
        if (active) setError("Não foi possível analisar a imagem com IA. Verifique se a chave de IA (ALTAR_AI_API_KEY) está configurada no Convex.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const combined = [
        description.trim(),
        furnitureList.trim() ? `\nItens identificados: ${furnitureList.trim()}` : "",
      ].join("").trim();
      if (combined) {
        await upsertBriefingFields({ eventId, fields: { atmosphereDescription: combined } });
      }
      toast.success("Análise de croqui aplicada ao briefing!");
      onClose();
    } catch {
      toast.error("Erro ao aplicar a análise ao briefing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Analisar croqui com IA
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando imagem...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary" /> Confira e ajuste antes de confirmar. Nada é aplicado sem sua confirmação.
            </p>
            <div className="space-y-1.5">
              <Label>Descrição do layout</Label>
              <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Itens identificados</Label>
              <Textarea rows={3} value={furnitureList} onChange={(e) => setFurnitureList(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Ao confirmar, esta descrição é adicionada ao briefing do evento.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            {error ? "Fechar" : "Cancelar"}
          </Button>
          {!loading && !error && (
            <Button onClick={() => void handleConfirm()} disabled={saving} className="cursor-pointer gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirmar e adicionar ao briefing
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
