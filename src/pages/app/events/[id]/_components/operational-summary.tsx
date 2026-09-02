import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckSquare,
  ShoppingCart,
  Building2,
  Users,
  Truck,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO OPERACIONAL — "está tudo bem com este evento?" em 5 segundos.
//
// Todo número aqui é CONTAGEM DE DADO REAL, vinda de `health.getEventSummary`.
// Nenhum índice sintético, nenhuma nota de saúde inventada, nenhum valor
// estimado. Quando um dado não existe, a tela diz que não existe — em vez de
// mostrar zero como se fosse resultado apurado.
// ─────────────────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function Metrica({
  icon: Icon,
  titulo,
  valor,
  detalhe,
  alerta,
  to,
}: {
  icon: React.ElementType;
  titulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
  to?: string;
}) {
  const conteudo = (
    <div
      className={cn(
        "rounded-lg border p-3 h-full transition-colors",
        alerta ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/15" : "border-border bg-background",
        to && "hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 flex-shrink-0" />
        <span className="truncate">{titulo}</span>
      </div>
      <p className="text-lg font-semibold mt-1 leading-tight">{valor}</p>
      {detalhe && (
        <p
          className={cn(
            "text-xs mt-0.5",
            alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {detalhe}
        </p>
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="cursor-pointer block">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

export function OperationalSummary({ eventId }: { eventId: Id<"events"> }) {
  const resumo = useQuery(api.health.getEventSummary, { eventId });

  if (resumo === undefined) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  if (resumo === null) return null;

  const { checklistPre, checklistPos, compras, fornecedores, equipe, carregamento, financeiro } =
    resumo;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <Activity className="size-4 text-primary" /> Resumo operacional
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Contagem do que está cadastrado neste evento — nada é estimado.
        </p>
      </div>

      {resumo.vazio ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium">Este evento ainda não tem nada cadastrado</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Conforme você for preenchendo briefing, fornecedores, compras e equipe, o resumo
            passa a mostrar o que falta para o dia da montagem.
          </p>
        </div>
      ) : (
        <>
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metrica
              icon={CheckSquare}
              titulo="Carregamento (pré)"
              valor={
                checklistPre.total > 0
                  ? `${checklistPre.feitos} de ${checklistPre.total}`
                  : "—"
              }
              detalhe={
                checklistPre.total === 0
                  ? "nada listado"
                  : checklistPre.pendentes > 0
                    ? `${checklistPre.pendentes} a conferir`
                    : "tudo conferido"
              }
              alerta={checklistPre.pendentes > 0}
              to={`/eventos/${eventId}/checklist/pre`}
            />

            <Metrica
              icon={CheckSquare}
              titulo="Conferência (pós)"
              valor={
                checklistPos.total > 0
                  ? `${checklistPos.feitos} de ${checklistPos.total}`
                  : "—"
              }
              detalhe={
                checklistPos.total === 0
                  ? "nada listado"
                  : checklistPos.pendentes > 0
                    ? `${checklistPos.pendentes} a conferir`
                    : "tudo conferido"
              }
              to={`/eventos/${eventId}/checklist/post`}
            />

            <Metrica
              icon={ShoppingCart}
              titulo="Compras"
              valor={compras.total > 0 ? `${compras.feitos} de ${compras.total}` : "—"}
              detalhe={
                compras.total === 0
                  ? "nada listado"
                  : [
                      brl.format(compras.valorComPreco),
                      compras.semPreco > 0 ? `${compras.semPreco} sem preço` : null,
                      // Sem isto, "1 de 3" com um item cancelado fica
                      // inexplicável na tela.
                      compras.cancelados > 0 ? `${compras.cancelados} cancelado${compras.cancelados === 1 ? "" : "s"}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
              }
              alerta={compras.pendentes > 0}
              to="/compras"
            />

            <Metrica
              icon={Building2}
              titulo="Fornecedores"
              valor={fornecedores.total > 0 ? `${fornecedores.total}` : "—"}
              detalhe={
                fornecedores.total === 0
                  ? "nenhum cadastrado"
                  : fornecedores.aguardando > 0
                    ? `${fornecedores.aguardando} aguardando confirmação`
                    : "todos confirmados"
              }
              alerta={fornecedores.aguardando > 0}
              to={`/eventos/${eventId}/fornecedores`}
            />

            <Metrica
              icon={Users}
              titulo="Equipe escalada"
              valor={equipe.escalados > 0 ? `${equipe.escalados}` : "—"}
              detalhe={
                equipe.escalados === 0
                  ? "ninguém escalado"
                  : equipe.comHorario === equipe.escalados
                    ? "todos com horário"
                    : `${equipe.escalados - equipe.comHorario} sem horário`
              }
              alerta={equipe.escalados > 0 && equipe.comHorario < equipe.escalados}
            />

            <Metrica
              icon={Truck}
              titulo="Itens de montagem"
              valor={carregamento.itens > 0 ? `${carregamento.itens}` : "—"}
              detalhe={
                carregamento.itens === 0
                  ? "nada cadastrado"
                  : `${carregamento.aConferir} marcados para conferência`
              }
            />
          </div>

          {/* Financeiro: previsto × realizado, só com o que foi lançado. */}
          <div className="px-5 pb-5">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="size-3.5" /> Resultado da sua empresa neste projeto
              </div>
              {financeiro.lancamentos === 0 ? (
                <p className="text-sm mt-1.5">
                  Nenhum lançamento ainda.{" "}
                  <Link to="/financeiro" className="text-primary hover:underline cursor-pointer">
                    Abrir financeiro
                  </Link>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Receita</p>
                    <p className="text-sm font-semibold">
                      {brl.format(financeiro.receitaRecebida)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        de {brl.format(financeiro.receitaPrevista)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">recebido / lançado</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo da execução</p>
                    <p className="text-sm font-semibold">
                      {brl.format(financeiro.despesaPaga)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        de {brl.format(financeiro.despesaPrevista)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">real / planejado</p>
                  </div>
                </div>
              )}

              {/* Margem só aparece quando existe base: receita E custo
                  lançados. Sobre custo inexistente daria 100%. */}
              {financeiro.margemPrevista !== null && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">Margem prevista</p>
                  <p className="text-sm font-semibold">
                    {brl.format(financeiro.margemPrevista)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      · {financeiro.margemPercentual}%
                    </span>
                  </p>
                </div>
              )}
              {financeiro.lancamentos > 0 && financeiro.margemPrevista === null && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  {financeiro.motivoSemMargem ??
                    "Margem aparece quando houver receita e custo lançados."}
                </p>
              )}

              {/* Compras com preço que ainda não viraram lançamento. Mostrar o
                  valor é o que transforma "está incompleto" em algo acionável:
                  ela vê QUANTO falta e vai lançar. */}
              {!financeiro.custoCompleto && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {brl.format(financeiro.custoForaDoLivro)} em compras ainda fora do
                    financeiro
                  </p>
                  <Link
                    to="/compras"
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Lançar agora
                  </Link>
                </div>
              )}

              {financeiro.lancamentos > 0 && financeiro.saldoAPagar > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Falta pagar {brl.format(financeiro.saldoAPagar)}
                </p>
              )}

              <p className="text-[11px] text-muted-foreground mt-2">
                Só a operação da sua empresa. Buffet, espaço, bar e assessoria são
                fornecedores do cliente e não entram aqui.
              </p>
            </div>
          </div>

          {/* Próximas ações — reúne o que JÁ existe, não cria tarefa nova. */}
          {resumo.proximasAcoes.length > 0 && (
            <div className="border-t border-border px-5 py-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ArrowRight className="size-4 text-primary" /> Próximas ações
              </h3>
              <ul className="mt-2 space-y-1.5">
                {resumo.proximasAcoes.slice(0, 6).map((acao, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 rounded-full bg-primary flex-shrink-0" />
                    <span>
                      {acao.texto}
                      {acao.referencia && (
                        <span className="text-muted-foreground"> · {acao.referencia}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {resumo.proximasAcoes.length > 6 && (
                <p className="text-xs text-muted-foreground mt-2">
                  e mais {resumo.proximasAcoes.length - 6}.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
