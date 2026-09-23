import { useState } from "react";
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
import { StatusSelect } from "@/components/status-select.tsx";

/** Cores do trajeto: cinza no galpão, quente ao sair, verde ao voltar. */
const TOM_CARREGAMENTO: Record<AssemblyStatus, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  separado: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-800",
  carregado: "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-900/25 dark:text-blue-300 dark:border-blue-800",
  conferido: "bg-primary/10 text-primary border-primary/30",
  retornou: "bg-green-50 text-green-800 border-green-300 dark:bg-green-900/25 dark:text-green-300 dark:border-green-800",
};
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { SeletorDeFoto } from "@/components/projeto/seletor-de-foto.tsx";
import {
  urlDeMiniatura,
  type FotoResolvida,
} from "@/convex/lib/fotoDoItem.ts";
import {
  Plus,
  Trash2,
  ImagePlus,
  Loader2,
  Package,
  ChevronDown,
  ChevronUp,
  Images,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Itens operacionais de uma área do briefing. Genérico: cadeiras, mesas, sofás,
// tapetes, arranjos, iluminação, estruturas — qualquer item físico.
// ─────────────────────────────────────────────────────────────────────────────

type Item = {
  _id: Id<"assemblyItems">;
  eventId: Id<"events">;
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
  supplierId?: Id<"eventSuppliers">;
  /** Já resolvidas pelo servidor — ver convex/lib/fotoDoItem.ts. */
  referenceFoto: FotoResolvida;
  contractedFoto: FotoResolvida;
  referencePhotoUrl?: string | null;
  contractedPhotoUrl?: string | null;
  /** A receita da Ficha Técnica. Só para avisar o que a exclusão leva junto. */
  receita?: unknown[];
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
  const clearPhoto = useMutation(api.assemblyItems.clearPhoto);
  // Qual slot está com o seletor aberto. `null` = fechado.
  const [escolhendo, setEscolhendo] = useState<"reference" | "contracted" | null>(null);
  // Os fornecedores DESTE evento — a mesma lista da aba Fornecedores. Sem isto
  // o campo era texto livre e "Móveis Bella" era digitado de novo em cada item.
  const fornecedores = useQuery(api.suppliers.listByEvent, { eventId: item.eventId }) as
    | { _id: Id<"eventSuppliers">; companyName: string }[]
    | undefined;

  const statusAtual = effectiveAssemblyStatus(item);

  const patch = async (fields: Record<string, unknown>) => {
    try {
      await onUpdate({ id: item._id, ...fields });
    } catch {
      toast.error("Erro ao salvar item.");
    }
  };

  const tirarFoto = async (slot: "reference" | "contracted") => {
    try {
      await clearPhoto({ id: item._id, slot });
      toast.success("Foto removida do item.");
    } catch {
      toast.error("Não foi possível remover a foto.");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Resumo */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* A miniatura usa a VERSÃO LEVE quando existe. Pelo caminho antigo
            (arquivo próprio do item) ela não existe, e aí cai no original —
            que é exatamente o que acontecia em todos os casos antes. */}
        {urlDeMiniatura(item.referenceFoto) ? (
          <img loading="lazy" decoding="async"
            src={urlDeMiniatura(item.referenceFoto)!}
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
        <StatusSelect
          value={statusAtual}
          options={ASSEMBLY_STATUSES.map((st) => ({
            value: st,
            label: ASSEMBLY_STATUS_LABEL[st],
          }))}
          onChange={(st) => void patch({ operationalStatus: st })}
          ariaLabel={`Situação de ${item.name}`}
          tone={TOM_CARREGAMENTO[statusAtual]}
        />

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
              onSave={(v) => void patch({ quantity: v ? Number(v) : null })}
            />
            <Field label="Unidade" value={item.unit ?? ""} onSave={(v) => void patch({ unit: v })} />
            <Field
              label="Ambiente"
              value={item.ambiente ?? ""}
              onSave={(v) => void patch({ ambiente: v })}
            />
            <CampoFornecedor
              item={item}
              fornecedores={fornecedores}
              onEscolher={(f) =>
                void patch(
                  f
                    ? { supplierId: f._id, supplierName: f.companyName }
                    : // Desvincular NÃO apaga o nome: ele é o histórico do que
                      // valia quando o item foi cadastrado, do mesmo jeito que
                      // `purchaseItems.supplier` e `assemblyItems.supplierName`
                      // sempre foram. Some o vínculo, fica a anotação.
                      { supplierId: null },
                )
              }
              onDigitar={(v) => void patch({ supplierName: v, supplierId: null })}
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

          {/* Fotos — da Galeria do evento, não de um upload paralelo. */}
          <div className="grid grid-cols-2 gap-3">
            <PhotoSlot
              label="Referência aprovada"
              foto={item.referenceFoto}
              onEscolher={() => setEscolhendo("reference")}
              onTirar={() => void tirarFoto("reference")}
            />
            <PhotoSlot
              label="Item contratado"
              foto={item.contractedFoto}
              onEscolher={() => setEscolhendo("contracted")}
              onTirar={() => void tirarFoto("contracted")}
            />
          </div>

          {escolhendo && (
            <SeletorDeFoto
              eventId={item.eventId}
              itemId={item._id}
              slot={escolhendo}
              ambienteDoItem={item.ambiente}
              selecionada={
                (escolhendo === "reference" ? item.referenceFoto : item.contractedFoto).photoId
              }
              onClose={() => setEscolhendo(null)}
            />
          )}

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
            onClick={() => {
              // Excluir aqui não some só com a linha: leva junto a RECEITA
              // (de que a Ficha Técnica depende) e as DUAS fotos, que saem do
              // storage e não voltam. A foto de referência e a do contratado
              // são a prova do que foi combinado com a cliente.
              //
              // Toda ação equivalente do aplicativo já pergunta antes —
              // excluir evento, fornecedor, item de orçamento, documento do
              // lead, arquivar material. Esta era a única que não perguntava,
              // e é a que custa mais.
              const temReceita = (item.receita?.length ?? 0) > 0;
              const temFoto = Boolean(item.referencePhotoUrl || item.contractedPhotoUrl);
              const perdas = [
                temReceita && "a receita da ficha técnica",
                temFoto && "as fotos anexadas",
              ].filter(Boolean);

              const aviso = perdas.length
                ? `Excluir "${item.name}"? Você perde também ${perdas.join(" e ")}. Não há como desfazer.`
                : `Excluir "${item.name}"? Não há como desfazer.`;

              if (!window.confirm(aviso)) return;
              void onRemove({ id: item._id });
            }}
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
  foto,
  onEscolher,
  onTirar,
}: {
  label: string;
  foto: FotoResolvida;
  onEscolher: () => void;
  onTirar: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <Label className="text-xs truncate">{label}</Label>
        {foto.origem && (
          <button
            onClick={onTirar}
            aria-label={`Remover ${label}`}
            // O ÍCONE é pequeno, o ALVO não é: `size-8` dá 32 px de área
            // tocável e `-mr-1.5` a puxa de volta para a borda, para o
            // tamanho do alvo não empurrar o rótulo. Um `p-1` num ícone de
            // 14 px daria 22 px, que erra no polegar num item de lista.
            className="cursor-pointer text-muted-foreground hover:text-destructive size-8 -mr-1.5 -my-1 flex items-center justify-center flex-shrink-0"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <button
        onClick={onEscolher}
        className="w-full h-24 rounded-lg border border-dashed border-border hover:border-primary transition-colors cursor-pointer overflow-hidden flex items-center justify-center bg-muted/30"
      >
        {urlDeMiniatura(foto) ? (
          <img
            src={urlDeMiniatura(foto)!}
            alt={label}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImagePlus className="size-5" /> Adicionar
          </span>
        )}
      </button>
      {foto.origem === "proprio" && (
        // Enviada pelo caminho antigo: o arquivo é só deste item e não está na
        // Galeria. Dizer isso é o que dá sentido ao botão de trocar.
        <p className="text-[10px] text-muted-foreground leading-tight">
          Enviada só neste item — não está na Galeria.
        </p>
      )}
    </div>
  );
}

/**
 * O fornecedor do item, escolhido entre os que JÁ ESTÃO no evento.
 *
 * `<select>` nativo de propósito: no celular ele abre a roda do sistema, que é
 * o melhor seletor que existe naquele aparelho, não fica embaixo do teclado e
 * não precisa de um segundo diálogo por cima do primeiro.
 *
 * `supplierName` continua gravado junto com o vínculo. Ele é o SNAPSHOT do que
 * valia quando o item foi cadastrado — é o que mantém legível o Caderno de um
 * evento cujo fornecedor foi removido depois.
 */
function CampoFornecedor({
  item,
  fornecedores,
  onEscolher,
  onDigitar,
}: {
  item: Item;
  fornecedores?: { _id: Id<"eventSuppliers">; companyName: string }[];
  onEscolher: (f: { _id: Id<"eventSuppliers">; companyName: string } | null) => void;
  onDigitar: (v: string) => void;
}) {
  const lista = fornecedores ?? [];
  // Nome gravado que não corresponde a nenhum fornecedor do evento: continua
  // valendo como anotação. Esconder o texto porque ele não está na lista seria
  // apagar o trabalho dela da tela sem apagar do banco.
  const soltoo = !item.supplierId && (item.supplierName ?? "").trim();

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Fornecedor</Label>
      <select
        value={item.supplierId ?? ""}
        onChange={(e) => {
          const escolhido = lista.find((f) => f._id === e.target.value);
          onEscolher(escolhido ?? null);
        }}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs md:text-sm cursor-pointer"
      >
        <option value="">
          {soltoo ? `${soltoo} (anotação)` : "Sem fornecedor"}
        </option>
        {lista.map((f) => (
          <option key={f._id} value={f._id}>
            {f.companyName}
          </option>
        ))}
      </select>
      {lista.length === 0 && (
        <p className="text-[10px] text-muted-foreground leading-tight">
          Nenhum fornecedor neste evento ainda. Cadastre em Fornecedores, ou anote abaixo.
        </p>
      )}
      {!item.supplierId && (
        <Input
          defaultValue={item.supplierName ?? ""}
          placeholder="Ou anote o nome"
          className="h-8 text-sm"
          onBlur={(e) => {
            if (e.target.value !== (item.supplierName ?? "")) onDigitar(e.target.value);
          }}
        />
      )}
    </div>
  );
}
