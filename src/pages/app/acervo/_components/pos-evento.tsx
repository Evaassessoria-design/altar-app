import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";
import { AlertTriangle, PackageX, Wrench } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// A SEGUNDA-FEIRA DO ACERVO
//
// Três perguntas, na ordem em que a decoradora as faz depois do fim de semana:
// o que não voltou, o que está no conserto, e o que isso faz com os próximos
// eventos. A conta é do servidor (`acervo.pendenciasPosEvento`), com as mesmas
// funções da tela do evento.
//
// Some quando não há nada: um bloco "tudo certo" permanente vira paisagem, e
// paisagem é o que se deixa de ler no dia em que muda.
// ─────────────────────────────────────────────────────────────────────────────

function Mais({ mostrados, total }: { mostrados: number; total: number }) {
  // A tela nunca afirma o que não sabe: se cortou, diz que cortou.
  if (total <= mostrados) return null;
  return <li className="text-xs text-muted-foreground">e mais {total - mostrados}.</li>;
}

export function PosEvento() {
  const p = useQuery(api.acervo.pendenciasPosEvento, {});
  if (!p || (p.totalFora === 0 && p.totalEmManutencao === 0 && p.totalImpacto === 0)) {
    return null;
  }

  return (
    <section
      aria-label="Pós-evento"
      className="mb-4 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 space-y-3 dark:border-amber-800/60 dark:bg-amber-900/10"
    >
      <h2 className="text-sm font-semibold">Pós-evento</h2>

      {p.totalImpacto > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">
            <AlertTriangle className="size-3.5" /> Vai faltar nos próximos eventos
          </p>
          <ul className="space-y-1">
            {p.impacto.map((l) => (
              <li key={`${l.eventId}-${l.itemId}`} className="text-sm">
                <Link to={`/eventos/${l.eventId}/acervo`} className="font-medium hover:underline">
                  {l.eventoNome ?? "Evento"}
                </Link>
                {l.eventoData && (
                  <span className="text-muted-foreground"> · {formatEventDayOnly(l.eventoData)}</span>
                )}
                <span className="block text-xs text-muted-foreground">
                  {l.nome}: {l.necessario} necessárias · {l.disponivel} disponíveis
                  {l.emManutencao > 0 && ` · ${l.emManutencao} fora de uso`}
                  {l.foraSemVoltar > 0 && ` · ${l.foraSemVoltar} ainda não voltaram`}
                  {l.reservadoPorOutros > 0 && ` · ${l.reservadoPorOutros} com outro evento`}
                </span>
              </li>
            ))}
            <Mais mostrados={p.impacto.length} total={p.totalImpacto} />
          </ul>
        </div>
      )}

      {p.totalFora > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold mb-1">
            <PackageX className="size-3.5" /> Não voltou
          </p>
          <ul className="space-y-1">
            {p.fora.map((l) => (
              <li key={`${l.eventId}-${l.itemId}`} className="text-sm">
                {l.quantidade} {abreviarUnidade(l.unidade)} · {l.nome}
                <span className="text-muted-foreground">
                  {" — "}
                  <Link to={`/eventos/${l.eventId}/acervo`} className="hover:underline">
                    {l.eventoNome ?? "evento"}
                  </Link>
                  {", desde "}
                  {formatEventDayOnly(l.fimDaJanela)}
                </span>
              </li>
            ))}
            <Mais mostrados={p.fora.length} total={p.totalFora} />
          </ul>
          <p className="text-[11px] text-muted-foreground mt-1">
            Conferiu no galpão? Registre o retorno no evento. Se a peça se perdeu ou quebrou, dê
            baixa — até lá ela continua contando como fora.
          </p>
        </div>
      )}

      {p.totalEmManutencao > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold mb-1">
            <Wrench className="size-3.5" /> Fora de uso
          </p>
          <ul className="space-y-1">
            {p.emManutencao.map((l) => (
              <li key={l.itemId} className="text-sm">
                {l.quantidade} {abreviarUnidade(l.unidade)} · {l.nome}
                <span className="block text-xs text-muted-foreground">
                  {[
                    l.limpeza > 0 && `${l.limpeza} para limpar`,
                    l.reparo > 0 && `${l.reparo} em reparo`,
                    l.indisponivel > 0 && `${l.indisponivel} indisponíveis`,
                    l.conferencia > 0 && `${l.conferencia} em conferência`,
                  ].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
            <Mais mostrados={p.emManutencao.length} total={p.totalEmManutencao} />
          </ul>
        </div>
      )}
    </section>
  );
}
