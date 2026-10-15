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
import type { ItensDoBloco } from "@/lib/briefing-areas.ts";
import { rotuloDaOrigem } from "@/lib/rotulos-do-item.ts";
import {
  ORIGENS,
  ROTULO_DA_SITUACAO,
  SITUACOES,
  type OrigemDoItem,
  type SituacaoDoItem,
} from "@/convex/lib/itemDoBriefing.ts";

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
  visibility: string;
  bloco?: string;
  situacao?: SituacaoDoItem;
  origem?: OrigemDoItem;
  corAcabamento?: string;
  medidas?: string;
  posicao?: string;
  responsavelMontagem?: string;
  tipoFlor?: "natural" | "permanente";
  reaproveitamento?: { ambiente: string; horario?: string; responsavel?: string };
};

export type ItemDaSecao = Item;

/** As situações que o bloco oferece. Personalização não tem "a definir": nasce em avaliação. */
function situacoesDo(tipo?: ItensDoBloco["tipo"]): SituacaoDoItem[] {
  return tipo === "personalizacao"
    ? ["em_avaliacao", "aprovado", "contratado", "nao_se_aplica"]
    : [...SITUACOES];
}

// ── POR BLOCO (14/10) ───────────────────────────────────────────────────────
// Com `bloco`, a seção mostra só os itens daquele bloco do briefing (Altar,
// Bar, Cantinho das crianças…) e oferece as sugestões de um toque.
//
// Sem `bloco`, é a lista "Outros itens desta aba": tudo da área que NÃO está
// num bloco conhecido — os itens cadastrados antes da reorganização, que não
// têm `bloco`. Eles continuam aqui, editáveis, e continuam chegando ao Caderno
// e ao Carregamento como sempre. Nenhum item some da tela.
export function AssemblyItemsSection({
  eventId,
  area,
  areaLabel,
  bloco,
  blocosDaArea,
}: {
  eventId: Id<"events">;
  area: string;
  areaLabel: string;
  bloco?: ItensDoBloco;
  /** Os blocos que a área tem. Sem `bloco`, a seção mostra o que sobra deles. */
  blocosDaArea?: readonly string[];
}) {
  const all = useQuery(api.assemblyItems.listByEvent, { eventId });
  const createItem = useMutation(api.assemblyItems.create);
  const updateItem = useMutation(api.assemblyItems.update);
  const removeItem = useMutation(api.assemblyItems.remove);

  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<Id<"assemblyItems"> | null>(null);
  const [draftName, setDraftName] = useState("");

  const daArea = (all ?? []).filter((i) => i.area === area) as Item[];
  const conhecidos = new Set(blocosDaArea ?? []);
  const items = bloco
    ? daArea.filter((i) => i.bloco === bloco.bloco)
    : daArea.filter((i) => !i.bloco || !conhecidos.has(i.bloco));
  const [filtroStatus, setFiltroStatus] = useState<AssemblyStatus | null>(null);
  const resumo = resumirCarregamento(items);
  const visiveis = filtroStatus
    ? items.filter((i) => effectiveAssemblyStatus(i) === filtroStatus)
    : items;

  const handleAdd = async (nomeSugerido?: string) => {
    const name = (nomeSugerido ?? draftName).trim();
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
        bloco: bloco?.bloco,
        ambiente: bloco?.ambiente,
        // Pedido de personalização nasce EM AVALIAÇÃO: só vira obrigação de
        // montagem quando ela muda para aprovado ou contratado.
        situacao: bloco?.tipo === "personalizacao" ? "em_avaliacao" : undefined,
      });
      if (!nomeSugerido) setDraftName("");
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

  // Sugestão que já virou item some da lista: tocar duas vezes não cria o
  // segundo "Genuflexório" — a comparação ignora caixa e espaço.
  const nomes = new Set(items.map((i) => i.name.trim().toLowerCase()));
  const sugestoes = (bloco?.sugestoes ?? []).filter((s) => !nomes.has(s.trim().toLowerCase()));

  // A lista de sobras só aparece quando há o que mostrar.
  if (!bloco && (blocosDaArea?.length ?? 0) > 0 && items.length === 0) return null;

  return (
    <div className={bloco ? "mt-3" : "mt-8 border-t border-border pt-5"}>
      {bloco ? (
        <div className="flex items-center gap-2 mb-2">
          <Package className="size-3.5 text-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Itens {items.length > 0 && <span className="normal-case">({items.length})</span>}
          </h4>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <Package className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">
              {(blocosDaArea?.length ?? 0) > 0 ? `Outros itens · ${areaLabel}` : `Itens de montagem · ${areaLabel}`}
            </h3>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">({items.length})</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {(blocosDaArea?.length ?? 0) > 0
              ? "Itens desta aba cadastrados antes dos blocos. Continuam valendo para o Caderno e o Carregamento."
              : "Itens físicos que vão para o Caderno de Montagem. O briefing acima segue sendo o combinado; aqui é o operacional."}
          </p>
        </>
      )}

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
            tipo={bloco?.tipo}
          />
        ))}
      </div>

      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Sugestões de itens">
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              disabled={adding}
              onClick={() => void handleAdd(s)}
              className="text-xs px-2.5 py-1 rounded-full border border-dashed border-primary/50 text-primary hover:bg-primary/10 cursor-pointer disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

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
          placeholder={bloco ? "Adicionar item" : "Ex.: Cadeira Tiffany"}
          className="flex-1"
        />
        <Button
          type="button"
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

