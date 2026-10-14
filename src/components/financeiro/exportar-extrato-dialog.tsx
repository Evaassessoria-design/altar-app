import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";
import {
  montarExtrato,
  periodoDeTresMeses,
  periodoDoMes,
  periodoValido,
  type FiltrosDoExtrato,
} from "@/convex/lib/extrato.ts";
import { lerEventosDoExtrato, lerTodosOsLancamentos } from "@/lib/extrato/carregar-extrato.ts";
import { brlDeCentavos, diaBr, montarDocumentoDoExtrato, type DocumentoDoExtrato } from "@/lib/extrato/documento-do-extrato.ts";

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTAR EXTRATO
//
// Escolhe período e filtros, lê TODOS os lançamentos da conta (página por
// página), monta o extrato uma vez e entrega em PDF ou Excel — os dois do
// mesmo `DocumentoDoExtrato`. A tela mostra as datas inicial e final antes
// de gerar, e o resumo depois: o que vai para o papel é o que ela vê.
// ─────────────────────────────────────────────────────────────────────────────

type Modo = "mes" | "tres" | "personalizado";

function nomeDoArquivo(d: DocumentoDoExtrato, ext: string, inicio: string, fim: string) {
  return `extrato-${inicio}-a-${fim}.${ext}`;
}

function baixar(bytes: Uint8Array, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportarExtratoDialog({ hoje, onClose }: { hoje: string; onClose: () => void }) {
  const convex = useConvex();
  const eventos = useQuery(api.events.list, {});
  const empresa = useQuery(api.users.getCurrentUser);
  const [modo, setModo] = useState<Modo>("mes");
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [inicioLivre, setInicioLivre] = useState(`${hoje.slice(0, 7)}-01`);
  const [fimLivre, setFimLivre] = useState(hoje);
  const [evento, setEvento] = useState("todos");
  const [tipo, setTipo] = useState<FiltrosDoExtrato["tipo"]>("todos");
  const [gerando, setGerando] = useState<null | string>(null);
  const [ultimo, setUltimo] = useState<DocumentoDoExtrato | null>(null);

  const periodo =
    modo === "mes" ? periodoDoMes(mes) : modo === "tres" ? periodoDeTresMeses(mes) : { inicio: inicioLivre, fim: fimLivre };
  const valido = periodoValido(periodo.inicio, periodo.fim);

  const gerar = async (formato: "pdf" | "xlsx") => {
    if (!valido) return;
    setGerando("Lendo os lançamentos…");
    try {
      const lancamentos = await lerTodosOsLancamentos(convex, (n) => setGerando(`Lendo os lançamentos… ${n}`));
      const extrato = montarExtrato(lancamentos, { ...periodo, evento, tipo });
      const ids = [
        ...extrato.movimentos.map((m) => m.eventoId),
        ...extrato.pendencias.map((p) => p.eventoId),
        ...extrato.semDataEfetiva.map((p) => p.eventoId),
        ...(evento !== "todos" && evento !== "sem_evento" ? [evento] : []),
      ].filter((x): x is string => !!x);
      const nomes = await lerEventosDoExtrato(convex, ids);
      const doc = montarDocumentoDoExtrato(extrato, {
        empresa: empresa?.studioName?.trim() || empresa?.name?.trim() || "Minha empresa",
        eventos: nomes,
        emitidoEm: new Date(),
      });
      setUltimo(doc);
      if (formato === "pdf") {
        const { desenharExtrato } = await import("@/lib/extrato/gerar-extrato-pdf.ts");
        const pdf = desenharExtrato(doc, empresa ?? null);
        baixar(new Uint8Array(pdf.output("arraybuffer")), nomeDoArquivo(doc, "pdf", periodo.inicio, periodo.fim), "application/pdf");
      } else {
        const { xlsxDoExtrato } = await import("@/lib/extrato/documento-do-extrato.ts");
        baixar(
          xlsxDoExtrato(doc),
          nomeDoArquivo(doc, "xlsx", periodo.inicio, periodo.fim),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      }
      toast.success(formato === "pdf" ? "Extrato em PDF gerado." : "Extrato em Excel gerado.");
    } catch {
      toast.error("Não foi possível gerar o extrato.");
    } finally {
      setGerando(null);
    }
  };

  const botaoModo = (m: Modo, rotulo: string) => (
    <button
      type="button"
      onClick={() => setModo(m)}
      className={cn(
        "flex-1 rounded-md border px-2 py-1.5 text-xs cursor-pointer",
        modo === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {rotulo}
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Exportar extrato</DialogTitle>
          <DialogDescription className="text-xs">
            O que entrou e o que saiu no período, na data em que aconteceu. Pendências vêm separadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <div className="flex gap-1.5">
              {botaoModo("mes", "Um mês")}
              {botaoModo("tres", "Três meses")}
              {botaoModo("personalizado", "Personalizado")}
            </div>
            {modo === "personalizado" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">De</Label>
                  <Input type="date" value={inicioLivre} onChange={(e) => setInicioLivre(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Até</Label>
                  <Input type="date" value={fimLivre} onChange={(e) => setFimLivre(e.target.value)} />
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-[11px] text-muted-foreground">{modo === "tres" ? "Último mês" : "Mês"}</Label>
                <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
              </div>
            )}
            <p className={cn("text-xs", valido ? "text-foreground" : "text-destructive")}>
              {valido ? (
                <>
                  De <strong>{diaBr(periodo.inicio)}</strong> a <strong>{diaBr(periodo.fim)}</strong>
                </>
              ) : (
                "A data inicial precisa ser igual ou anterior à final."
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Eventos</Label>
            <select
              value={evento}
              onChange={(e) => setEvento(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs md:text-sm cursor-pointer"
            >
              <option value="todos">Todos os eventos</option>
              <option value="sem_evento">Lançamentos sem evento</option>
              {(eventos ?? []).map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Movimentações</Label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as FiltrosDoExtrato["tipo"])}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs md:text-sm cursor-pointer"
            >
              <option value="todos">Todas as movimentações</option>
              <option value="receitas">Somente receitas</option>
              <option value="despesas">Somente despesas</option>
            </select>
          </div>

          {gerando && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {gerando}
            </p>
          )}

          {ultimo && !gerando && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-0.5">
              <p className="font-medium">Último extrato gerado · {ultimo.periodo}</p>
              <p>
                {ultimo.movimentos.length} movimentações · recebido {brlDeCentavos(ultimo.totais.recebidoCentavos)} · pago{" "}
                {brlDeCentavos(ultimo.totais.pagoCentavos)}
              </p>
              <p>
                Pendências: a receber {brlDeCentavos(ultimo.totais.aReceberCentavos)} · a pagar{" "}
                {brlDeCentavos(ultimo.totais.aPagarCentavos)}
              </p>
              {ultimo.semDataEfetiva.length > 0 && (
                <p className="text-muted-foreground">
                  {ultimo.semDataEfetiva.length} pago(s) sem data registrada ficaram fora dos totais.
                </p>
              )}
              <p className="text-muted-foreground">{ultimo.lancamentosLidos} lançamentos da conta lidos.</p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => void gerar("pdf")} disabled={!valido || !!gerando} className="flex-1 cursor-pointer gap-1.5">
              <FileDown className="size-4" /> Baixar PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void gerar("xlsx")}
              disabled={!valido || !!gerando}
              className="flex-1 cursor-pointer gap-1.5"
            >
              <FileSpreadsheet className="size-4" /> Baixar Excel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
