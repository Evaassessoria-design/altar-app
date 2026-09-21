import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AlertTriangle, CheckCircle2, ChevronRight, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { prazoDoEvento } from "@/lib/prazo-do-evento.ts";

type FollowUp = ReturnType<typeof useQuery<typeof api.funil.getFollowUp>>;
type Vencidos = ReturnType<typeof useQuery<typeof api.financeiro.getVencidos>>;

/** Sem centavos: o painel é para decidir, não para conferir extrato. */
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// "PRECISAM DA SUA ATENÇÃO"
//
// Cada linha é uma frase verificável ligada a um dado real, com um destino
// onde resolver. Não há nota, percentual nem semáforo calculado por peso —
// se a decoradora discordar de um motivo, ela consegue apontar qual dado o
// gerou. As regras vivem em convex/lib/attention.ts, puras e testadas.
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Uma linha só para o funil inteiro.
 *
 * Cinco leads sem follow-up viravam cinco cartões quase idênticos e empurravam
 * os eventos para fora da tela. O painel é para AGIR: uma frase com o número e
 * um caminho para resolver diz o mesmo e cabe.
 */
function LinhaDoFunil({ funil }: { funil: FollowUp }) {
  if (!funil || funil.total === 0) return null;

  const partes: string[] = [];
  if (funil.totalSemAcao > 0) {
    partes.push(
      funil.totalSemAcao === 1 ? "1 sem próxima ação" : `${funil.totalSemAcao} sem próxima ação`,
    );
  }
  if (funil.totalParados > 0) {
    partes.push(funil.totalParados === 1 ? "1 parado" : `${funil.totalParados} parados`);
  }

  return (
    <Link
      to="/funil"
      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/50 cursor-pointer border-b border-border"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Users className="size-4 text-primary flex-shrink-0" />
        <p className="text-sm truncate">
          <span className="font-medium">
            {funil.total === 1
              ? "1 oportunidade precisa de você"
              : `${funil.total} oportunidades precisam de você`}
          </span>
          {partes.length > 0 && (
            <span className="text-muted-foreground"> · {partes.join(" · ")}</span>
          )}
        </p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
    </Link>
  );
}

/**
 * Uma linha só para o dinheiro que já devia ter entrado — ou saído.
 *
 * O painel respondia por evento e por oportunidade, e deixava de fora a
 * pergunta mais cara de errar: "o sinal da Marina caiu?". O dado existe em
 * `transactions` desde sempre; nenhuma tela perguntava.
 *
 * Descritiva, não cobrança: o ALTAR não sabe se houve acordo, adiamento ou
 * pagamento por fora. A ação é abrir o Financeiro.
 */
function LinhaDoDinheiro({ vencido }: { vencido: Vencidos }) {
  // `undefined` é "ainda não sei" — e uma linha de dinheiro que pisca na tela
  // toda manhã é pior do que meio segundo de espera.
  if (!vencido?.temAlgo) return null;

  const partes: string[] = [];
  if (vencido.aReceber.quantidade > 0) {
    partes.push(
      `${vencido.aReceber.quantidade === 1 ? "1 a receber" : `${vencido.aReceber.quantidade} a receber`} · ${brl.format(vencido.aReceber.total)}`,
    );
  }
  if (vencido.aPagar.quantidade > 0) {
    partes.push(
      `${vencido.aPagar.quantidade === 1 ? "1 a pagar" : `${vencido.aPagar.quantidade} a pagar`} · ${brl.format(vencido.aPagar.total)}`,
    );
  }

  return (
    <Link
      to="/financeiro"
      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/50 cursor-pointer border-b border-border"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Wallet className="size-4 text-primary flex-shrink-0" />
        <p className="text-sm truncate">
          <span className="font-medium">Venceu e não foi liquidado</span>
          <span className="text-muted-foreground"> · {partes.join(" · ")}</span>
        </p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
    </Link>
  );
}

export function AttentionBoard() {
  const eventos = useQuery(api.dashboard.getAttentionBoard);
  // As três fontes ficam no PAI porque o estado vazio depende das três. Com a
  // consulta dentro de cada linha, o cartão exibia "2 a receber · R$ 43.500" e
  // logo abaixo "Nada pedindo atenção agora" — as duas coisas ao mesmo tempo.
  const funil = useQuery(api.funil.getFollowUp);
  const vencido = useQuery(api.financeiro.getVencidos);

  if (eventos === undefined) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  // Só é vazio quando as TRÊS não têm nada a dizer. Consulta ainda carregando
  // não conta como "nada": é silêncio, não resposta.
  const vazio =
    eventos.length === 0 && !vencido?.temAlgo && (funil?.total ?? 0) === 0;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4 text-primary" /> Precisam da sua atenção
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Eventos, oportunidades e dinheiro com alguma pendência registrada
        </p>
      </div>

      <LinhaDoDinheiro vencido={vencido} />
      <LinhaDoFunil funil={funil} />

      {vazio ? (
        <div className="px-5 py-8 text-center">
          <CheckCircle2 className="size-6 text-green-600 dark:text-green-500 mx-auto" />
          <p className="text-sm font-medium mt-2">Nada pedindo atenção agora</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Nenhum evento próximo com pendência, nenhuma oportunidade parada e nada
            vencido no Financeiro. Assim que algo ficar em aberto, aparece aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {eventos.map((ev) => (
            <div key={ev.eventId} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <Link
                  to={`/eventos/${ev.eventId}`}
                  className="font-medium text-sm hover:text-primary cursor-pointer truncate"
                >
                  {ev.nome}
                </Link>
                {(() => {
                  // A etiqueta é do PRAZO, não do nível: um evento que já
                  // aconteceu saía em âmbar de "atenção", no mesmo tom de um
                  // que ainda vai acontecer — e escrito "em -3 dias".
                  const prazo = prazoDoEvento(ev.diasAte);
                  return (
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                        prazo.tom === "passado"
                          ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          : ev.nivel === "urgente"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                      )}
                    >
                      {prazo.texto}
                    </span>
                  );
                })()}
              </div>

              <ul className="mt-2 space-y-1">
                {ev.motivos.map((m, i) => (
                  <li key={i}>
                    <Link
                      to={m.destino}
                      className="text-sm text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5 group"
                    >
                      <span className="size-1.5 rounded-full bg-primary flex-shrink-0" />
                      <span className="flex-1">{m.texto}</span>
                      <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