export function ItemCard({
  item,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  tipo,
}: {
  item: Item;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: ReturnType<typeof useMutation<typeof api.assemblyItems.update>>;
  onRemove: ReturnType<typeof useMutation<typeof api.assemblyItems.remove>>;
  tipo?: ItensDoBloco["tipo"];
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
            {[
              item.situacao && ROTULO_DA_SITUACAO[item.situacao],
              item.model,
              item.ambiente,
              item.origem && rotuloDaOrigem(item.origem, tipo),
              item.supplierName,
            ]
              .filter(Boolean)
              .join(" · ") || "Sem detalhes"}
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
            <Field
              label="Cor / acabamento"
              value={item.corAcabamento ?? ""}
              onSave={(v) => void patch({ corAcabamento: v.trim() ? v : null })}
            />
            <Field
              label="Medidas"
              value={item.medidas ?? ""}
              onSave={(v) => void patch({ medidas: v.trim() ? v : null })}
            />
            <Field
              label="Posição no ambiente"
              value={item.posicao ?? ""}
              onSave={(v) => void patch({ posicao: v.trim() ? v : null })}
            />
            <Field
              label="Responsável pela montagem"
              value={item.responsavelMontagem ?? ""}
              onSave={(v) => void patch({ responsavelMontagem: v.trim() ? v : null })}
            />
            <Escolha
              label={tipo === "iluminacao" ? "De onde vem" : "Origem"}
              value={item.origem ?? ""}
              opcoes={ORIGENS.map((o) => ({ value: o, label: rotuloDaOrigem(o, tipo) }))}
              onChange={(v) => void patch({ origem: v || null })}
            />
            <Escolha
              label="Situação"
              value={item.situacao ?? ""}
              opcoes={situacoesDo(tipo).map((st) => ({ value: st, label: ROTULO_DA_SITUACAO[st] }))}
              onChange={(v) => void patch({ situacao: v || null })}
            />
            {tipo === "flor" && (
              <Escolha
                label="Natural ou permanente"
                value={item.tipoFlor ?? ""}
                opcoes={[
                  { value: "natural", label: "Natural" },
                  { value: "permanente", label: "Permanente" },
                ]}
                onChange={(v) => void patch({ tipoFlor: v || null })}
              />
            )}
          </div>

          {(item.situacao === "em_avaliacao" || item.situacao === "nao_se_aplica") && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              {item.situacao === "em_avaliacao"
                ? "Em avaliação: não entra na montagem, nas compras nem no caminhão até ser aprovado."
                : "Não se aplica: fica registrado, fora da montagem."}
            </p>
          )}

          <Reaproveitamento item={item} onSalvar={(r) => void patch({ reaproveitamento: r })} />

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
            {/* "Inspiração" é a referência: NÃO é o contratado. "Modelo
                aprovado" é o que foi fechado — o caderno o rotula CONTRATADO. */}
            <PhotoSlot
              label="Inspiração"
              foto={item.referenceFoto}
              onEscolher={() => setEscolhendo("reference")}
              onTirar={() => void tirarFoto("reference")}
            />
            <PhotoSlot
              label="Modelo aprovado"
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
            {/* O item nasce para a equipe. Sem este controle, nenhum item
                cadastrado pela tela chegava ao caderno dos noivos nem à
                apresentação do Projeto Visual (homologação de 14/10). Item
                marcado como interno continua interno até ela decidir. */}
            {item.visibility === "interno" ? (
              <p className="text-xs text-muted-foreground">Item interno: não sai em nenhum caderno.</p>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={item.visibility === "cliente"}
                  onCheckedChange={(c) => void patch({ visibility: c === true ? "cliente" : "equipe" })}
                />
                Mostrar no caderno do cliente
              </label>
            )}
            {/* O caderno só lê itens do relatório de montagem
                (src/lib/caderno/montar-caderno.ts). Sem este aviso, marcar
                "cliente" com o relatório desligado não fazia nada, calado. */}
            {item.visibility === "cliente" && !item.includeInAssemblyReport && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Para aparecer no caderno, marque também “Incluir no relatório de montagem”.
              </p>
            )}
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

