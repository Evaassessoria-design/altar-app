import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  HandCoins,
  ListPlus,
  Paperclip,
  Pencil,
  Wallet,
} from "lucide-react";
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
import { FluxoDaParcela, type EtapaDaParcela } from "@/components/financeiro/recebimentos.tsx";
import { campo, mensagem, novaChave, reais } from "@/lib/recebimentos.ts";
import { FORMAS_DE_PAGAMENTO, MIMES_DE_COMPROVANTE, TIPOS_DE_COMPROVANTE } from "@/lib/comprovante-financeiro.ts";
import { formatDateInput } from "@/lib/event-date.ts";
import { dataDoDiaNoFuso } from "@/convex/lib/dataDoDia.ts";
import { valorDigitado } from "@/lib/valor-digitado.ts";
import { cn } from "@/lib/utils.ts";
import {
  dataValida,
  deCentavos,
  estadoDaParcela,
  paraCentavos,
  parcelaAtrasada,
  planejarParcelas,
  recebidoEmCentavos,
  resumirPagamentos,
  saldoEmCentavos,
  usaRecebimentos,
  type ParcelaPlanejada,
} from "@/convex/lib/pagamentosDoEvento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PAGAMENTOS DA CLIENTE — A ABA DO EVENTO (/eventos/:id/pagamentos)
//
// A pergunta da decoradora: quanto foi fechado, quanto já entrou, quanto
// falta, o que está atrasado e qual é a próxima. O Financeiro respondia isso
// para a EMPRESA; para UM evento, só dizia "recebido / lançado".
//
// SÓ o que a cliente paga à decoradora. Despesa, fornecedor, custo do evento
// e assinatura do ALTAR não entram: `pagamentosDoEvento` devolve apenas as
// RECEITAS do evento. E não há lançamento próprio — é uma visão das mesmas
// linhas do Financeiro, então os dois mostram sempre o mesmo número.
//
// Três números que não se confundem:
//   · orçamento estimado (`budget`) — o que se imaginou; só aparece como nota;
//   · valor contratado — o que foi fechado; "não definido" quando não há;
//   · recebido — a soma do que ENTROU, recebimento a recebimento.
//
// UM diálogo por vez (`aberto`): no celular, dois modais empilhados escondem
// um atrás do outro e prendem o foco no de baixo.
// ─────────────────────────────────────────────────────────────────────────────




type Dados = NonNullable<ReturnType<typeof useQuery<typeof api.financeiro.pagamentosDoEvento>>>;
type Parcela = Dados["parcelas"][number];

// A parcela aberta guarda só o ID: a cada render ela é procurada de novo em
// `dados.parcelas`, então depois de anular ou receber os detalhes — e o
// saldo da correção — já são os atuais.
type Aberto =
  | { tipo: "parcela"; id: Parcela["_id"]; etapa: EtapaDaParcela }
  | { tipo: "contratado" }
  | { tipo: "planejar" }
  | null;

const ROTULO_DO_ESTADO = { pendente: "Pendente", parcial: "Parcialmente recebida", recebida: "Recebida" } as const;
const COR_DO_ESTADO = {
  pendente: "bg-muted text-muted-foreground",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  recebida: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
} as const;

