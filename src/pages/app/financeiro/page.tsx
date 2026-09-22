import { useState } from "react";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Check,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { RecebimentoDialog } from "@/components/financeiro/recebimento-dialog.tsx";
import {
  contagemDeComprovantes,
  pagoSemComprovante,
  temComprovante,
} from "@/lib/comprovante-financeiro.ts";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { formatDateInput } from "@/lib/event-date.ts";
import { paraOCampo, valorDigitado } from "@/lib/valor-digitado.ts";
import { ptBR } from "date-fns/locale";
import { motivoDaListaVazia } from "@/lib/lista-vazia.ts";

const INCOME_CATEGORIES = [
  "Honorários",
  "Sinal",
  "Saldo",
  "Extras",
  "Reembolso",
  "Outros",
];

const EXPENSE_CATEGORIES = [
  "Flores",
  "Tecidos",
  "Móveis",
  "Iluminação",
  "Transporte",
  "Bolo e Doces",
  "Equipe",
  "Marketing",
  "Materiais",
  "Outros",
];

const txSchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1, "Categoria obrigatória"),
  description: z.string().min(1, "Descrição obrigatória"),
  // Validar aqui, e não só no submit, faz o erro aparecer NO CAMPO. A regra
  // de leitura é de `valor-digitado.ts`: "1.500,00" é mil e quinhentos, e era
  // o jeito de digitar que `parseFloat` transformava em um real e cinquenta.
  amount: z
    .string()
    .min(1, "Valor obrigatório")
    .refine((t) => valorDigitado(t) !== null, "Valor não reconhecido. Ex.: 1.500,00")
    .refine((t) => (valorDigitado(t) ?? -1) >= 0, "O valor não pode ser negativo"),
  date: z.string().min(1, "Data obrigatória"),
  isPaid: z.boolean(),
  notes: z.string().optional(),
});

type TxFormValues = z.infer<typeof txSchema>;