/** `<select>` nativo, pelo mesmo motivo do fornecedor: no celular, a roda do sistema. */
function Escolha({
  label,
  value,
  opcoes,
  onChange,
}: {
  label: string;
  value: string;
  opcoes: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs md:text-sm cursor-pointer"
      >
        <option value="">Não informado</option>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A MESMA peça num segundo ambiente — as cadeiras da cerimônia que vão para a
 * festa. É uma transferência, não outra peça: a quantidade física é a do item
 * e não se soma. O caderno da equipe mostra quem leva e quando.
 */
function Reaproveitamento({
  item,
  onSalvar,
}: {
  item: Item;
  onSalvar: (r: { ambiente: string; horario?: string; responsavel?: string } | null) => void;
}) {
  const atual = item.reaproveitamento;
  const [aberto, setAberto] = useState(!!atual);
  const salvar = (campo: "ambiente" | "horario" | "responsavel", valor: string) => {
    const proximo = { ...(atual ?? { ambiente: "" }), [campo]: valor.trim() || undefined };
    if (!proximo.ambiente?.trim()) {
      // Sem o ambiente de destino não há reaproveitamento: limpa em vez de
      // gravar uma transferência para lugar nenhum.
      if (atual) onSalvar(null);
      return;
    }
    onSalvar({ ambiente: proximo.ambiente.trim(), horario: proximo.horario, responsavel: proximo.responsavel });
  };
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs text-primary hover:underline cursor-pointer"
      >
        + Esta peça também é usada em outro ambiente
      </button>
    );
  }
  return (
    <div className="rounded-md border border-border p-2.5 space-y-2">
      <p className="text-xs font-medium">Reaproveitamento em outro ambiente</p>
      <p className="text-[11px] text-muted-foreground">
        A mesma peça, transferida — a quantidade não é somada duas vezes.
      </p>
      <div className="grid sm:grid-cols-3 gap-2">
        <Field label="Para qual ambiente" value={atual?.ambiente ?? ""} onSave={(v) => salvar("ambiente", v)} />
        <Field label="Horário da transferência" value={atual?.horario ?? ""} onSave={(v) => salvar("horario", v)} />
        <Field label="Quem transfere" value={atual?.responsavel ?? ""} onSave={(v) => salvar("responsavel", v)} />
      </div>
      {atual && (
        <button
          type="button"
          onClick={() => {
            onSalvar(null);
            setAberto(false);
          }}
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          Remover reaproveitamento
        </button>
      )}
    </div>
  );
}
