import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ExternalLink, HandCoins, Paperclip } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { FORMAS_DE_PAGAMENTO, MIMES_DE_COMPROVANTE, TIPOS_DE_COMPROVANTE } from "@/lib/comprovante-financeiro.ts";
import { formatDateInput } from "@/lib/event-date.ts";
import { valorDigitado } from "@/lib/valor-digitado.ts";
import { cn } from "@/lib/utils.ts";
import { campo, mensagem, novaChave, reais } from "@/lib/recebimentos.ts";
import {
  dataValida,
  deCentavos,
  paraCentavos,
  saldoEmCentavos,
  type Recebimento,
} from "@/convex/lib/pagamentosDoEvento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RECEBIMENTOS — OS MESMOS DIÁLOGOS NA ABA DO EVENTO E NO FINANCEIRO GERAL
//
// Registrar recebimento, anular, ver o histórico e anexar comprovante a um
// recebimento já registrado. Moravam só na aba "Pagamentos da cliente"; agora
// o Financeiro geral usa os mesmos componentes, as mesmas mutations e as
// mesmas regras (lib/pagamentosDoEvento.ts). Um recebimento feito numa tela é
// a mesma linha na outra — não há segundo cadastro.
// ─────────────────────────────────────────────────────────────────────────────

/** O mínimo de uma parcela para receber: a linha de `transactions` serve. */
export type ParcelaParaReceber = {
  _id: Id<"transactions">;
  description: string;
  amount: number;
  date: string;
  isPaid: boolean;
  paymentMethod?: string;
  recebimentos?: readonly Recebimento[];
};