export function PagamentosDaCliente({ eventId }: { eventId: Id<"events"> }) {
  const dados = useQuery(api.financeiro.pagamentosDoEvento, { eventId });
  const [aberto, setAberto] = useState<Aberto>(null);

  if (dados === undefined) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (dados === null) return null;

  // "Hoje" no fuso do NEGÓCIO, que o servidor informa — nem o do aparelho
  // (quem viaja veria outro dia) nem o UTC (que vira às 21h de Brasília). É
  // o mesmo dia que o Dashboard usa para dizer o que venceu.
  const hoje = dataDoDiaNoFuso(new Date(), dados.fuso);
  const resumo = resumirPagamentos(dados.valorContratado, dados.parcelas, hoje);
  const proxima = resumo.proxima ? dados.parcelas[resumo.proxima.indice] : null;
  const abrir = (p: Parcela) => setAberto({ tipo: "parcela", id: p._id, etapa: { tipo: "detalhes" } });
  const parcelaAberta =
    aberto?.tipo === "parcela" ? (dados.parcelas.find((p) => p._id === aberto.id) ?? null) : null;

  return (
    <section className="bg-card rounded-xl border border-border overflow-hidden" aria-labelledby="pagamentos-titulo">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pagamentos-titulo" className="font-semibold flex items-center gap-2">
            <Wallet className="size-4 text-primary" /> Pagamentos da cliente
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Só o que a cliente paga a você — despesas e fornecedores ficam no Financeiro.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAberto({ tipo: "planejar" })}
          className="cursor-pointer gap-1.5 h-9"
        >
          <ListPlus className="size-4" /> Planejar parcelas
        </Button>
      </div>

      {/* ── O RESUMO ─────────────────────────────────────────────────────── */}
      {/* Três colunas, não cinco: a página do evento é estreita, e com cinco
          "R$ 10.000,00" quebrava no meio do número. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border">
        <Numero
          rotulo="Valor contratado"
          valor={resumo.contratadoCentavos === null ? "Não definido" : reais(resumo.contratadoCentavos)}
          apagado={resumo.contratadoCentavos === null}
          acao={
            <button
              onClick={() => setAberto({ tipo: "contratado" })}
              className="text-xs text-primary hover:underline cursor-pointer inline-flex items-center gap-1 min-h-9"
            >
              <Pencil className="size-3" /> {resumo.contratadoCentavos === null ? "Definir" : "Alterar"}
            </button>
          }
        />
        <Numero rotulo="Recebido" valor={reais(resumo.recebidoCentavos)} />
        <Numero
          rotulo="Saldo a receber"
          valor={reais(resumo.saldoCentavos)}
          nota={resumo.baseDoSaldo === "parcelas" ? "das parcelas lançadas" : undefined}
        />
        <Numero
          rotulo="Vencido"
          valor={reais(resumo.vencidoCentavos)}
          alerta={resumo.vencidoCentavos > 0}
          nota={resumo.parcelasVencidas > 0 ? `${resumo.parcelasVencidas} parcela${resumo.parcelasVencidas > 1 ? "s" : ""}` : undefined}
        />
        <Numero
          className="col-span-2"
          rotulo="Próxima parcela"
          valor={resumo.proxima ? reais(resumo.proxima.saldoCentavos) : "—"}
          nota={resumo.proxima ? `vence ${formatDateInput(resumo.proxima.vencimento)}` : "nenhuma a vencer"}
          acao={
            proxima ? (
              <button
                onClick={() => setAberto({ tipo: "parcela", id: proxima._id, etapa: { tipo: "receber" } })}
                className="text-xs text-primary hover:underline cursor-pointer min-h-9"
              >
                Registrar recebimento
              </button>
            ) : undefined
          }
        />
      </div>

      {/* ── O QUE NÃO BATE ─────────────────────────────────────────────── */}
      {(resumo.contratadoCentavos === null || (resumo.diferencaDoPlanoCentavos ?? 0) !== 0) && (
        <div className="px-5 pt-4 space-y-1.5">
          {resumo.contratadoCentavos === null && (
            <p className="text-xs text-muted-foreground">
              O valor contratado não foi definido, então o saldo considera só as parcelas lançadas.
              {dados.orcamentoEstimado !== null && (
                <> O orçamento estimado ({reais(paraCentavos(dados.orcamentoEstimado))}) não conta como contratado.</>
              )}
            </p>
          )}
          {resumo.diferencaDoPlanoCentavos !== null && resumo.diferencaDoPlanoCentavos > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" />
              As parcelas somam {reais(resumo.parceladoCentavos)}: faltam {reais(resumo.diferencaDoPlanoCentavos)} para cobrir o contratado.
            </p>
          )}
          {resumo.diferencaDoPlanoCentavos !== null && resumo.diferencaDoPlanoCentavos < 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" />
              As parcelas somam {reais(-resumo.diferencaDoPlanoCentavos)} a mais que o contratado.
            </p>
          )}
        </div>
      )}

      {/* ── AS PARCELAS ─────────────────────────────────────────────────── */}
      <div className="p-5">
        {dados.parcelas.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm font-medium">Nenhuma parcela lançada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use "Planejar parcelas" para montar a entrada e as parcelas com prévia antes de salvar.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {dados.parcelas.map((p) => {
              const estado = estadoDaParcela(p);
              const atrasada = parcelaAtrasada(p, hoje);
              const saldo = saldoEmCentavos(p);
              return (
                <li
                  key={p._id}
                  className={cn(
                    "rounded-xl border p-3 space-y-2 min-w-0",
                    atrasada ? "border-red-300 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/10" : "border-border",
                  )}
                >
                  {/* A PARCELA SE ABRE, em qualquer estado — pendente, parcial,
                      recebida ou atrasada. Antes, quitada, ela perdia o botão
                      de receber e ficava só com um texto cinza "Histórico (2)":
                      parecia trancada. O bloco inteiro abre os detalhes
                      (valor, vencimento, histórico, comprovantes, ações);
                      `div` com role de botão porque tem parágrafos dentro. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir detalhes de ${p.description}`}
                    onClick={() => abrir(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrir(p);
                      }
                    }}
                    className="-m-1 p-1 space-y-2 rounded-lg cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{p.description}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarClock className="size-3" /> vence {formatDateInput(p.date)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", COR_DO_ESTADO[estado])}>
                          {ROTULO_DO_ESTADO[estado]}
                        </span>
                        {atrasada && (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            Em atraso
                          </span>
                        )}
                      </div>
                    </div>

                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Valor</dt>
                        <dd className="font-medium">{reais(paraCentavos(p.amount))}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Recebido</dt>
                        <dd className="font-medium">{reais(recebidoEmCentavos(p))}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Saldo</dt>
                        <dd className={cn("font-medium", atrasada && "text-red-700 dark:text-red-400")}>{reais(saldo)}</dd>
                      </div>
                    </dl>

                  </div>

                  {!usaRecebimentos(p) && p.isPaid && (
                    <p className="text-[11px] text-muted-foreground">
                      Baixa feita no Financeiro, sem o detalhe dos recebimentos.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {saldo > 0 && (
                      <Button
                        size="sm"
                        onClick={() => setAberto({ tipo: "parcela", id: p._id, etapa: { tipo: "receber" } })}
                        className="cursor-pointer gap-1.5 h-9"
                      >
                        <HandCoins className="size-4" /> Registrar recebimento
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrir(p)}
                      className="cursor-pointer gap-1 h-9"
                    >
                      Detalhes e histórico
                      {p.recebimentos.length > 0 && ` (${p.recebimentos.length})`}
                      {p.comprovantes > 0 && (
                        <span className="inline-flex items-center gap-0.5 ml-1 text-muted-foreground">
                          <Paperclip className="size-3" /> {p.comprovantes}
                        </span>
                      )}
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Os detalhes e as ações da parcela — o MESMO fluxo do Financeiro
          geral (FluxoDaParcela), com a parcela atual. */}
      {aberto?.tipo === "parcela" && parcelaAberta && (
        <FluxoDaParcela
          parcela={parcelaAberta}
          etapa={aberto.etapa}
          hoje={hoje}
          atrasada={parcelaAtrasada(parcelaAberta, hoje)}
          onEtapa={(e) => setAberto(e ? { tipo: "parcela", id: parcelaAberta._id, etapa: e } : null)}
        />
      )}
      {aberto?.tipo === "contratado" && (
        <ValorContratado eventId={eventId} atual={dados.valorContratado} onClose={() => setAberto(null)} />
      )}
      {aberto?.tipo === "planejar" && (
        <PlanejarParcelas
          eventId={eventId}
          hoje={hoje}
          contratadoCentavos={resumo.contratadoCentavos}
          parceladoCentavos={resumo.parceladoCentavos}
          onClose={() => setAberto(null)}
        />
      )}
    </section>
  );
}

