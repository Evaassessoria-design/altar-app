import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { AlertTriangle, CalendarClock, CheckCheck, PenLine, Users } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// COMERCIAL — HOJE
//
// ── A PERGUNTA QUE ESTA SEÇÃO RESPONDE ──────────────────────────────────────
// "Se eu tivesse trinta minutos para a campanha hoje, no que eu mexeria?"
//
// Não é um relatório. Relatório mostra tudo e deixa a priorização para quem
// lê — que é o trabalho que ninguém tem tempo de fazer às oito da manhã.
//
// ── TRÊS BLOCOS, E O DE BAIXO É O MAIS IMPORTANTE ───────────────────────────
//   HOJE             o estado, em números que fecham com o funil
//   PREPARADO        o que já está escrito e esperando revisão
//   PRECISA DE VOCÊ  o que nenhum modelo de texto resolve
//
// O terceiro é o que separa este produto de um disparador: negociação, preço,
// duplicidade e pedido de ligação sobem para uma pessoa, sempre.
// ─────────────────────────────────────────────────────────────────────────────

function Bloco({
  titulo,
  icone: Icone,
  children,
  tom,
}: {
  titulo: string;
  icone: typeof Users;
  children: React.ReactNode;
  tom?: "atencao";
}) {
  return (
    <section>
      <h3
        className={cn(
          "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
          tom === "atencao" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
        )}
      >
        <Icone className="size-3.5" /> {titulo}
      </h3>
      {children}
    </section>
  );
}

export function ComercialHoje({ campanha }: { campanha: string }) {
  const dados = useQuery(api.comercialBriefing.hoje, { campanha });
  const prepararLote = useMutation(api.campanhaRascunhos.prepararPendentes);
  const [preparando, setPreparando] = useState(false);

  if (dados === undefined) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  async function prepararTudo() {
    setPreparando(true);
    try {
      const r = await prepararLote({ campanha });
      if (r.preparados === 0) {
        // "0 preparados" precisa de explicação: a causa quase sempre é que já
        // existe rascunho para todo mundo, e um toast neutro faria parecer
        // defeito.
        toast.info("Nada novo a preparar", {
          description: "Todo mundo que precisa de mensagem já tem uma escrita.",
        });
      } else {
        toast.success(
          `${r.preparados} ${r.preparados === 1 ? "mensagem escrita" : "mensagens escritas"}`,
          {
            description:
              r.restantes > 0
                ? `Faltaram ${r.restantes}. Clique de novo para continuar de onde parou.`
                : "Revise antes de enviar. O ALTAR não envia nada.",
          },
        );
      }
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? String((e.data as { message?: string })?.message) : "Não deu certo",
      );
    } finally {
      setPreparando(false);
    }
  }

  const { campanha: info } = dados;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4 text-primary" /> Comercial — hoje
        </h2>
        {info && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {info.nome} ·{" "}
            {info.situacao === "hoje"
              ? "é hoje"
              : info.situacao === "realizada"
                ? "já aconteceu"
                : `em ${info.diasAte} ${info.diasAte === 1 ? "dia" : "dias"}`}
            {/* A sala não existe. Dizer isso é melhor do que um campo vazio que
                parece defeito de carregamento — e muito melhor do que um link
                inventado. */}
            {!info.linkDefinido && " · link da sala ainda não definido"}
          </p>
        )}
        <p className="mt-2 text-sm">{dados.resumo}</p>
        {!dados.completa && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            Li {dados.pessoasLidas} pessoas e há mais. Os números abaixo são desta amostra.
          </p>
        )}
      </div>

      {dados.hoje.length > 0 && (
        <Bloco titulo="Hoje" icone={Users}>
          <ul className="space-y-1">
            {dados.hoje.map((l) => (
              <li key={l.chave} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-8 font-semibold tabular-nums">{l.quantidade}</span>
                <span className="text-muted-foreground">{l.rotulo}</span>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {/* O bloco SOME quando não há nada preparado, em vez de mostrar "0
          convites". Anunciar trabalho que não existe é a forma mais rápida de
          alguém parar de acreditar no resto da tela. */}
      {dados.preparado.length > 0 && (
        <Bloco titulo="Preparado" icone={PenLine}>
          <ul className="space-y-1">
            {dados.preparado.map((l) => (
              <li key={l.chave} className="text-sm text-muted-foreground">
                {l.rotulo}
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {dados.precisaDeVoce.length > 0 && (
        <Bloco titulo="Precisa de você" icone={AlertTriangle} tom="atencao">
          <ul className="space-y-2">
            {dados.precisaDeVoce.map((p) => (
              <li key={p.chave} className="rounded-lg border border-border/60 p-2.5 text-sm">
                <p className="font-medium leading-tight">{p.pessoa}</p>
                <p className="text-xs leading-tight text-muted-foreground">{p.motivo}</p>
                <p className="mt-1 text-xs leading-tight text-primary">{p.sugestao}</p>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {dados.precisaDeVoce.length === 0 && dados.hoje.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCheck className="size-4 text-green-600 dark:text-green-400" />
          Nada esperando uma decisão sua.
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={preparando}
        onClick={() => void prepararTudo()}
        className="w-full cursor-pointer gap-1.5 sm:w-auto"
      >
        <PenLine className="size-3.5" />
        {preparando ? "Escrevendo…" : "Escrever o que está faltando"}
      </Button>
      {/* A frase fica ao lado do botão que mais parece um disparador. É o lugar
          onde ela precisa estar. */}
      <p className="-mt-3 text-xs text-muted-foreground">
        O ALTAR escreve e para. Quem envia é você, pelo seu WhatsApp.
      </p>
    </div>
  );
}