export function RegistrarRecebimento({
  parcela,
  hoje,
  onClose,
}: {
  parcela: ParcelaParaReceber;
  hoje: string;
  onClose: () => void;
}) {
  const registrar = useMutation(api.financeiro.registrarRecebimento);
  const gerarUrl = useMutation(api.financeiro.generateUploadUrl);
  const { enviar, progresso } = useEnvioDeArquivo(gerarUrl, { tipo: "documento", aceitos: MIMES_DE_COMPROVANTE });
  const saldo = saldoEmCentavos(parcela);
  // UMA chave por abertura: clicar de novo, ou a rede reenviar, repete a
  // mesma — e o servidor devolve o recebimento que já gravou.
  const chave = useMemo(novaChave, []);
  const [valor, setValor] = useState(deCentavos(saldo).toFixed(2).replace(".", ","));
  const [data, setData] = useState(hoje);
  const [forma, setForma] = useState(parcela.paymentMethod ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Ref, não só estado: dois toques no mesmo instante leem o estado antigo.
  const emCurso = useRef(false);
  // O comprovante já subido não sobe de novo se o registro falhar e a pessoa
  // tentar outra vez.
  const comprovanteSubido = useRef<{ storageId: Id<"_storage">; filename: string; contentType?: string } | null>(null);

  const numero = valorDigitado(valor);
  const centavos = numero === null ? null : paraCentavos(numero);
  const erro =
    centavos === null || centavos <= 0
      ? "Informe um valor maior que zero."
      : centavos > saldo
        ? `O saldo desta parcela é ${reais(saldo)}. Registre no máximo o saldo. Pagamento acima do combinado não é registrado aqui; a parcela e o contratado só mudam quando o acordo com a cliente mudar de fato.`
        : !dataValida(data)
          ? "Informe a data em que o dinheiro entrou."
          : null;

  const salvar = async () => {
    if (emCurso.current || erro) return;
    emCurso.current = true;
    setSalvando(true);
    try {
      if (arquivo && !comprovanteSubido.current) {
        const envio = await enviar(arquivo);
        if (!envio.ok) {
          toast.error(envio.motivo);
          return;
        }
        comprovanteSubido.current = {
          storageId: envio.storageId,
          filename: arquivo.name,
          contentType: arquivo.type || undefined,
        };
      }
      const r = await registrar({
        id: parcela._id,
        chave,
        valor: deCentavos(centavos!),
        data,
        forma: forma.trim() || undefined,
        comprovante: comprovanteSubido.current ?? undefined,
      });
      toast.success(r.repetido ? "Este recebimento já estava registrado." : "Recebimento registrado.");
      onClose();
    } catch (e) {
      toast.error(mensagem(e, "Não foi possível registrar o recebimento."));
    } finally {
      emCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">Registrar recebimento</DialogTitle>
          <DialogDescription className="break-words">
            {parcela.description} · saldo {reais(saldo)} · vence {formatDateInput(parcela.date)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-valor">Valor recebido (R$)</Label>
              <Input id="rec-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-data">Data</Label>
              <input id="rec-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-forma">Forma de pagamento</Label>
            <input
              id="rec-forma"
              list="rec-formas"
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              placeholder="PIX, transferência..."
              className={campo}
            />
            <datalist id="rec-formas">
              {FORMAS_DE_PAGAMENTO.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-comprovante">Comprovante (opcional)</Label>
            <input
              id="rec-comprovante"
              type="file"
              accept={TIPOS_DE_COMPROVANTE}
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                comprovanteSubido.current = null;
              }}
              className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm cursor-pointer"
            />
            {progresso !== null && (
              <p className="text-[11px] text-muted-foreground">Enviando comprovante… {Math.round(progresso * 100)}%</p>
            )}
          </div>
          {erro && valor.trim() !== "" && <p className="text-xs text-destructive">{erro}</p>}
          <p className="text-[11px] text-muted-foreground">
            Isto registra o que entrou. Nenhuma cobrança é enviada e nenhum dinheiro é movimentado.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando} className="cursor-pointer h-10 sm:h-9">
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando || !!erro} className="cursor-pointer h-10 sm:h-9">
            {salvando ? "Registrando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AnularRecebimento({
  parcela,
  recebimento,
  onClose,
}: {
  parcela: ParcelaParaReceber;
  recebimento: Recebimento;
  onClose: () => void;
}) {
  const anular = useMutation(api.financeiro.anularRecebimento);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const emCurso = useRef(false);

  const salvar = async () => {
    if (emCurso.current || !motivo.trim()) return;
    emCurso.current = true;
    setSalvando(true);
    try {
      await anular({ id: parcela._id, recebimentoId: recebimento.id, motivo });
      toast.success("Recebimento anulado. Ele continua no histórico.");
      onClose();
    } catch (e) {
      toast.error(mensagem(e, "Não foi possível anular."));
    } finally {
      emCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular recebimento</DialogTitle>
          <DialogDescription className="break-words">
            {reais(paraCentavos(recebimento.valor))} em {formatDateInput(recebimento.data)} · {parcela.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="anular-motivo">Por que este registro está errado?</Label>
          <Textarea
            id="anular-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Valor digitado errado, recebimento lançado na parcela errada..."
            rows={3}
            maxLength={500}
          />
          <p className="text-[11px] text-muted-foreground">
            O registro não é apagado: fica no histórico, riscado, e deixa de contar no saldo. Não é
            estorno bancário. Para corrigir, registre depois o valor certo.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando} className="cursor-pointer h-10 sm:h-9">
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void salvar()}
            disabled={salvando || !motivo.trim()}
            className="cursor-pointer h-10 sm:h-9"
          >
            {salvando ? "Anulando..." : "Anular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Comprovante para um recebimento JÁ registrado — sem registrar o dinheiro de
 * novo. Valor, saldo e baixa não mudam (`anexarComprovanteAoRecebimento`).
 */
export function AnexarComprovanteAoRecebimento({
  parcela,
  recebimento,
  onClose,
}: {
  parcela: ParcelaParaReceber;
  recebimento: Recebimento;
  onClose: () => void;
}) {
  const anexar = useMutation(api.financeiro.anexarComprovanteAoRecebimento);
  const gerarUrl = useMutation(api.financeiro.generateUploadUrl);
  const { enviar, progresso } = useEnvioDeArquivo(gerarUrl, { tipo: "documento", aceitos: MIMES_DE_COMPROVANTE });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const emCurso = useRef(false);
  // Subido uma vez, não sobe de novo se a gravação falhar e ela repetir.
  const subido = useRef<{ storageId: Id<"_storage">; nome: string } | null>(null);

  const salvar = async () => {
    if (emCurso.current || !arquivo) return;
    emCurso.current = true;
    setSalvando(true);
    try {
      if (!subido.current || subido.current.nome !== arquivo.name) {
        const envio = await enviar(arquivo);
        if (!envio.ok) {
          toast.error(envio.motivo);
          return;
        }
        subido.current = { storageId: envio.storageId, nome: arquivo.name };
      }
      await anexar({
        id: parcela._id,
        recebimentoId: recebimento.id,
        storageId: subido.current.storageId,
        filename: arquivo.name,
        contentType: arquivo.type || undefined,
      });
      toast.success("Comprovante anexado. O valor recebido não mudou.");
      onClose();
    } catch (e) {
      toast.error(mensagem(e, "Não foi possível anexar o comprovante."));
    } finally {
      emCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anexar comprovante</DialogTitle>
          <DialogDescription className="break-words">
            {reais(paraCentavos(recebimento.valor))} em {formatDateInput(recebimento.data)} · {parcela.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <input
            aria-label="Arquivo do comprovante"
            type="file"
            accept={TIPOS_DE_COMPROVANTE}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm cursor-pointer"
          />
          {progresso !== null && (
            <p className="text-[11px] text-muted-foreground">Enviando… {Math.round(progresso * 100)}%</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Só o arquivo entra: o recebimento já registrado não é lançado de novo.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando} className="cursor-pointer h-10 sm:h-9">
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando || !arquivo} className="cursor-pointer h-10 sm:h-9">
            {salvando ? "Anexando..." : "Anexar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Os comprovantes da parcela, com link para abrir — lidos só quando pedidos. */
export function ListaDeComprovantes({ id }: { id: Id<"transactions"> }) {
  const lista = useQuery(api.financeiro.comprovantesDoLancamento, { id });
  if (lista === undefined) return <Skeleton className="h-6 w-40" />;
  if (lista.length === 0) return <p className="text-xs text-muted-foreground">Nenhum comprovante anexado.</p>;
  return (
    <ul className="space-y-1">
      {lista.map((c) => (
        <li key={c.storageId} className="flex items-center gap-1.5 text-xs min-w-0">
          <Paperclip className="size-3 flex-shrink-0 text-muted-foreground" />
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer" className="truncate hover:underline inline-flex items-center gap-1 min-h-9">
              <span className="truncate">{c.filename}</span>
              <ExternalLink className="size-3 flex-shrink-0" />
            </a>
          ) : (
            <span className="truncate text-muted-foreground">{c.filename} (arquivo indisponível)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * O histórico da parcela, para o Financeiro geral: cada recebimento (o
 * anulado, riscado, com o motivo), os comprovantes com link, e as ações que
 * a aba do evento também tem — anular e anexar comprovante.
 *
 * Abre UM diálogo filho por vez: ao escolher uma ação, este se fecha e o
 * pai abre o outro (`onAcao`). Dois modais empilhados no celular escondem um
 * atrás do outro.
 */
export function HistoricoDeRecebimentos({
  parcela,
  onClose,
  onAcao,
}: {
  parcela: ParcelaParaReceber;
  onClose: () => void;
  onAcao: (acao: { tipo: "receber" } | { tipo: "anular" | "anexar"; recebimento: Recebimento }) => void;
}) {
  const recebimentos = [...(parcela.recebimentos ?? [])].reverse();
  const saldo = saldoEmCentavos(parcela);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">Histórico — {parcela.description}</DialogTitle>
          <DialogDescription>
            {reais(paraCentavos(parcela.amount))} · vence {formatDateInput(parcela.date)} · saldo {reais(saldo)}
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebimentos</h3>
          {recebimentos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {parcela.isPaid
                ? "Baixa feita antes dos recebimentos — sem o detalhe de quando e como."
                : "Nenhum recebimento registrado."}
            </p>
          ) : (
            <ul className="space-y-2">
              {recebimentos.map((r) => (
                <li key={r.id} className="rounded-lg border border-border p-2 space-y-1">
                  <p className={cn("text-sm", r.anulacao && "line-through text-muted-foreground")}>
                    {reais(paraCentavos(r.valor))} · {formatDateInput(r.data)}
                    {r.forma && ` · ${r.forma}`}
                  </p>
                  {r.anulacao ? (
                    <p className="text-xs text-muted-foreground break-words">Anulado: {r.anulacao.motivo}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {!r.comprovanteStorageId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAcao({ tipo: "anexar", recebimento: r })}
                          className="cursor-pointer h-9 gap-1"
                        >
                          <Paperclip className="size-3.5" /> Anexar comprovante
                        </Button>
                      )}
                      {r.comprovanteStorageId && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Paperclip className="size-3" /> com comprovante
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onAcao({ tipo: "anular", recebimento: r })}
                        className="cursor-pointer h-9 text-muted-foreground hover:text-destructive"
                      >
                        Anular
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comprovantes</h3>
          <ListaDeComprovantes id={parcela._id} />
        </section>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer h-10 sm:h-9">
            Fechar
          </Button>
          {saldo > 0 && (
            <Button onClick={() => onAcao({ tipo: "receber" })} className="cursor-pointer gap-1.5 h-10 sm:h-9">
              <HandCoins className="size-4" /> Registrar recebimento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
