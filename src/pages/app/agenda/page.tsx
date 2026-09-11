import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { CalendarClock, MapPin, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { dataDoDia, dataEmDias } from "@/convex/lib/dataDoDia.ts";
import { formatEventDayOnly, formatEventWeekday } from "@/lib/event-date.ts";
import { montarAgenda, ROTULO_DA_OPERACAO, type TipoDeOperacao } from "@/lib/agenda-central.ts";

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA OPERACIONAL
//
// "O que a minha empresa tem hoje?" — a pergunta que antes exigia abrir evento
// por evento.
//
// ── LISTA CRONOLÓGICA, NÃO CALENDÁRIO ───────────────────────────────────────
// Grade de mês é bonita no desktop e inútil no galpão às 5h da manhã, onde a
// pergunta é "o que vem AGORA". Uma lista por dia responde isso com o polegar,
// numa coluna só, sem biblioteca nova e sem rolagem horizontal.
//
// ── A TELA NÃO SABE NADA ────────────────────────────────────────────────────
// Toda a derivação vive em `lib/agenda-central`, testada sem renderizar. Aqui
// só existe recorte de datas, agrupamento visual e o que vai na cor de aviso.
// ─────────────────────────────────────────────────────────────────────────────

type Filtro = "hoje" | "semana" | "mes";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "7 dias" },
  { valor: "mes", rotulo: "30 dias" },
];

/** Dias à frente que cada filtro cobre. `hoje` é só o dia corrente. */
const DIAS_DO_FILTRO: Record<Filtro, number> = { hoje: 0, semana: 6, mes: 29 };

/**
 * Cor da etiqueta por tipo. Só tons já usados no ALTAR — nada de paleta nova.
 * O caramelo (`primary`) fica com a montagem: é o começo da operação.
 */
const TOM_DA_OPERACAO: Record<TipoDeOperacao, string> = {
  montagem: "bg-primary/10 text-primary",
  cerimonia: "bg-muted text-foreground",
  recepcao: "bg-muted text-foreground",
  desmontagem: "bg-muted text-muted-foreground",
  evento: "bg-muted text-foreground",
  retirada: "bg-muted text-muted-foreground",
  devolucao: "bg-muted text-muted-foreground",
};

export default function AgendaPage() {
  const [filtro, setFiltro] = useState<Filtro>("semana");

  const { de, ate } = useMemo(() => {
    const hoje = dataDoDia();
    return { de: hoje, ate: dataEmDias(DIAS_DO_FILTRO[filtro]) };
  }, [filtro]);

  const dados = useQuery(api.agenda.listarOperacoes, { de, ate });

  const dias = useMemo(() => {
    if (!dados) return null;
    return montarAgenda(dados.eventos, dados.reservas, de, ate);
  }, [dados, de, ate]);

  const hoje = dataDoDia();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="size-6 text-primary" /> Agenda
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Montagens, eventos e movimentação do acervo — em ordem.
        </p>
      </div>

      {/* Filtros: três recortes, nada além. Complexidade aqui custa clareza. */}
      <div className="flex gap-1.5 mb-4">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border",
              filtro === f.valor
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {dias === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : dias.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClock />
            </EmptyMedia>
            <EmptyTitle>Nada no período</EmptyTitle>
            <EmptyDescription>
              A agenda mostra o que já está cadastrado nos eventos: horários do briefing,
              equipe escalada e movimentação do acervo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {dias.map((dia) => (
            <div
              key={dia.data}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-border flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {formatEventDayOnly(dia.data)}
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {formatEventWeekday(dia.data)}
                  </span>
                </p>
                {dia.data === hoje && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0">
                    hoje
                  </span>
                )}
              </div>

              {/* Conflito de equipe: a única sobreposição que os dados de hoje
                  sustentam sem supor horário que ninguém informou. */}
              {dia.equipeEmConflito.length > 0 && (
                <div className="px-4 py-2 border-b border-border bg-amber-50/50 dark:bg-amber-900/10">
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="size-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      {dia.equipeEmConflito.join(", ")}{" "}
                      {dia.equipeEmConflito.length === 1 ? "está" : "estão"} em mais de um
                      evento neste dia.
                    </span>
                  </p>
                </div>
              )}

              <div className="divide-y divide-border">
                {dia.operacoes.map((op) => (
                  <Link
                    key={op.chave}
                    to={`/eventos/${op.eventoId}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    {/* Horário à esquerda, largura fixa: as linhas alinham e o
                        olho desce pela coluna sem procurar. */}
                    <div className="w-12 flex-shrink-0 pt-0.5">
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          op.horario ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {op.horario ?? "—"}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                            TOM_DA_OPERACAO[op.tipo],
                          )}
                        >
                          {ROTULO_DA_OPERACAO[op.tipo]}
                        </span>
                        {op.pecas !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {op.pecas} peça{op.pecas === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-medium mt-1 truncate">{op.evento}</p>

                      <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {op.local && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin className="size-3 flex-shrink-0" />
                            <span className="truncate">{op.local}</span>
                          </span>
                        )}
                        {op.equipe.length > 0 && (
                          <span className="flex items-center gap-1 min-w-0">
                            <Users className="size-3 flex-shrink-0" />
                            <span className="truncate">
                              {op.equipe.map((p) => p.nome).join(", ")}
                            </span>
                          </span>
                        )}
                      </div>

                      {op.alerta && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          {op.alerta}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
