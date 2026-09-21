import { useParams, Link } from "react-router-dom";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Loader2,
  X,
  Check,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { paraOCampo, valorDigitado } from "@/lib/valor-digitado.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { motivoDaListaVazia } from "@/lib/lista-vazia.ts";

const CATEGORIES = [
  "Honorários",
  "Sinal",
  "Saldo",
  "Flores",
  "Móveis",
  "Tecidos",
  "Iluminação",
  "Bolo e Doces",
  "Transporte",
  "Equipe",
  "Fornecedor",
  "Aluguel de Espaço",
  "Outros",
];

type ItemType = "income" | "expense";

type FormState = {
  description: string;
  category: string;
  quantity: string;
  unitPrice: string;
  type: ItemType;
  notes: string;
};

const EMPTY_FORM: FormState = {
  description: "",
  category: "Honorários",
  quantity: "1",
  unitPrice: "",
  type: "income",
  notes: "",
};

function SummaryCard({
  label,
  value,
  sub,
  color = "default",
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "default" | "green" | "red" | "blue";
  delay?: number;
}) {
  const colorClass = {
    default: "text-foreground",
    green: "text-green-600 dark:text-green-400",
    red: "text-red-500 dark:text-red-400",
    blue: "text-primary",
  }[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className="bg-card rounded-xl border border-border p-4 space-y-1"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold", colorClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

export default function OrcamentoPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;

  const event = useQuery(api.events.get, { id: eventId });
  const items = useQuery(api.orcamento.listItems, { eventId });
  const summary = useQuery(api.orcamento.getSummary, { eventId });
  const currentUser = useQuery(api.users.getCurrentUser);

  const addItem = useMutation(api.orcamento.addItem);
  const updateItem = useMutation(api.orcamento.updateItem);
  const deleteItem = useMutation(api.orcamento.deleteItem);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"budgetItems"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"budgetItems"> | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<ItemType | "all">("all");

  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (item: NonNullable<typeof items>[number]) => {
    setEditingId(item._id);
    setForm({
      description: item.description,
      category: item.category,
      quantity: item.quantity.toString(),
      // Na escrita daqui: "1.500,00".
      unitPrice: paraOCampo(item.unitPrice),
      type: item.type,
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.unitPrice) {
      toast.error("Preencha descrição e valor unitário");
      return;
    }
    setSaving(true);
    try {
      // `parseFloat("1.500,00")` é 1.5, e o `.replace(",", ".")` de antes só
      // piorava: virava "1.500.00". Um item de mil e quinhentos entrava como
      // um e cinquenta, no orçamento que vai para a cliente. Ver
      // `src/lib/valor-digitado.ts`.
      const price = valorDigitado(form.unitPrice);
      if (price === null || price < 0) {
        toast.error("Valor unitário não reconhecido. Ex.: 1.500,00");
        setSaving(false);
        return;
      }
      // `|| 1` transformava quantidade ZERO em um item de uma unidade, e
      // quantidade ilegível também. Ausente continua valendo 1 — é o padrão
      // que o formulário sempre teve; ilegível agora é erro.
      const quantidadeLida = form.quantity.trim() ? valorDigitado(form.quantity) : 1;
      if (quantidadeLida === null || quantidadeLida < 0) {
        toast.error("Quantidade não reconhecida.");
        setSaving(false);
        return;
      }
      const qty = quantidadeLida;
      if (editingId) {
        await updateItem({
          id: editingId,
          description: form.description.trim(),
          category: form.category,
          quantity: qty,
          unitPrice: price,
          type: form.type,
          notes: form.notes || undefined,
        });
        toast.success("Item atualizado!");
      } else {
        await addItem({
          eventId,
          description: form.description.trim(),
          category: form.category,
          quantity: qty,
          unitPrice: price,
          type: form.type,
          notes: form.notes || undefined,
        });
        toast.success("Item adicionado!");
      }
      setDialogOpen(false);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao salvar item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteItem({ id: deletingId });
      toast.success("Item removido.");
    } catch {
      toast.error("Erro ao remover item");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadPDF = async () => {
    if (!event || !items || !summary) return;
    setPdfGenerating(true);
    try {
      (await import("@/lib/generate-orcamento-pdf.ts")).generateOrcamentoPDF({
        event,
        items,
        summary,
        studioName: currentUser?.name ?? undefined,
      });
      toast.success("PDF gerado!");
    } catch {
      toast.error("Erro ao gerar PDF");
    } finally {
      setPdfGenerating(false);
    }
  };

  if (event === undefined || items === undefined || summary === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Evento não encontrado.{" "}
        <Link to="/eventos" className="text-primary hover:underline">Voltar</Link>
      </div>
    );
  }

  const filteredItems = (items ?? []).filter(
    (i) => activeTab === "all" || i.type === activeTab,
  );
  // A aba mostrava "12" logo acima de "Nenhum item ainda" — a contradição
  // inteira cabia numa tela só.
  const vazio = motivoDaListaVazia((items ?? []).length, filteredItems.length);
  const incomeTotal = items.filter((i) => i.type === "income").reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const expenseTotal = items.filter((i) => i.type === "expense").reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="size-4" /> {event.name}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="size-5 text-primary" /> Orçamento Interativo
          </h1>
          <p className="text-sm text-muted-foreground">
            Receitas e custos estimados para o evento — <strong>uso interno</strong>
          </p>
        </div>
        <div className="flex gap-2">
          {/* O PDF traz custo orçado, lucro e margem — é documento DELA, não
              da cliente. O botão era um ícone sem rótulo, e o arquivo se
              chamava só "orcamento": um clique e a cliente sabia quanto a
              decoradora ia ganhar. */}
          <Button
            size="sm"
            variant="secondary"
            disabled={pdfGenerating || items.length === 0}
            onClick={handleDownloadPDF}
            title="Baixar em PDF — documento interno, com custos e margem"
            aria-label="Baixar o orçamento em PDF (uso interno, com custos e margem)"
            className="cursor-pointer gap-1.5"
          >
            {pdfGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            <span className="hidden sm:inline">PDF interno</span>
          </Button>
          <Button size="sm" onClick={openAdd} className="cursor-pointer gap-1.5">
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Receita Orçada"
          value={brl(summary.quotedIncome)}
          sub={`${items.filter((i) => i.type === "income").length} itens`}
          color="green"
          delay={0}
        />
        <SummaryCard
          label="Custo Orçado"
          value={brl(summary.quotedExpense)}
          sub={`${items.filter((i) => i.type === "expense").length} itens`}
          color="red"
          delay={0.05}
        />
        <SummaryCard
          label="Lucro Orçado"
          value={brl(summary.quotedProfit)}
          color={summary.quotedProfit >= 0 ? "green" : "red"}
          delay={0.1}
        />
        <SummaryCard
          label="Margem Real"
          value={`${summary.margin.toFixed(1)}%`}
          sub={`Lucro real: ${brl(summary.profit)}`}
          color={summary.margin >= 0 ? "blue" : "red"}
          delay={0.15}
        />
      </div>

      {/* Comparison bar — orçado vs real */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
        className="bg-card rounded-xl border border-border p-5 space-y-4"
      >
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" /> Orçado × Real
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          {[
            {
              label: "Receita",
              quoted: summary.quotedIncome,
              real: summary.realIncome,
              colorQ: "bg-green-200 dark:bg-green-900/40",
              colorR: "bg-green-500",
            },
            {
              label: "Custo",
              quoted: summary.quotedExpense,
              real: summary.realExpense,
              colorQ: "bg-red-200 dark:bg-red-900/40",
              colorR: "bg-red-400",
            },
          ].map(({ label, quoted, real, colorQ, colorR }) => {
            const max = Math.max(quoted, real, 1);
            return (
              <div key={label} className="space-y-2">
                {/* `gap-2`: sem folga, `justify-between` encosta os dois spans
                    quando o segundo ocupa a largura toda, e a tela lia
                    "ReceitaOrçado: R$ 186.500,00" — duas palavras coladas. */}
                <div className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span>Orçado: {brl(quoted)} · Real: {brl(real)}</span>
                </div>
                <div className="space-y-1">
                  <div className="h-2.5 rounded-full overflow-hidden bg-muted">
                    <div className={`h-full rounded-full ${colorQ}`} style={{ width: `${(quoted / max) * 100}%` }} />
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden bg-muted">
                    <div className={`h-full rounded-full ${colorR}`} style={{ width: `${(real / max) * 100}%` }} />
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className={`inline-block size-2 rounded-sm ${colorQ}`} />Orçado</span>
                  <span className="flex items-center gap-1"><span className={`inline-block size-2 rounded-sm ${colorR}`} />Real</span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Items table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25, ease: "easeOut" }}
        className="bg-card rounded-xl border border-border overflow-hidden"
      >
        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["all", "income", "expense"] as const).map((tab) => {
            const labels = { all: "Todos", income: "Receitas", expense: "Custos" };
            const counts = {
              all: items.length,
              income: items.filter((i) => i.type === "income").length,
              expense: items.filter((i) => i.type === "expense").length,
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-colors cursor-pointer",
                  activeTab === tab
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {labels[tab]}
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">{counts[tab]}</span>
              </button>
            );
          })}
        </div>

        {vazio === "filtro" ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma linha de {activeTab === "income" ? "receita" : "custo"} neste orçamento.{" "}
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className="cursor-pointer text-primary hover:underline"
            >
              Ver todos
            </button>
          </div>
        ) : vazio === "sem_dados" ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum item ainda.{" "}
            <button type="button" onClick={openAdd} className="text-primary hover:underline cursor-pointer">
              Adicionar agora
            </button>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-2 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border">
              <span>Descrição</span>
              <span className="w-24 text-right">Qtd. × Unit.</span>
              <span className="w-24 text-right">Total</span>
              <span className="w-16 text-right">Tipo</span>
              <span className="w-16" />
            </div>
            <AnimatePresence initial={false}>
              {filteredItems.map((item) => {
                const total = item.quantity * item.unitPrice;
                return (
                  <motion.div
                    key={item._id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-b border-border last:border-b-0"
                  >
                    <div className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={cn("size-2 rounded-full flex-shrink-0", item.type === "income" ? "bg-green-500" : "bg-red-400")} />
                          <p className="font-medium text-sm truncate">{item.description}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-4">{item.category}</p>
                      </div>
                      <div className="hidden sm:block text-xs text-muted-foreground text-right w-24">
                        {item.quantity} × {brl(item.unitPrice)}
                      </div>
                      <div className="text-sm font-semibold text-right w-24">
                        {brl(total)}
                      </div>
                      <div className="hidden sm:block w-16 text-right">
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full font-medium",
                          item.type === "income"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                        )}>
                          {item.type === "income" ? "Receita" : "Custo"}
                        </span>
                      </div>
                      <div className="flex gap-1 w-16 justify-end">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(item._id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Footer totals */}
            <div className="px-5 py-3 bg-muted/30 border-t border-border flex justify-end gap-6 text-sm">
              <span className="text-muted-foreground">
                Receitas: <strong className="text-green-600 dark:text-green-400">{brl(incomeTotal)}</strong>
              </span>
              <span className="text-muted-foreground">
                Custos: <strong className="text-red-500">{brl(expenseTotal)}</strong>
              </span>
              <span className="text-muted-foreground">
                Lucro: <strong className={incomeTotal - expenseTotal >= 0 ? "text-primary" : "text-red-500"}>{brl(incomeTotal - expenseTotal)}</strong>
              </span>
            </div>
          </>
        )}
      </motion.div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Item" : "Novo Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Type toggle */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["income", "expense"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                    form.type === t
                      ? t === "income" ? "bg-green-500 text-white" : "bg-red-400 text-white"
                      : "bg-background text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t === "income" ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {t === "income" ? "Receita" : "Custo"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input
                placeholder="Ex: Honorários de decoração"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="1"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Unitário (R$) *</Label>
                <Input
                  inputMode="decimal"
                  placeholder="1.500,00"
                  value={form.unitPrice}
                  onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                />
              </div>
            </div>

            {form.quantity && form.unitPrice && (
              <p className="text-xs text-muted-foreground text-right">
                Total:{" "}
                <strong>
                  {brl((valorDigitado(form.quantity) ?? 0) * (valorDigitado(form.unitPrice) ?? 0))}
                </strong>
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <AutoTextarea
                minRows={2}
                placeholder="Opcional"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="cursor-pointer">
              <X className="size-4" />
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="cursor-pointer gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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