function TxDialog({
  open,
  onClose,
  defaultValues,
  title,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<TxFormValues>;
  title: string;
  onSubmit: (values: TxFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TxFormValues>({
    resolver: zodResolver(txSchema),
    defaultValues: { type: "income", isPaid: true, ...defaultValues },
  });

  const txType = watch("type");

  const submit = async (values: TxFormValues) => {
    await onSubmit(values);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
          {/* Type toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setValue("type", t)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium transition-colors cursor-pointer",
                  txType === t
                    ? t === "income"
                      ? "bg-green-500 text-white"
                      : "bg-red-500 text-white"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {t === "income" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>
          <input type="hidden" {...register("type")} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <select
                {...register("category")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                {(txType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" {...register("date")} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input placeholder="Ex: Contrato de decoração — Aniversário Helena" {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Valor (R$) *</Label>
            {/* `inputMode="decimal"` e não `type="number"`: com campo
                numérico, o que `value` devolve para "1.500,00" depende do
                navegador e do idioma do sistema. */}
            <Input inputMode="decimal" placeholder="1.500,00" {...register("amount")} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setValue("isPaid", !watch("isPaid"))}
              className={cn(
                "size-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer",
                watch("isPaid") ? "bg-primary border-primary" : "border-border",
              )}
            >
              {watch("isPaid") && <Check className="size-3 text-primary-foreground" />}
            </button>
            <Label className="cursor-pointer" onClick={() => setValue("isPaid", !watch("isPaid"))}>
              {txType === "income" ? "Já recebido" : "Já pago"}
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <AutoTextarea minRows={2} placeholder="Notas adicionais..." {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Filtro = "all" | "income" | "expense" | "sem_comprovante";

const FILTROS: readonly Filtro[] = ["all", "income", "expense", "sem_comprovante"];

const ROTULO_DO_FILTRO: Record<Filtro, string> = {
  all: "Todos",
  income: "Receitas",
  expense: "Despesas",
  sem_comprovante: "Sem comprovante",
};

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  colorClass,
  subLabel,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  colorClass: string;
  subLabel?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <div className={cn("size-8 rounded-lg flex items-center justify-center", colorClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-xl font-bold">{fmt(value)}</p>
      {subLabel && <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>}
    </div>
  );
}

export default function FinanceiroPage() {
  const summary = useQuery(api.financeiro.getSummary);
  const transactions = useQuery(api.financeiro.listTransactions, {});
  const addTransaction = useMutation(api.financeiro.addTransaction);
  const updateTransaction = useMutation(api.financeiro.updateTransaction);
  const deleteTransaction = useMutation(api.financeiro.deleteTransaction);
  const togglePaid = useMutation(api.financeiro.togglePaid);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Doc<"transactions"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"transactions"> | null>(null);
  const [filter, setFilter] = useState<Filtro>("all");
  const [recebimento, setRecebimento] = useState<Doc<"transactions"> | null>(null);

  const handleCreate = async (values: TxFormValues) => {
    try {
      const amount = valorDigitado(values.amount);
      // O zod já barrou acima; esta é a rede que impede um `NaN` de sair daqui
      // se alguém mexer no schema. Um `NaN` gravado estraga TODAS as somas.
      if (amount === null) {
        toast.error("Valor não reconhecido. Ex.: 1.500,00");
        return;
      }
      await addTransaction({
        ...values,
        amount,
        notes: values.notes || undefined,
      });
      toast.success("Lançamento adicionado!");
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao salvar lançamento");
    }
  };

  const handleEdit = async (values: TxFormValues) => {
    if (!editing) return;
    try {
      const amount = valorDigitado(values.amount);
      if (amount === null) {
        toast.error("Valor não reconhecido. Ex.: 1.500,00");
        return;
      }
      await updateTransaction({
        id: editing._id,
        ...values,
        amount,
        notes: values.notes || undefined,
      });
      toast.success("Lançamento atualizado!");
      setEditing(null);
    } catch (e) {
      toast.error("Erro ao atualizar lançamento");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTransaction({ id: deleting._id });
      toast.success("Lançamento excluído.");
      setDeleting(null);
    } catch (e) {
      toast.error("Erro ao excluir lançamento");
    }
  };

  const filtered = (transactions ?? []).filter((t) =>
    filter === "sem_comprovante" ? pagoSemComprovante(t) : filter === "all" || t.type === filter,
  );
  // A pergunta da decoradora: "quais recebimentos eu já dei baixa e ainda não
  // tenho o documento?". Contada sobre o livro INTEIRO, não sobre o recorte
  // aberto — senão o número mudaria conforme o filtro e deixaria de responder.
  const semComprovante = (transactions ?? []).filter(pagoSemComprovante).length;
  // "Não há lançamento nenhum" e "este recorte não tem lançamento" são coisas
  // diferentes, e a tela dizia a primeira nas duas situações — com 200 linhas
  // no livro e o filtro em "Receitas", ela convidava a cadastrar o primeiro.
  const vazia = motivoDaListaVazia((transactions ?? []).length, filtered.length);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de receitas e despesas</p>
        </div>
        <Button onClick={() => setCreating(true)} className="cursor-pointer gap-2">
          <Plus className="size-4" /> Lançamento
        </Button>
      </div>

      {/* Summary cards */}
      {summary === undefined ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Receitas"
            value={summary.totalIncome}
            icon={TrendingUp}
            colorClass="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
          />
          <SummaryCard
            label="Despesas"
            value={summary.totalExpense}
            icon={TrendingDown}
            colorClass="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
          />
          <SummaryCard
            label="Lucro"
            value={summary.profit}
            icon={DollarSign}
            colorClass="bg-primary/10 text-primary"
          />
          <SummaryCard
            label="A Receber"
            value={summary.pendingIncome}
            icon={Clock}
            colorClass="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
          />
        </div>
      )}

      {/* Chart */}
      {summary !== undefined && summary.months.some((m) => m.income > 0 || m.expense > 0) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-4 text-sm">Últimos 6 meses</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.months} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: unknown) =>
                  typeof value === "number" ? [fmt(value)] : [String(value ?? "")]
                }
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Receitas" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Despesas" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Transaction list */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold">Lançamentos</h2>
          <div className="flex gap-2">
            {FILTROS.map((f) => {
              // O recorte de comprovante só existe quando há o que cobrar: um
              // botão que sempre leva a "nenhum lançamento" é ruído.
              if (f === "sem_comprovante" && semComprovante === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex items-center justify-center min-h-9 sm:min-h-0 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {ROTULO_DO_FILTRO[f]}
                  {f === "sem_comprovante" && ` (${semComprovante})`}
                </button>
              );
            })}
          </div>
        </div>

        {transactions === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : vazia === "filtro" ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><DollarSign /></EmptyMedia>
              <EmptyTitle>Nenhum lançamento neste filtro</EmptyTitle>
              <EmptyDescription>
                Você tem {(transactions ?? []).length} lançamento
                {(transactions ?? []).length === 1 ? "" : "s"} no livro — nenhum deles é{" "}
                {filter === "income" ? "receita" : "despesa"}.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFilter("all")}
                className="cursor-pointer"
              >
                Ver todos
              </Button>
            </EmptyContent>
          </Empty>
        ) : vazia === "sem_dados" ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><DollarSign /></EmptyMedia>
              <EmptyTitle>Nenhum lançamento</EmptyTitle>
              <EmptyDescription>Adicione receitas e despesas para controlar seu financeiro</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => setCreating(true)} className="cursor-pointer">
                <Plus className="size-4 mr-1" /> Adicionar Lançamento
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <div
                key={tx._id}
                className={cn(
                  "bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3",
                  !tx.isPaid && "opacity-70",
                )}
              >
                <button
                  onClick={() => togglePaid({ id: tx._id })}
                  className={cn(
                    "size-8 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors",
                    tx.type === "income"
                      ? tx.isPaid ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-muted text-muted-foreground"
                      : tx.isPaid ? "bg-red-100 dark:bg-red-900/30 text-red-500" : "bg-muted text-muted-foreground",
                  )}
                >
                  {tx.type === "income" ? (
                    <TrendingUp className="size-4" />
                  ) : (
                    <TrendingDown className="size-4" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    {!tx.isPaid && (
                      <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">
                        Pendente
                      </span>
                    )}
                    {/* Discreto de propósito: quem tem o documento não precisa
                        de alarde, e quem não tem precisa de um lembrete, não
                        de uma acusação. Só em RECEITA — despesa ainda não
                        aceita comprovante, e o selo prometeria o que não há. */}
                    {temComprovante(tx) && (
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                        <Paperclip className="inline size-3" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{tx.category}</span>
                    <span>·</span>
                    {/* Pago tem DUAS datas, e elas são perguntas diferentes:
                        `date` é o vencimento, `paidAt` é quando entrou. A linha
                        mostra a que importa naquele estado. */}
                    <span>
                      {tx.isPaid && tx.paidAt
                        ? `recebido em ${formatDateInput(tx.paidAt)}`
                        : formatDateInput(tx.date)}
                    </span>
                    {tx.isPaid && tx.paymentMethod && (
                      <>
                        <span>·</span>
                        <span className="truncate">{tx.paymentMethod}</span>
                      </>
                    )}
                    {pagoSemComprovante(tx) && (
                      <>
                        <span>·</span>
                        <span className="text-amber-700 dark:text-amber-500">sem comprovante</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className={cn(
                      "font-bold text-sm",
                      tx.type === "income" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400",
                    )}
                  >
                    {tx.type === "expense" ? "- " : "+ "}
                    {fmt(tx.amount)}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {/* Progressive disclosure: pagamento e comprovantes moram no
                      diálogo, não no card. Cinquenta lançamentos com seis
                      campos cada seriam uma tela impossível de ler. */}
                  <button
                    onClick={() => setRecebimento(tx)}
                    aria-label={`Pagamento e comprovantes de ${tx.description}`}
                    title={contagemDeComprovantes(tx.comprovantes?.length ?? 0) ?? "Pagamento e comprovantes"}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                  >
                    <Paperclip className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setEditing(tx)}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleting(tx)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {recebimento && (
        <RecebimentoDialog
          key={recebimento._id}
          lancamento={
            (transactions ?? []).find((t) => t._id === recebimento._id) ?? recebimento
          }
          onClose={() => setRecebimento(null)}
        />
      )}

      <TxDialog open={creating} onClose={() => setCreating(false)} title="Novo Lançamento" onSubmit={handleCreate} />

      {editing && (
        <TxDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar Lançamento"
          defaultValues={{
            type: editing.type,
            category: editing.category,
            description: editing.description,
            // Na escrita daqui: "1.500,50", e não "1500.5".
            amount: paraOCampo(editing.amount),
            date: editing.date,
            isPaid: editing.isPaid,
            notes: editing.notes,
          }}
          onSubmit={handleEdit}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.description}" será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
