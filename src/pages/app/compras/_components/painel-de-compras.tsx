import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";
import {
  ORDEM_DAS_FAIXAS,
  ROTULO_DA_FAIXA,
  ROTULO_DO_FILTRO,
  faixaDePrazo,
  filtrarPanorama,
  fornecedoresDaLista,
  ordenarPorUrgencia,
  resumirPanorama,
  type FaixaDePrazo,
  type FiltroDeSituacao,
} from "@/convex/lib/panoramaDeCompras.ts";
import {
  PURCHASE_STATUS_LABEL,
  effectivePurchaseStatus,
} from "@/convex/lib/purchaseStatus.ts";
import { AlertTriangle, CalendarClock, PackageCheck, Wallet } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DE COMPRAS — a leitura de segunda-feira.
//
// A lista por evento responde "o que falta neste casamento?". Esta responde
// "o que eu preciso resolver esta semana, em todos os eventos?" — e para
// respondê-la a decoradora tinha de abrir evento por evento. Uma compra
// atrasada de um evento distante ficava escondida atrás de um acordeão fechado.
//
// Toda a regra (faixa de prazo, filtros, contagens) vive em
// convex/lib/panoramaDeCompras.ts, pura e testada. Aqui só se desenha —
// nenhum número é calculado nesta tela, para o painel nunca discordar do
// Quadro de Atenção.
// ─────────────────────────────────────────────────────────────────────────────

const MOEDA = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const FILTROS: readonly FiltroDeSituacao[] = [
  "pendentes",
  "atrasadas",
  "aguardando",
  "foraDoLivro",
  "todas",
];

function Cartao({
  icone,
  rotulo,
  valor,
  detalhe,
  alerta,
  ativo,
  onClick,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
  ativo?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left bg-card border rounded-xl px-4 py-3 transition-colors cursor-pointer hover:border-primary/50",
        ativo ? "border-primary ring-1 ring-primary/30" : "border-border",
        alerta && "border-amber-300 dark:border-amber-800",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone} {rotulo}
      </div>
      <p className={cn("text-xl font-bold mt-0.5", alerta && "text-amber-700 dark:text-amber-400")}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </button>
  );
}

export function PainelDeCompras() {
  const compras = useQuery(api.purchases.listPanorama, {});
  const hoje = hojeISO();

  const [situacao, setSituacao] = useState<FiltroDeSituacao>("pendentes");
  const [fornecedor, setFornecedor] = useState<string>("");

  const resumo = useMemo(
    () => resumirPanorama(compras ?? [], hoje),
    [compras, hoje],
  );
  const fornecedores = useMemo(() => fornecedoresDaLista(compras ?? []), [compras]);

  const visiveis = useMemo(() => {
    const filtradas = filtrarPanorama(compras ?? [], hoje, {
      situacao,
      fornecedor: fornecedor || undefined,
    });
    return ordenarPorUrgencia(filtradas);
  }, [compras, hoje, situacao, fornecedor]);

  // Agrupa por faixa mantendo a ordem de urgência dentro de cada uma.
  const porFaixa = useMemo(() => {
    const mapa = new Map<FaixaDePrazo, typeof visiveis>();
    for (const item of visiveis) {
      const faixa = faixaDePrazo(item, hoje);
      const atual = mapa.get(faixa) ?? [];
      atual.push(item);
      mapa.set(faixa, atual);
    }
    return ORDEM_DAS_FAIXAS.map((faixa) => ({ faixa, itens: mapa.get(faixa) ?? [] })).filter(
      (g) => g.itens.length > 0,
    );
  }, [visiveis, hoje]);

  if (compras === undefined) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cartao
          icone={<CalendarClock className="size-3.5" />}
          rotulo="A resolver"
          valor={String(resumo.pendentes)}
          detalhe={resumo.valorPendente > 0 ? MOEDA(resumo.valorPendente) : undefined}
          ativo={situacao === "pendentes"}
          onClick={() => setSituacao("pendentes")}
        />
        <Cartao
          icone={<AlertTriangle className="size-3.5" />}
          rotulo="Atrasadas"
          valor={String(resumo.atrasadas)}
          detalhe={resumo.paraHoje > 0 ? `+ ${resumo.paraHoje} para hoje` : undefined}
          alerta={resumo.atrasadas > 0}
          ativo={situacao === "atrasadas"}
          onClick={() => setSituacao("atrasadas")}
        />
        <Cartao
          icone={<PackageCheck className="size-3.5" />}
          rotulo="Aguardando entrega"
          valor={String(resumo.aguardandoEntrega)}
          ativo={situacao === "aguardando"}
          onClick={() => setSituacao("aguardando")}
        />
        {/* Ponte com o Bloco A: enquanto houver compra fora do livro, a margem
            do evento não pode ser afirmada. O número aqui é o mesmo que o
            financeiro usa para se recusar a calcular margem. */}
        <Cartao
          icone={<Wallet className="size-3.5" />}
          rotulo="Fora do financeiro"
          valor={String(resumo.foraDoLivro)}
          detalhe={resumo.valorForaDoLivro > 0 ? MOEDA(resumo.valorForaDoLivro) : undefined}
          alerta={resumo.foraDoLivro > 0}
          ativo={situacao === "foraDoLivro"}
          onClick={() => setSituacao("foraDoLivro")}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setSituacao(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
              situacao === f
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {ROTULO_DO_FILTRO[f]}
          </button>
        ))}

        {fornecedores.length > 0 && (
          <select
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            aria-label="Filtrar por fornecedor"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs cursor-pointer ml-auto"
          >
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>

      {visiveis.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-8 text-center">
          <p className="text-sm font-medium">Nada aqui</p>
          <p className="text-xs text-muted-foreground mt-1">
            {situacao === "atrasadas"
              ? "Nenhuma compra passou do prazo."
              : situacao === "foraDoLivro"
                ? "Todas as compras com preço já estão no financeiro."
                : "Nenhuma compra nesta situação."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {porFaixa.map(({ faixa, itens }) => (
            <div key={faixa} className="bg-card border border-border rounded-xl overflow-hidden">
              <div
                className={cn(
                  "px-4 py-2 text-xs font-semibold border-b border-border",
                  faixa === "atrasado" && "text-amber-700 dark:text-amber-400",
                )}
              >
                {ROTULO_DA_FAIXA[faixa]} · {itens.length}
              </div>
              <div className="divide-y divide-border">
                {itens.map((item) => {
                  const status = effectivePurchaseStatus(item);
                  const valor =
                    typeof item.unitPrice === "number"
                      ? item.unitPrice * (item.quantity ?? 1)
                      : null;
                  return (
                    <div
                      key={item._id}
                      className="px-4 py-2.5 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.eventName}
                          {item.supplier && ` · ${item.supplier}`}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {PURCHASE_STATUS_LABEL[status]}
                          </span>
                          {item.dueDate && (
                            <span className="text-xs text-muted-foreground">
                              até {formatEventDayOnly(item.dueDate)}
                            </span>
                          )}
                          {/* Só afirma "fora do financeiro" quando há preço:
                              sem preço não existe lançamento a fazer. */}
                          {valor !== null && !item.transactionId && status !== "cancelado" && (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              fora do financeiro
                            </span>
                          )}
                        </div>
                      </div>
                      {valor !== null && (
                        <p className="text-sm font-medium whitespace-nowrap">{MOEDA(valor)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