/**
 * O cartão da página do evento: o resumo compacto e o caminho para a aba.
 *
 * A aba é onde se trabalha; aqui é onde se OLHA. Três números e o atraso,
 * na mesma regra da aba — os dois nunca discordam.
 */
export function CartaoPagamentosDaCliente({ eventId }: { eventId: Id<"events"> }) {
  const dados = useQuery(api.financeiro.pagamentosDoEvento, { eventId });
  if (dados === undefined) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (dados === null) return null;
  const hoje = dataDoDiaNoFuso(new Date(), dados.fuso);
  const r = resumirPagamentos(dados.valorContratado, dados.parcelas, hoje);
  return (
    <section className="bg-card rounded-xl border border-border overflow-hidden" aria-label="Pagamentos da cliente">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <h2 className="font-semibold flex items-center gap-2 min-w-0">
          <Wallet className="size-4 text-primary flex-shrink-0" />
          <span className="truncate">Pagamentos da cliente</span>
        </h2>
        <Link
          to={`/eventos/${eventId}/pagamentos`}
          className="text-sm text-primary hover:underline inline-flex items-center gap-1 min-h-9 flex-shrink-0"
        >
          Abrir <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
        <Numero
          rotulo="Contratado"
          valor={r.contratadoCentavos === null ? "Não definido" : reais(r.contratadoCentavos)}
          apagado={r.contratadoCentavos === null}
        />
        <Numero rotulo="Recebido" valor={reais(r.recebidoCentavos)} />
        <Numero
          rotulo="Saldo"
          valor={reais(r.saldoCentavos)}
          nota={r.baseDoSaldo === "parcelas" ? "das parcelas lançadas" : undefined}
        />
        <Numero rotulo="Vencido" valor={reais(r.vencidoCentavos)} alerta={r.vencidoCentavos > 0} />
      </div>
      <div className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {r.proxima
            ? `Próxima: ${reais(r.proxima.saldoCentavos)} em ${formatDateInput(r.proxima.vencimento)}`
            : dados.parcelas.length === 0
              ? "Nenhuma parcela lançada"
              : "Nenhuma parcela a vencer"}
        </span>
        <Link
          to={`/eventos/${eventId}/pagamentos`}
          className="text-primary hover:underline inline-flex items-center gap-1 min-h-9"
        >
          <HandCoins className="size-3.5" /> Registrar recebimento
        </Link>
      </div>
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
  acao,
  alerta,
  apagado,
  className,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  acao?: React.ReactNode;
  alerta?: boolean;
  apagado?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("bg-card px-4 py-3 min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "text-base font-semibold mt-0.5 break-words",
          alerta && "text-red-700 dark:text-red-400",
          apagado && "text-muted-foreground font-medium",
        )}
      >
        {valor}
      </p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
      {acao}
    </div>
  );
}

