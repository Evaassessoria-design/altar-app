import { useMemo, useRef, useState } from "react";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
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
  ArrowRight,
  HandCoins,
  History,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { FluxoDaParcela, type EtapaDaParcela } from "@/components/financeiro/recebimentos.tsx";
import { reais } from "@/lib/recebimentos.ts";
import {
  COR_DA_SITUACAO,
  receitaDeEvento,
  rotuloDaSituacao,
  situacaoDoLancamento,
} from "@/lib/situacao-do-lancamento.ts";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { dataDoDiaNoFuso } from "@/convex/lib/dataDoDia.ts";
import { dicaDeTamanho } from "@/convex/lib/arquivos.ts";
import { Link, useSearchParams } from "react-router-dom";
import { nomeDoMes } from "@/lib/recorte-de-eventos.ts";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { RecebimentoDialog } from "@/components/financeiro/recebimento-dialog.tsx";
import {
  recebidoEmCentavos,
  saldoEmCentavos,
  usaRecebimentos,
  type Recebimento,
} from "@/convex/lib/pagamentosDoEvento.ts";
import {
  FORMAS_DE_PAGAMENTO,
  MIMES_DE_COMPROVANTE,
  TIPOS_DE_COMPROVANTE,
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

/** O que o Novo lançamento manda além do formulário. */
type ExtrasDoLancamento = {
  chave: string;
  anexo?: { storageId: Id<"_storage">; filename: string; contentType?: string };
  paidAt?: string;
  paymentMethod?: string;
};

function TxDialog({
  onClose,
  defaultValues,
  title,
  onSubmit,
  novo,
  receitaDeEvento,
  hoje,
}: {
  onClose: () => void;
  defaultValues?: Partial<TxFormValues>;
  title: string;
  /** `true` = gravou e pode fechar. `false` = falhou: o formulário fica. */
  onSubmit: (values: TxFormValues, extras: ExtrasDoLancamento) => Promise<boolean>;
  /** Novo lançamento: anexo, data e forma do pagamento. Edição: não. */
  novo?: boolean;
  /**
   * Receita de evento em edição: "Já recebido" não aparece — a baixa dela é
   * por recebimento, e o servidor recusa marcar à mão.
   */
  receitaDeEvento?: boolean;
  hoje: string;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TxFormValues>({
    resolver: zodResolver(txSchema),
    defaultValues: { type: "income", isPaid: true, ...defaultValues },
  });

  const txType = watch("type");
  const pago = watch("isPaid");
  // UMA chave por abertura: o diálogo monta a cada "Lançamento" (ver o pai), e
  // o reenvio depois de uma resposta perdida repete a mesma.
  const chave = useMemo(() => crypto.randomUUID(), []);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [forma, setForma] = useState("");
  const gerarUrl = useMutation(api.financeiro.generateUploadUrl);
  // Os mesmos tipos do diálogo de comprovantes: PDF e imagem.
  const { enviar, progresso } = useEnvioDeArquivo(gerarUrl, { tipo: "documento", aceitos: MIMES_DE_COMPROVANTE });
  // O arquivo subido não sobe de novo se a gravação falhar e ela tentar outra vez.
  const subido = useRef<{ nome: string; storageId: Id<"_storage">; contentType?: string } | null>(null);
  const emCurso = useRef(false);

  const submit = async (values: TxFormValues) => {
    if (emCurso.current) return;
    emCurso.current = true;
    try {
      let anexo: ExtrasDoLancamento["anexo"];
      if (novo && arquivo) {
        if (!subido.current || subido.current.nome !== arquivo.name) {
          const envio = await enviar(arquivo);
          if (!envio.ok) {
            toast.error(envio.motivo);
            return;
          }
          subido.current = { nome: arquivo.name, storageId: envio.storageId, contentType: arquivo.type || undefined };
        }
        anexo = { storageId: subido.current.storageId, filename: arquivo.name, contentType: subido.current.contentType };
      }
      const ok = await onSubmit(values, {
        chave,
        anexo,
        paidAt: novo && values.isPaid ? pagoEm : undefined,
        paymentMethod: novo && values.isPaid ? forma.trim() || undefined : undefined,
      });
      if (ok) onClose();
    } finally {
      emCurso.current = false;
    }
  };

  const enviandoArquivo = progresso !== null;

  return (
    <Dialog open onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
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
              <Label>Vencimento *</Label>
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

          {receitaDeEvento ? (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Receita de evento: o que entrou se registra por <strong>Registrar recebimento</strong>,
              no menu do lançamento — com data, forma e comprovante no histórico.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setValue("isPaid", !pago)}
                aria-pressed={pago}
                aria-label={txType === "income" ? "Já recebido" : "Já pago"}
                className={cn(
                  "size-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer",
                  pago ? "bg-primary border-primary" : "border-border",
                )}
              >
                {pago && <Check className="size-3 text-primary-foreground" />}
              </button>
              <Label className="cursor-pointer" onClick={() => setValue("isPaid", !pago)}>
                {txType === "income" ? "Já recebido" : "Já pago"}
              </Label>
            </div>
          )}

          {novo && pago && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tx-pago-em">{txType === "income" ? "Recebido em" : "Pago em"}</Label>
                <input
                  id="tx-pago-em"
                  type="date"
                  value={pagoEm}
                  onChange={(e) => setPagoEm(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-forma">Forma</Label>
                <input
                  id="tx-forma"
                  list="tx-formas"
                  value={forma}
                  onChange={(e) => setForma(e.target.value)}
                  placeholder="PIX, boleto..."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="tx-formas">
                  {FORMAS_DE_PAGAMENTO.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {novo && (
            <div className="space-y-1.5">
              {/* O rótulo diz o que o arquivo É. Pago: o comprovante. Pendente:
                  um documento (orçamento, boleto, nota) — e anexar NÃO confirma
                  pagamento nenhum (ver lib/comprovante-financeiro.ts). */}
              <Label htmlFor="tx-anexo">{pago ? "Comprovante (opcional)" : "Documento/anexo (opcional)"}</Label>
              <input
                id="tx-anexo"
                type="file"
                accept={TIPOS_DE_COMPROVANTE}
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  subido.current = null;
                }}
                className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm cursor-pointer"
              />
              {!pago && (
                <p className="text-[11px] text-muted-foreground">
                  Anexar não confirma pagamento: o lançamento continua pendente.
                </p>
              )}
              {enviandoArquivo && (
                <p className="text-[11px] text-muted-foreground" role="status">
                  Enviando arquivo… {Math.round((progresso ?? 0) * 100)}% — não feche esta janela.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">{dicaDeTamanho("documento")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <AutoTextarea minRows={2} placeholder="Notas adicionais..." {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? (enviandoArquivo ? "Enviando arquivo..." : "Salvando...") : "Salvar"}
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
  // Só os nomes, para a linha dizer de qual evento é o lançamento. A lista de
  // eventos de uma conta é curta e esta tela já a carregaria de qualquer jeito
  // se alguém filtrasse por evento.
  const eventos = useQuery(api.events.list, {});
  const nomeDoEvento = (id?: string) =>
    id ? (eventos ?? []).find((e) => e._id === id)?.name : undefined;
  // ?mes=AAAA-MM — o atalho da "Receita do Mês" do Dashboard. O servidor
  // valida e devolve o mês que de fato aplicou (`livro.mes`).
  const [params, setParams] = useSearchParams();
  const mesPedido = params.get("mes") ?? undefined;
  const livro = useQuery(api.financeiro.listTransactions, mesPedido ? { mes: mesPedido } : {});
  const mesDoLivro = livro?.mes ?? null;
  const recebido = useQuery(api.financeiro.recebidoNoMes, mesDoLivro ? { mes: mesDoLivro } : "skip");
  // A tela continua trabalhando com a lista; o que mudou é que ela agora SABE
  // quando o livro não coube inteiro, e diz. Ver `LIMITE_DO_LIVRO`.
  const transactions = livro?.itens;
  const livroCortado = livro?.temMais ?? false;
  // "Hoje" no fuso do NEGÓCIO, para a data padrão de recebimento e pagamento
  // (a mesma da aba Pagamentos da cliente).
  const hoje = dataDoDiaNoFuso(new Date(), livro?.fuso);
  const addTransaction = useMutation(api.financeiro.addTransaction);
  const updateTransaction = useMutation(api.financeiro.updateTransaction);
  const deleteTransaction = useMutation(api.financeiro.deleteTransaction);
  const togglePaid = useMutation(api.financeiro.togglePaid);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Doc<"transactions"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"transactions"> | null>(null);
  const [filter, setFilter] = useState<Filtro>("all");
  const [recebimento, setRecebimento] = useState<Doc<"transactions"> | null>(null);
  // As operações de recebimento da receita de evento — os MESMOS diálogos da
  // aba Pagamentos da cliente. Um aberto por vez.
  const [acao, setAcaoRaw] = useState<{ id: Id<"transactions">; etapa: EtapaDaParcela } | null>(null);
  const setAcao = (a: ({ id: Id<"transactions"> } & EtapaDaParcela) | null) =>
    setAcaoRaw(a ? { id: a.id, etapa: a } : null);
  // Sempre a linha ATUAL do livro: depois de registrar, o histórico reabre com
  // o recebimento novo, sem precisar recarregar.
  const linhaDe = (id: Id<"transactions">) => (transactions ?? []).find((t) => t._id === id);

  const handleCreate = async (values: TxFormValues, extras: ExtrasDoLancamento): Promise<boolean> => {
    try {
      const amount = valorDigitado(values.amount);
      // O zod já barrou acima; esta é a rede que impede um `NaN` de sair daqui
      // se alguém mexer no schema. Um `NaN` gravado estraga TODAS as somas.
      if (amount === null) {
        toast.error("Valor não reconhecido. Ex.: 1.500,00");
        return false;
      }
      await addTransaction({
        ...values,
        amount,
        notes: values.notes || undefined,
        ...extras,
      });
      toast.success(extras.anexo ? "Lançamento adicionado com o anexo." : "Lançamento adicionado!");
      return true;
    } catch (e) {
      // Falhou: o diálogo continua aberto com tudo preenchido (e o arquivo já
      // subido não sobe de novo).
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Erro ao salvar lançamento");
      return false;
    }
  };

  const handleEdit = async (values: TxFormValues): Promise<boolean> => {
    if (!editing) return false;
    try {
      const amount = valorDigitado(values.amount);
      if (amount === null) {
        toast.error("Valor não reconhecido. Ex.: 1.500,00");
        return false;
      }
      await updateTransaction({
        id: editing._id,
        ...values,
        amount,
        notes: values.notes || undefined,
      });
      toast.success("Lançamento atualizado!");
      setEditing(null);
      return true;
    } catch (e) {
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Erro ao atualizar lançamento");
      return false;
    }
  };

  const alternarPago = async (tx: Doc<"transactions">) => {
    try {
      await togglePaid({ id: tx._id });
    } catch (e) {
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível mudar o status.");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTransaction({ id: deleting._id });
      toast.success("Lançamento excluído.");
      setDeleting(null);
    } catch (e) {
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Erro ao excluir lançamento");
    }
  };

  const filtered = (transactions ?? []).filter((t) =>
    filter === "sem_comprovante" ? pagoSemComprovante(t) : filter === "all" || t.type === filter,
  );
  // A pergunta da decoradora: "o que eu já dei baixa e ainda não tenho o
  // documento?". Vale para os dois lados do livro — a nota do fornecedor pago
  // é o que a contabilidade cobra, e durante um tempo ela ficou fora desta
  // conta. Contada sobre o livro INTEIRO, não sobre o recorte aberto: senão o
  // número mudaria conforme o filtro e deixaria de responder.
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

      {/* ── QUANDO O LIVRO NÃO COUBE INTEIRO ──────────────────────────────────
          Um saldo apresentado como total da empresa, calculado sobre parte do
          livro, é a mentira mais cara que esta tela pode contar. A tela diz o
          recorte em vez de afirmar um número que não conferiu — mesma regra
          que `supplierCatalog.panorama` já segue quando não consegue somar. */}
      {summary?.incompleto && (
        <p className="text-xs text-muted-foreground border-l-2 border-amber-400 pl-2.5 leading-snug">
          Os totais acima consideram os <strong>{summary.limite} lançamentos mais
          recentes</strong>. Seu histórico é maior que isso.
        </p>
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
        {/* O RECORTE DO MÊS. Em cima, o dinheiro que ENTROU no mês — as
            mesmas entradas que fazem a "Receita do Mês" do Dashboard
            (`financeiro.recebidoNoMes`, lib/receitaDoMes.ts), uma a uma, para
            a soma ser conferível. Embaixo, os lançamentos com VENCIMENTO no
            mês: outra pergunta, e o aviso diz qual é qual. */}
        {mesDoLivro && transactions && (
          <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm space-y-2">
            {/* No celular o botão desce: ao lado, espremia a explicação numa
                coluna de três palavras por linha. */}
            <div className="flex flex-col sm:flex-row items-start gap-1 sm:gap-2">
              <p className="flex-1">
                <strong>Recebido em {nomeDoMes(mesDoLivro)}:</strong>{" "}
                {recebido ? reais(recebido.totalCentavos) : "…"}
                <span className="block text-xs text-muted-foreground">
                  É a Receita do Mês do Dashboard: cada recebimento na data em que entrou (parciais
                  inclusive, anulados fora) e, nos lançamentos antigos sem histórico, a data do
                  pagamento — ou o vencimento, quando ela não foi registrada.
                </span>
              </p>
              <button
                onClick={() => setParams({})}
                className="text-xs text-primary hover:underline cursor-pointer min-h-9 px-1"
              >
                Ver todos os meses
              </button>
            </div>
            {recebido && recebido.entradas.length > 0 && (
              <ul className="space-y-1 border-t border-primary/20 pt-2">
                {recebido.entradas.map((e, i) => (
                  <li key={`${e.transacaoId}-${e.data}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium text-foreground">{reais(e.valorCentavos)}</span>
                    <span>{formatDateInput(e.data)}</span>
                    <span className="truncate">{e.descricao}</span>
                    {nomeDoEvento(e.eventId) && <span className="text-muted-foreground truncate">· {nomeDoEvento(e.eventId)}</span>}
                    {e.forma && <span className="text-muted-foreground">· {e.forma}</span>}
                    {e.origem === "baixa_sem_historico" && (
                      <span className="text-muted-foreground">· baixa antiga, sem histórico</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground border-t border-primary/20 pt-2">
              Abaixo: lançamentos com <strong>vencimento</strong> em {nomeDoMes(mesDoLivro)}. Despesas
              pagas: {fmt(transactions.filter((t) => t.type === "expense" && t.isPaid).reduce((a, t) => a + t.amount, 0))}
              {livroCortado && " (há mais lançamentos neste mês além dos carregados)"}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold">
            Lançamentos
            {/* A tela nunca afirma o que não sabe. Com o livro cortado, "142"
                seria um total; "142 carregados (há mais)" é o que ela viu. */}
            {livroCortado && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {transactions?.length} carregados (há mais)
              </span>
            )}
          </h2>
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
            {filtered.map((tx) => {
              const deEvento = receitaDeEvento(tx);
              const situacao = situacaoDoLancamento(tx);
              const saldo = tx.type === "income" ? saldoEmCentavos(tx) : 0;
              const nComprovantes = tx.comprovantes?.length ?? 0;
              const protegida = usaRecebimentos(tx);
              return (
              <div
                key={tx._id}
                className={cn(
                  "bg-card border border-border rounded-xl px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3",
                  situacao === "pendente" && "opacity-80",
                )}
              >
                {/* AÇÃO PRINCIPAL. Receita de evento: registrar recebimento (ou
                    ver o histórico, se quitada) — nunca a baixa direta, que o
                    servidor recusa. Despesa e receita avulsa: a baixa de sempre. */}
                <button
                  onClick={() =>
                    deEvento
                      ? setAcao({ tipo: saldo > 0 ? "receber" : "detalhes", id: tx._id })
                      : void alternarPago(tx)
                  }
                  title={
                    deEvento
                      ? saldo > 0 ? "Registrar recebimento" : "Ver detalhes da parcela"
                      : tx.isPaid ? (tx.type === "income" ? "Desmarcar recebido" : "Desmarcar pago") : (tx.type === "income" ? "Marcar como recebido" : "Marcar como pago")
                  }
                  aria-label={`${deEvento ? (saldo > 0 ? "Registrar recebimento" : "Detalhes da parcela") : "Alternar pago"} — ${tx.description}`}
                  className={cn(
                    "size-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors",
                    tx.type === "income"
                      ? situacao === "recebido" ? "bg-green-100 dark:bg-green-900/30 text-green-600" : situacao === "parcial" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700" : "bg-muted text-muted-foreground"
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
                  {/* A PARCELA SE ABRE PELO TEXTO, em qualquer situação — pendente,
                      parcial, recebida ou atrasada. Receita de evento: os
                      detalhes (valor, vencimento, histórico, comprovantes,
                      ações). Os demais: pagamento e comprovantes. `div` com
                      role de botão porque o bloco tem parágrafos; o atalho
                      "Ver em Pagamentos da cliente" fica FORA, sem link dentro
                      de botão. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir ${tx.description}`}
                    onClick={() => (deEvento ? setAcao({ tipo: "detalhes", id: tx._id }) : setRecebimento(tx))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (deEvento) setAcao({ tipo: "detalhes", id: tx._id });
                        else setRecebimento(tx);
                      }
                    }}
                    className="-mx-1 px-1 rounded-md cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium truncate max-w-full">{tx.description}</p>
                      {/* A SITUAÇÃO, sempre dita: Recebido/Pago, Pendente ou
                          Parcial. "Pendente" para uma parcela com R$ 1.200 de
                          R$ 3.000 já recebidos contradiria a aba do evento. */}
                      <span className={cn("flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full", COR_DA_SITUACAO[situacao])}>
                        {rotuloDaSituacao(tx.type, situacao)}
                      </span>
                    </div>
                    {/* No celular o valor vem aqui, sob a descrição: ao lado, ele e
                        as ações espremiam o texto até "Parcela …". */}
                    <p
                      className={cn(
                        "sm:hidden font-bold text-sm",
                        tx.type === "income" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400",
                      )}
                    >
                      {tx.type === "expense" ? "- " : "+ "}
                      {fmt(tx.amount)}
                    </p>
                    {situacao === "parcial" && (
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        Recebido {reais(recebidoEmCentavos(tx))} · falta {reais(saldo)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{tx.category}</span>
                      <span>·</span>
                      {/* Pago tem DUAS datas, e elas são perguntas diferentes:
                          `date` é o vencimento, `paidAt` é quando entrou. A linha
                          mostra a que importa naquele estado. */}
                      <span>
                        {tx.isPaid && tx.paidAt
                          ? `${tx.type === "income" ? "recebido" : "pago"} em ${formatDateInput(tx.paidAt)}`
                          : `vence ${formatDateInput(tx.date)}`}
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
                      {/* ── DE QUAL EVENTO É ESTE DINHEIRO ──────────────────
                          `transactions.eventId` é gravado desde sempre — pelo
                          import do contrato e pelo lançamento de uma compra — e
                          esta tela nunca o mostrava. O livro-caixa de uma
                          decoradora com quatro casamentos no mês era uma lista
                          plana em que "Sinal" aparecia quatro vezes, idêntico. */}
                      {nomeDoEvento(tx.eventId) && (
                        <>
                          <span>·</span>
                          <span className="truncate">{nomeDoEvento(tx.eventId)}</span>
                        </>
                      )}
                      {/* ── E DE QUAL COMPRA ────────────────────────────────
                          Procedência histórica, gravada no lançamento. Sobrevive
                          ao cancelamento da compra e à exclusão dela — que é
                          justamente quando ninguém mais conseguia dizer de onde
                          os R$ 12.400 tinham vindo. */}
                      {tx.origemDaCompra && (
                        <>
                          <span>·</span>
                          <span className="truncate">
                            da compra &ldquo;{tx.origemDaCompra.nome}&rdquo;
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Parcela com recebimentos é histórico financeiro: o servidor
                      recusa excluí-la (`deleteTransaction`), e o item do menu
                      fica desativado. A linha diz POR QUÊ e aponta onde os
                      registros são consultados e corrigidos — opção apagada
                      sem explicação parece defeito. */}
                  {protegida && (
                    <p
                      id={`protegida-${tx._id}`}
                      className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1"
                    >
                      <span>Tem recebimentos registrados: não pode ser excluída.</span>
                      {tx.eventId && (
                        <Link
                          to={`/eventos/${tx.eventId}/pagamentos`}
                          className="inline-flex items-center gap-0.5 text-primary hover:underline min-h-6"
                        >
                          Ver em Pagamentos da cliente <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </p>
                  )}
                </div>
                <div className="hidden sm:block text-right flex-shrink-0">
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
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {/* O COMPROVANTE À VISTA: o clipe com a contagem abre a lista
                      para ver, baixar ou anexar — sem coluna nova na linha. */}
                  <button
                    onClick={() => setRecebimento(tx)}
                    aria-label={`Comprovantes e anexos de ${tx.description}`}
                    title={contagemDeComprovantes(nComprovantes) ?? "Anexar comprovante ou documento"}
                    className={cn(
                      "h-9 min-w-9 px-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer inline-flex items-center justify-center gap-0.5 text-xs",
                      nComprovantes > 0 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Paperclip className="size-3.5" />
                    {nComprovantes > 0 && <span>{nComprovantes}</span>}
                  </button>
                  {/* AÇÕES SECUNDÁRIAS num menu: no celular, quatro ícones
                      lado a lado não cabem com o valor e a descrição. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label={`Ações de ${tx.description}`}
                        className="size-9 rounded-lg hover:bg-accent transition-colors cursor-pointer inline-flex items-center justify-center text-muted-foreground"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      {deEvento && saldo > 0 && (
                        <DropdownMenuItem onSelect={() => setAcao({ tipo: "receber", id: tx._id })}>
                          <HandCoins className="size-4" /> Registrar recebimento
                        </DropdownMenuItem>
                      )}
                      {deEvento && (
                        <DropdownMenuItem onSelect={() => setAcao({ tipo: "detalhes", id: tx._id })}>
                          <History className="size-4" /> Detalhes e histórico
                        </DropdownMenuItem>
                      )}
                      {!deEvento && !protegida && (
                        <DropdownMenuItem onSelect={() => void alternarPago(tx)}>
                          <Check className="size-4" />
                          {tx.isPaid
                            ? tx.type === "income" ? "Desmarcar recebido" : "Desmarcar pago"
                            : tx.type === "income" ? "Marcar como recebido" : "Marcar como pago"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => setRecebimento(tx)}>
                        <Paperclip className="size-4" /> Comprovantes e anexos
                      </DropdownMenuItem>
                      {tx.eventId && (
                        <DropdownMenuItem asChild>
                          <Link to={`/eventos/${tx.eventId}/pagamentos`}>
                            <ArrowRight className="size-4" /> Abrir no evento
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setEditing(tx)}>
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeleting(tx)}
                        aria-label={`Excluir ${tx.description}`}
                        // Mesma regra do servidor: com recebimentos, não se exclui.
                        disabled={usaRecebimentos(tx)}
                        aria-describedby={usaRecebimentos(tx) ? `protegida-${tx._id}` : undefined}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        {protegida ? "Excluir (tem recebimentos)" : "Excluir"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              );
            })}
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

      {/* Monta a cada abertura: a chave do formulário é nova a cada lançamento. */}
      {creating && (
        <TxDialog onClose={() => setCreating(false)} title="Novo Lançamento" onSubmit={handleCreate} novo hoje={hoje} />
      )}

      {/* Os detalhes e as ações da parcela — o MESMO fluxo da aba do evento
          (FluxoDaParcela). A linha é procurada a cada render: depois de
          receber ou anular, os detalhes mostram o resultado. */}
      {acao && linhaDe(acao.id) && (
        <FluxoDaParcela
          parcela={linhaDe(acao.id)!}
          etapa={acao.etapa}
          hoje={hoje}
          onEtapa={(e) => setAcaoRaw(e ? { id: acao.id, etapa: e } : null)}
        />
      )}

      {editing && (
        <TxDialog
          onClose={() => setEditing(null)}
          title="Editar Lançamento"
          hoje={hoje}
          receitaDeEvento={editing.type === "income" && !!editing.eventId}
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
