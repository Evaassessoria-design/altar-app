import { Link } from "react-router-dom";
import { cn } from "@/lib/utils.ts";
import type { ChaveDaOperacao, EtapaDaOperacao } from "@/convex/lib/jornadaDoEvento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// OPERAÇÃO — depois do projeto, as peças saem, voltam e ficam prontas de novo
//
// Um bloco separado da jornada de propósito: projeto é decidir, operação é
// carregar caminhão. Rolagem horizontal no celular — é a tela que o galpão
// abre de pé. Montagem e desmontagem aparecem como "sem registro": o ALTAR
// ainda não as acompanha, e a tela não deduz da data que aconteceram.
// ─────────────────────────────────────────────────────────────────────────────

const COR: Record<EtapaDaOperacao["status"], string> = {
  concluido: "border-primary/40 bg-primary/10 text-primary",
  em_andamento: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  nao_iniciado: "border-border bg-card text-muted-foreground",
  sem_registro: "border-dashed border-border bg-transparent text-muted-foreground/70",
};

const ROTULO_DO_STATUS: Record<EtapaDaOperacao["status"], string> = {
  concluido: "feito",
  em_andamento: "em andamento",
  nao_iniciado: "a fazer",
  sem_registro: "sem registro",
};

/** Etapas que se resolvem na tela do acervo do evento. */
const NO_ACERVO = new Set<ChaveDaOperacao>(["retorno", "conferenciaDeRetorno", "limpezaReparo", "disponivel"]);
/** Etapas que se resolvem nos itens de montagem (tela do briefing). */
const NOS_ITENS = new Set<ChaveDaOperacao>(["separacao", "carregamento", "conferencia"]);

export function OperacaoDoEvento({
  eventId,
  etapas,
  atual,
}: {
  eventId: string;
  etapas: EtapaDaOperacao[];
  atual: ChaveDaOperacao | null;
}) {
  return (
    <section aria-label="Operação do evento" className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Operação</h2>
        <p className="text-xs text-muted-foreground">Do galpão ao evento, e de volta até estar pronto de novo</p>
      </div>
      <ol className="flex gap-2 overflow-x-auto px-5 py-4 [scrollbar-width:thin]">
        {etapas.map((e, i) => {
          const destino = NO_ACERVO.has(e.chave)
            ? `/eventos/${eventId}/acervo`
            : NOS_ITENS.has(e.chave)
              ? `/eventos/${eventId}/briefing`
              : undefined;
          const conteudo = (
            <>
              <span className="text-[10px] tabular-nums opacity-70">{i + 1}</span>
              <span className="text-sm font-medium leading-tight">{e.rotulo}</span>
              <span className="text-[11px] leading-tight opacity-80">{ROTULO_DO_STATUS[e.status]}</span>
            </>
          );
          const classe = cn(
            "flex min-h-20 w-32 flex-shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2",
            COR[e.status],
            e.chave === atual && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          );
          return (
            <li key={e.chave} title={e.detalhe}>
              {destino ? (
                <Link to={destino} className={cn(classe, "hover:brightness-95")}>{conteudo}</Link>
              ) : (
                <div className={classe}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ol>
      {atual && (
        <p className="border-t border-border px-5 py-2 text-xs text-muted-foreground">
          Agora: <strong className="text-foreground">{etapas.find((e) => e.chave === atual)?.rotulo}</strong>
          {" — "}
          {etapas.find((e) => e.chave === atual)?.detalhe}
        </p>
      )}
    </section>
  );
}