function ValorContratado({ eventId, atual, onClose }: { eventId: Id<"events">; atual: number | null; onClose: () => void }) {
  const definir = useMutation(api.financeiro.definirValorContratado);
  const [valor, setValor] = useState(atual === null ? "" : atual.toFixed(2).replace(".", ","));
  const [salvando, setSalvando] = useState(false);
  const numero = valorDigitado(valor);

  const salvar = async (limpar = false) => {
    setSalvando(true);
    try {
      await definir({ eventId, valor: limpar ? null : numero });
      toast.success(limpar ? "Valor contratado removido." : "Valor contratado salvo.");
      onClose();
    } catch (e) {
      toast.error(mensagem(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Valor contratado</DialogTitle>
          <DialogDescription>O valor fechado com o cliente — não o orçamento estimado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="contratado-valor">Valor (R$)</Label>
          <Input
            id="contratado-valor"
            inputMode="decimal"
            placeholder="15.000,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {atual !== null ? (
            <Button variant="ghost" onClick={() => void salvar(true)} disabled={salvando} className="cursor-pointer h-10 sm:h-9">
              Remover
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={() => void salvar()}
            disabled={salvando || numero === null || numero <= 0}
            className="cursor-pointer h-10 sm:h-9"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanejarParcelas({
  eventId,
  hoje,
  contratadoCentavos,
  parceladoCentavos,
  onClose,
}: {
  eventId: Id<"events">;
  hoje: string;
  contratadoCentavos: number | null;
  parceladoCentavos: number;
  onClose: () => void;
}) {
  const adicionar = useMutation(api.financeiro.adicionarParcelas);
  const chave = useMemo(novaChave, []);
  const emCurso = useRef(false);
  const [salvando, setSalvando] = useState(false);

  // O que falta parcelar, quando há valor contratado. As parcelas existentes
  // ficam como estão: o planejamento só ACRESCENTA.
  const faltando = contratadoCentavos === null ? null : Math.max(0, contratadoCentavos - parceladoCentavos);
  const [total, setTotal] = useState(faltando ? deCentavos(faltando).toFixed(2).replace(".", ",") : "");
  const [entrada, setEntrada] = useState("");
  const [dataEntrada, setDataEntrada] = useState(hoje);
  const [quantidade, setQuantidade] = useState("3");
  const [primeiro, setPrimeiro] = useState(hoje);
  // A prévia editável. `null` = ainda segue o cálculo automático.
  const [ajustes, setAjustes] = useState<ParcelaPlanejada[] | null>(null);

  const totalCentavos = paraCentavos(valorDigitado(total) ?? 0);
  const entradaCentavos = paraCentavos(valorDigitado(entrada) ?? 0);
  const n = Math.min(60, Math.max(0, Math.floor(Number(quantidade) || 0)));
  const calculado =
    totalCentavos > 0 && dataValida(primeiro) && (entradaCentavos === 0 || dataValida(dataEntrada))
      ? planejarParcelas({
          totalCentavos,
          entrada: entradaCentavos > 0 ? { valorCentavos: entradaCentavos, vencimento: dataEntrada } : null,
          quantidade: n,
          primeiroVencimento: primeiro,
        })
      : [];
  const previa = ajustes ?? calculado;
  const somaPrevia = previa.reduce((s, p) => s + p.valorCentavos, 0);
  const depoisDoPlano = contratadoCentavos === null ? null : contratadoCentavos - parceladoCentavos - somaPrevia;
  const invalida = previa.some((p) => p.valorCentavos <= 0 || !dataValida(p.vencimento));

  const ajustar = (i: number, mudanca: Partial<ParcelaPlanejada>) =>
    setAjustes(previa.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));

  const salvar = async () => {
    if (emCurso.current || previa.length === 0 || invalida) return;
    emCurso.current = true;
    setSalvando(true);
    try {
      const r = await adicionar({
        eventId,
        chave,
        parcelas: previa.map((p) => ({ descricao: p.descricao, valor: deCentavos(p.valorCentavos), vencimento: p.vencimento })),
      });
      toast.success(
        r.repetido
          ? "Estas parcelas já existiam — nada foi criado de novo."
          : `${r.criadas} parcela(s) criada(s).` +
              (r.ignoradas ? ` ${r.ignoradas} já existia(m) e não foi(ram) repetida(s).` : ""),
      );
      onClose();
    } catch (e) {
      toast.error(mensagem(e, "Não foi possível criar as parcelas."));
    } finally {
      emCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Planejar parcelas</DialogTitle>
          <DialogDescription>
            Cria parcelas NOVAS. As que já existem — inclusive as recebidas — não são alteradas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plano-total">Valor a parcelar (R$)</Label>
              <Input
                id="plano-total"
                inputMode="decimal"
                value={total}
                onChange={(e) => {
                  setTotal(e.target.value);
                  setAjustes(null);
                }}
              />
              {faltando !== null && (
                <p className="text-[11px] text-muted-foreground">Falta parcelar {reais(faltando)} do contratado.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plano-qtd">Quantidade de parcelas</Label>
              <Input
                id="plano-qtd"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => {
                  setQuantidade(e.target.value);
                  setAjustes(null);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plano-entrada">Entrada (opcional, R$)</Label>
              <Input
                id="plano-entrada"
                inputMode="decimal"
                placeholder="0,00"
                value={entrada}
                onChange={(e) => {
                  setEntrada(e.target.value);
                  setAjustes(null);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plano-data-entrada">Vencimento da entrada</Label>
              <input
                id="plano-data-entrada"
                type="date"
                value={dataEntrada}
                disabled={entradaCentavos === 0}
                onChange={(e) => {
                  setDataEntrada(e.target.value);
                  setAjustes(null);
                }}
                className={cn(campo, "disabled:opacity-50")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plano-primeiro">Primeiro vencimento (as demais, todo mês no mesmo dia)</Label>
              <input
                id="plano-primeiro"
                type="date"
                value={primeiro}
                onChange={(e) => {
                  setPrimeiro(e.target.value);
                  setAjustes(null);
                }}
                className={campo}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia</p>
            {previa.length === 0 ? (
              <p className="text-xs text-muted-foreground">Informe o valor e o primeiro vencimento para ver a prévia.</p>
            ) : (
              <ul className="space-y-2">
                {previa.map((p, i) => (
                  <li key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_8rem_9rem] gap-2 items-center">
                    <span className="text-sm break-words col-span-2 sm:col-span-1">{p.descricao}</span>
                    <Input
                      aria-label={`Valor de ${p.descricao}`}
                      inputMode="decimal"
                      value={deCentavos(p.valorCentavos).toFixed(2).replace(".", ",")}
                      onChange={(e) => ajustar(i, { valorCentavos: paraCentavos(valorDigitado(e.target.value) ?? 0) })}
                      className="h-9"
                    />
                    <input
                      aria-label={`Vencimento de ${p.descricao}`}
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => ajustar(i, { vencimento: e.target.value })}
                      className={cn(campo, "h-9")}
                    />
                  </li>
                ))}
              </ul>
            )}
            {previa.length > 0 && (
              <div className="text-xs space-y-0.5">
                <p>
                  Soma da prévia: <span className="font-semibold">{reais(somaPrevia)}</span>
                  {somaPrevia !== totalCentavos && totalCentavos > 0 && (
                    <span className="text-amber-700 dark:text-amber-400"> (valor a parcelar: {reais(totalCentavos)})</span>
                  )}
                </p>
                {depoisDoPlano !== null && depoisDoPlano !== 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    {depoisDoPlano > 0
                      ? `Depois disto ainda faltarão ${reais(depoisDoPlano)} para cobrir o contratado.`
                      : `Com isto as parcelas passam ${reais(-depoisDoPlano)} do contratado.`}
                  </p>
                )}
                {depoisDoPlano === 0 && (
                  <p className="text-green-700 dark:text-green-400">As parcelas cobrem exatamente o contratado.</p>
                )}
                {invalida && <p className="text-destructive">Toda parcela precisa de valor e vencimento válidos.</p>}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando} className="cursor-pointer h-10 sm:h-9">
            Cancelar
          </Button>
          <Button
            onClick={() => void salvar()}
            disabled={salvando || previa.length === 0 || invalida}
            className="cursor-pointer h-10 sm:h-9"
          >
            {salvando ? "Criando..." : `Criar ${previa.length || ""} parcela${previa.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
