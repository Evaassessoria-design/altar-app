import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Paperclip, Download, Trash2, Check, Loader2, ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { formatDateInput } from "@/lib/event-date.ts";
import {
  FORMAS_DE_PAGAMENTO,
  MIMES_DE_COMPROVANTE,
  TIPOS_DE_COMPROVANTE,
} from "@/lib/comprovante-financeiro.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O RECEBIMENTO, ABERTO
//
// ── POR QUE UM DIÁLOGO, E NÃO CAMPOS NO CARD ────────────────────────────────
// A linha do Financeiro é lida de relance — descrição, valor, vencimento. Pôr
// data de pagamento, forma, observação e lista de anexos ali dentro faria cada
// lançamento ocupar meia tela, e são cinquenta lançamentos num casamento.
//
// Aqui dentro cabem as duas coisas que a linha não comporta, e elas ficam
// SEPARADAS de propósito: o pagamento tem o próprio botão de salvar, o
// comprovante é anexado na hora. Anexar não dá baixa; dar baixa não exige
// anexo. Ver `lib/comprovante-financeiro.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RecebimentoDialog({
  lancamento,
  onClose,
}: {
  lancamento: Doc<"transactions">;
  onClose: () => void;
}) {
  const comprovantes = useQuery(api.financeiro.comprovantesDoLancamento, {
    id: lancamento._id,
  });
  const gerarUrl = useMutation(api.financeiro.generateUploadUrl);
  const registrarPagamento = useMutation(api.financeiro.registrarPagamento);
  const anexar = useMutation(api.financeiro.anexarComprovante);
  const remover = useMutation(api.financeiro.removerComprovante);

  const { enviar, enviando } = useEnvioDeArquivo(gerarUrl, {
    tipo: "documento",
    aceitos: MIMES_DE_COMPROVANTE,
  });

  // ── O MESMO DIÁLOGO, AS PALAVRAS CERTAS ──────────────────────────────
  // Receita e despesa respondem a mesma pergunta — entrou ou saiu, quando,
  // como, e qual documento prova — mas ninguém diz "recebi" de uma compra de
  // flores. Um componente só, um vocabulário por tipo: duplicar a tela para
  // trocar duas palavras faria as duas divergirem na primeira correção.
  const despesa = lancamento.type === "expense";
  const VERBO = despesa ? "Pago" : "Recebido";

  const [pago, setPago] = useState(lancamento.isPaid);
  const [pagoEm, setPagoEm] = useState(lancamento.paidAt ?? "");
  const [forma, setForma] = useState(lancamento.paymentMethod ?? "");
  const [observacao, setObservacao] = useState(lancamento.notes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const salvarPagamento = async () => {
    setSalvando(true);
    try {
      // `null` LIMPA — `undefined` sumiria no transporte e apagar a data
      // falharia em silêncio, com a tela dizendo "salvo".
      await registrarPagamento({
        id: lancamento._id,
        isPaid: pago,
        paidAt: pagoEm.trim() || null,
        paymentMethod: forma.trim() || null,
        notes: observacao.trim() || null,
      });
      toast.success("Pagamento atualizado.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível salvar o pagamento.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const anexarArquivo = async (file: File) => {
    const r = await enviar(file);
    if (!r.ok) {
      toast.error(r.motivo);
      return;
    }
    try {
      // Anexar NÃO toca em `isPaid`. A mutation é outra de propósito.
      await anexar({
        id: lancamento._id,
        storageId: r.storageId,
        filename: file.name,
        contentType: file.type || undefined,
      });
      toast.success("Comprovante anexado.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível anexar o comprovante.",
      );
    }
  };

  const removerArquivo = async (storageId: Id<"_storage">) => {
    setRemovendo(storageId);
    try {
      await remover({ id: lancamento._id, storageId });
      toast.success("Comprovante removido.");
    } catch {
      toast.error("Não foi possível remover o comprovante.");
    } finally {
      setRemovendo(null);
    }
  };

  const lista = comprovantes ?? [];

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          {/* `break-words`: descrição é texto livre e "Parcela 3/10 — entrada
              da cerimônia" não pode estourar num telefone de 320px. */}
          <DialogTitle className="break-words">{lancamento.description}</DialogTitle>
          <DialogDescription>
            {fmt(lancamento.amount)} · vencimento {formatDateInput(lancamento.date)}
          </DialogDescription>
        </DialogHeader>

        {/* ── O PAGAMENTO ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={pago}
              onChange={(e) => setPago(e.target.checked)}
              className="size-4 cursor-pointer accent-primary"
            />
            <span className="text-sm font-medium">{VERBO}</span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="pago-em" className="text-xs font-medium">
                {VERBO} em
              </label>
              <input
                id="pago-em"
                type="date"
                value={pagoEm}
                onChange={(e) => setPagoEm(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="forma" className="text-xs font-medium">
                Forma
              </label>
              {/* Texto livre com sugestão: a leitura de contrato por IA já
                  produz este campo como texto, e lista fechada deixaria de
                  fora "permuta" e "cheque". */}
              <input
                id="forma"
                type="text"
                list="formas-de-pagamento"
                value={forma}
                onChange={(e) => setForma(e.target.value)}
                placeholder="PIX, transferência..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="formas-de-pagamento">
                {FORMAS_DE_PAGAMENTO.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="obs-pagamento" className="text-xs font-medium">
              Observação
            </label>
            <Textarea
              id="obs-pagamento"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={
                despesa
                  ? "Pago na entrega, nota enviada por e-mail..."
                  : "Recebido em duas transferências, recibo enviado por e-mail..."
              }
              rows={2}
            />
          </div>

          <Button
            size="sm"
            onClick={() => void salvarPagamento()}
            disabled={salvando}
            className="w-full cursor-pointer gap-1.5"
          >
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Salvar pagamento
          </Button>
        </div>

        {/* ── OS COMPROVANTES ─────────────────────────────────────────── */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Comprovantes
          </p>

          {comprovantes === undefined ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum comprovante anexado. Anexar não marca como{" "}
              {VERBO.toLowerCase()} — são coisas diferentes.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lista.map((c) => (
                <li
                  key={c.storageId}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <Paperclip className="size-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs">{c.filename}</span>
                  {/* URL ausente = arquivo removido do storage. Não desenha
                      link quebrado. */}
                  {c.url && (
                    <>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Visualizar ${c.filename}`}
                        className="flex size-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                      <a
                        href={c.url}
                        download={c.filename}
                        aria-label={`Baixar ${c.filename}`}
                        className="flex size-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                      >
                        <Download className="size-3.5" />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void removerArquivo(c.storageId)}
                    disabled={removendo === c.storageId}
                    aria-label={`Remover ${c.filename}`}
                    className="flex size-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-destructive dark:hover:bg-red-900/20"
                  >
                    {removendo === c.storageId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="block">
            <input
              type="file"
              accept={TIPOS_DE_COMPROVANTE}
              className="sr-only"
              disabled={enviando}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void anexarArquivo(file);
              }}
            />
            <span className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent">
              {enviando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              Adicionar comprovante
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground">PDF ou imagem, até 10 MB.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
