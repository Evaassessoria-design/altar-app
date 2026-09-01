import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  ASSEMBLY_STATUSES,
  ASSEMBLY_STATUS_LABEL,
  effectiveAssemblyStatus,
  resumirCarregamento,
  type AssemblyStatus,
} from "@/convex/lib/assemblyStatus.ts";
import { cn } from "@/lib/utils.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Plus,
  Trash2,
  ImagePlus,
  Loader2,
  Package,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Itens operacionais de uma área do briefing. Genérico: cadeiras, mesas, sofás,
// tapetes, arranjos, iluminação, estruturas — qualquer item físico.
// ─────────────────────────────────────────────────────────────────────────────

type Item = {
  _id: Id<"assemblyItems">;
  area: string;
  name: string;
  model?: string;
  quantity?: number;
  unit?: string;
  supplierName?: string;
  ambiente?: string;
  notes?: string;
  includeInAssemblyReport: boolean;
  checkOnAssembly: boolean;
  operationalStatus?: string;
  referencePhotoUrl?: string | null;
  contractedPhotoUrl?: string | null;
};

export function AssemblyItemsSection({
  eventId,
  area,
  areaLabel,
}: {
  eventId: Id<"events">;
  area: string;
  areaLabel: string;
}) {
  const all = useQuery(api.assemblyItems.listByEvent, { eventId });
  const createItem = useMutation(api.assemblyItems.create);
  const updateItem = useMutation(api.assemblyItems.update);
  const removeItem = useMutation(api.assemblyItems.remove);

  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<Id<"assemblyItems"> | null>(null);
  const [draftName, setDraftName] = useState("");

  const items = (all ?? []).filter((i) => i.area === area) as Item[];
  const [filtroStatus, setFiltroStatus] = useState<AssemblyStatus | null>(null);
  const resumo = resumirCarregamento(items);
  const visiveis = filtroStatus
    ? items.filter((i) => effectiveAssemblyStatus(i) === filtroStatus)
    : items;

  const handleAdd = async () => {
    const name = draftName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await createItem({
        eventId,
        area,
        name,
        includeInAssemblyReport: true,
        checkOnAssembly: true,
        visibility: "equipe",
      });
      setDraftName("");
      toast.success("Item adicionado.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Erro ao adicionar item.",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-8 border-t border-border pt-5">
      <div className="flex items-center gap-2 mb-1">
        <Package className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Itens de montagem · {areaLabel}</h3>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">({items.length})</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Itens físicos que vão para o Caderno de Montagem. O briefing acima segue sendo o
        combinado; aqui é o operacional.
      </p>

      {/* Contagem por situação — números reais, sem percentual sintético.
          No dia da montagem é o que a equipe olha primeiro. */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setFiltroStatus(null)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer",
              filtroStatus === null
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            Todos ({resumo.total})
          </button>
          {ASSEMBLY_STATUSES.map((st) => {
            const n = resumo.porStatus[st];
            if (n === 0) return null;
            return (
              <button
                key={st}
                onClick={() => setFiltroStatus(filtroStatus === st ? null : st)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer",
                  filtroStatus === st
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {ASSEMBLY_STATUS_LABEL[st]} ({n})
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {visiveis.length === 0 && items.length > 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">
            Nenhum item nesta situação.
          </p>
        )}
        {visiveis.map((item) => (
          <ItemCard
            key={item._id}
            item={item}
            expanded={expandedId === item._id}
            onToggle={() => setExpandedId(expandedId === item._id ? null : item._id)}
            onUpdate={updateItem}
            onRemove={removeItem}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="Ex.: Cadeira Tiffany"
          className="flex-1"
        />
        <Button
          onClick={() => void handleAdd()}
          disabled={adding || !draftName.trim()}
          className="cursor-pointer gap-1.5"
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  item: Item;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: ReturnType<typeof useMutation<typeof api.assemblyItems.update>>;
  onRemove: ReturnType<typeof useMutation<typeof api.assemblyItems.remove>>;
}) {
  const setPhoto = useMutation(api.assemblyItems.setPhoto);
  const generateUploadUrl = useMutation(api.assemblyItems.generateUploadUrl);
  const [uploading, setUploading] = useState<"reference" | "contracted" | null>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const contractedInput = useRef<HTMLInputElement>(null);

  const statusAtual = effectiveAssemblyStatus(item);

  const patch = async (fields: Record<string, unknown>) => {
    try {
      await onUpdate({ id: item._id, ...fields });
    } catch {
      toast.error("Erro ao salvar item.");
    }
  };

  const uploadPhoto = async (slot: "reference" | "contracted", file: File) => {
    setUploading(slot);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await setPhoto({ id: item._id, slot, storageId });
      toast.success("Foto salva.");
    } catch {
      toast.error("Erro ao enviar a foto.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Resumo */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {item.referencePhotoUrl ? (
          <img
            src={item.referencePhotoUrl}
            alt=""
            className="size-10 rounded object-cover flex-shrink-0 border border-border"
          />
        ) : (
          <div className="size-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <Package className="size-4 text-muted-foreground" />
          </div>
        )}

        <button onClick={onToggle} className="flex-1 min-w-0 text-left cursor-pointer">
          <p className="text-sm font-medium truncate">
            {item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · ` : ""}
            {item.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {[item.model, item.ambiente, item.supplierName].filter(Boolean).join(" · ") ||
              "Sem detalhes"}
          </p>
        </button>

        {/* Situação do item, alterável sem abrir o detalhe. No dia da montagem
            a equipe precisa marcar dezenas de itens rapidamente. */}
        <select
          value={statusAtual}
          onChange={(e) => void patch({ operationalStatus: e.target.value })}
          aria-label={`Situação de ${item.name}`}
          className={cn(
            "h-7 rounded-full border-0 px-2 text-xs font-medium cursor-pointer flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-ring",
            statusAtual === "pendente" && "bg-muted text-muted-foreground",
            statusAtual === "separado" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
            statusAtual === "carregado" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
            statusAtual === "conferido" && "bg-primary/10 text-primary",
            statusAtual === "retornou" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
          )}
        >
          {ASSEMBLY_STATUSES.map((st) => (
            <option key={st} value={st}>
              {ASSEMBLY_STATUS_LABEL[st]}
            </option>
          ))}
        </select>

        <Button variant="ghost" size="sm" onClick={onToggle} className="cursor-pointer h-8 w-8 p-0">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>

      {/* Detalhe */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
          <div className="grid sm:grid-cols-2 gap-2">
            <Field label="Nome" value={item.name} onSave={(v) => void patch({ name: v })} />
            <Field label="Modelo" value={item.model ?? ""} onSave={(v) => void patch({ model: v })} />
            <Field
              label="Quantidade"
              value={item.quantity?.toString() ?? ""}
              type="number"
              onSave={(v) => void patch({ quantity: v ? Number(v) : undefined })}
            />
            <Field label="Unidade" value={item.unit ?? ""} onSave={(v) => void patch({ unit: v })} />
            <Field
              label="Ambiente"
              value={item.ambiente ?? ""}
              onSave={(v) => void patch({ ambiente: v })}
            />
            <Field
              label="Fornecedor"
              value={item.supplierName ?? ""}
              onSave={(v) => void patch({ supplierName: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observação</Label>
            <Textarea
              rows={2}
              defaultValue={item.notes ?? ""}
              onBlur={(e) => void patch({ notes: e.target.value })}
              placeholder="Ex.: almofada off-white"
            />
          </div>

          {/* Fotos */}
          <div className="grid grid-cols-2 gap-3">
            <PhotoSlot
              label="Referência aprovada"
              url={item.referencePhotoUrl}
              uploading={uploading === "reference"}
              inputRef={refInput}
              onPick={(f) => void uploadPhoto("reference", f)}
            />
            <PhotoSlot
              label="Item contratado"
              url={item.contractedPhotoUrl}
              uploading={uploading === "contracted"}
              inputRef={contractedInput}
              onPick={(f) => void uploadPhoto("contracted", f)}
            />
          </div>

          {/* Flags */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={item.includeInAssemblyReport}
                onCheckedChange={(c) => void patch({ includeInAssemblyReport: c === true })}
              />
              Incluir no relatório de montagem
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={item.checkOnAssembly}
                onCheckedChange={(c) => void patch({ checkOnAssembly: c === true })}
              />
              Conferir na montagem (☐ no PDF)
            </label>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onRemove({ id: item._id })}
            className="cursor-pointer text-destructive gap-1.5"
          >
            <Trash2 className="size-4" /> Excluir item
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  type,
  onSave,
}: {
  label: string;
  value: string;
  type?: string;
  onSave: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        defaultValue={value}
        onBlur={(e) => {
          if (e.target.value !== value) onSave(e.target.value);
        }}
      />
    </div>
  );
}

function PhotoSlot({
  label,
  url,
  uploading,
  inputRef,
  onPick,
}: {
  label: string;
  url?: string | null;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full h-24 rounded-lg border border-dashed border-border hover:border-primary transition-colors cursor-pointer overflow-hidden flex items-center justify-center bg-muted/30"
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImagePlus className="size-5" /> Adicionar
          </span>
        )}
      </button>
    </div>
  );
}
