import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { areaByKey, type BriefingFields } from "@/lib/briefing-areas.ts";
import { suggestAssemblyItems, type SuggestedItem } from "@/lib/assembly-suggestions.ts";

// ─────────────────────────────────────────────────────────────────────────────
// SUGERIR → MOSTRAR → REVISAR → CONFIRMAR → CRIAR.
// A sugestão é derivada de campos que já existem no briefing. Nada é criado sem
// a decoradora marcar e confirmar — mesmo princípio do import de contrato.
// ─────────────────────────────────────────────────────────────────────────────

type Row = SuggestedItem & { selected: boolean };

export function SuggestItemsDialog({
  eventId,
  briefing,
  onClose,
}: {
  eventId: Id<"events">;
  briefing: Partial<BriefingFields> | null | undefined;
  onClose: () => void;
}) {
  const createMany = useMutation(api.assemblyItems.createMany);
  const [rows, setRows] = useState<Row[]>(() =>
    suggestAssemblyItems(briefing).map((s) => ({ ...s, selected: true })),
  );
  const [saving, setSaving] = useState(false);

  const selectedCount = rows.filter((r) => r.selected).length;

  const patch = (index: number, fields: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...fields } : r)));

  const handleConfirm = async () => {
    const chosen = rows.filter((r) => r.selected && r.name.trim());
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      await createMany({
        eventId,
        items: chosen.map((r) => ({
          area: r.area,
          name: r.name.trim(),
          model: r.model?.trim() || undefined,
          quantity: r.quantity,
          unit: r.unit?.trim() || undefined,
          supplierName: r.supplierName?.trim() || undefined,
          ambiente: r.ambiente?.trim() || undefined,
          notes: r.notes?.trim() || undefined,
          includeInAssemblyReport: r.includeInAssemblyReport,
          checkOnAssembly: r.checkOnAssembly,
          visibility: r.visibility,
        })),
      });
      toast.success(`${chosen.length} item(ns) criado(s).`);
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Erro ao criar os itens.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Criar itens a partir do briefing
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ainda não há dados no briefing suficientes para sugerir itens. Preencha campos
            como tipo e quantidade de mesas e cadeiras.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Estas sugestões vêm do que já está escrito no briefing. Nada é criado sem sua
              confirmação — desmarque ou ajuste o que não estiver certo.
            </p>

            {rows.map((row, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 space-y-2 transition-colors ${
                  row.selected ? "border-border bg-card" : "border-dashed border-border opacity-60"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={row.selected}
                    onCheckedChange={(c) => patch(i, { selected: c === true })}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-primary">
                        {areaByKey(row.area)?.label ?? row.area}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        de: {row.origem}
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          value={row.name}
                          onChange={(e) => patch(i, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qtd.</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.quantity ?? ""}
                          onChange={(e) =>
                            patch(i, {
                              quantity: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ambiente</Label>
                        <Input
                          value={row.ambiente ?? ""}
                          onChange={(e) => patch(i, { ambiente: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          {rows.length > 0 && (
            <Button
              onClick={() => void handleConfirm()}
              disabled={saving || selectedCount === 0}
              className="cursor-pointer gap-1.5"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Criar {selectedCount} item(ns)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
