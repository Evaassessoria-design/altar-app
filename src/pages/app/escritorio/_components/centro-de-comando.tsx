import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatTimestamp } from "@/lib/safe-date.ts";
import { cn } from "@/lib/utils.ts";
import {
  AlertOctagon, AlertTriangle, Bot, CheckCircle2, Hourglass, Sparkles, User, Globe,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// CENTRO DE COMANDO — "o que aconteceu desde a última vez que entrei?"
//
// O relatório vem pronto do servidor (`escritorio.centroDeComando`), por
// relevância. Esta tela só desenha — e diz de QUE período está falando, com o
// nome que o servidor decidiu, nunca "desde sua última visita" quando não é.
//
// A última visita mora no navegador: é conveniência de quem olha, não dado do
// negócio. Sem ela (aba anônima, outro aparelho), o relatório cobre 24h.
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE = "altar.escritorio.ultimaVisita";

function lerUltimaVisita(): number | undefined {
  try {
    const n = Number(window.localStorage.getItem(CHAVE));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

const TITULO_DO_PERIODO = {
  ultima_visita: "Desde sua última visita",
  ultimas_24h: "Nas últimas 24 horas",
  ultimos_7_dias: "Nos últimos 7 dias",
} as const;

type Linha = { texto: string; link?: string };

function Gaveta({
  titulo, icone: Icone, linhas, tom,
}: {
  titulo: string;
  icone: typeof AlertTriangle;
  linhas: Linha[];
  tom: "urgente" | "atencao" | "neutro";
}) {
  if (linhas.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tom === "urgente" && "border-destructive/40 bg-destructive/5",
        tom === "atencao" && "border-amber-300/70 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-900/10",
        tom === "neutro" && "bg-card",
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-2">
        <Icone className="size-4" /> {titulo}
      </p>
      <ul className="space-y-1.5">
        {linhas.map((l, i) => (
          <li key={i} className="text-sm">
            {l.link ? (
              <Link to={l.link} className="hover:underline">{l.texto}</Link>
            ) : (
              l.texto
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ATOR = {
  sistema: { icone: Bot, rotulo: "Escritório" },
  pessoa: { icone: User, rotulo: "Equipe" },
  landing: { icone: Globe, rotulo: "Landing" },
} as const;

export function CentroDeComando() {
  // Lida UMA vez, na montagem: é o "antes" desta visita. Gravar a visita atual
  // em seguida não pode mudar o período que esta tela está mostrando.
  const [ultimaVisita] = useState(lerUltimaVisita);
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      // Sem armazenamento, a próxima visita cobre 24h. Nada quebra.
    }
  }, []);

  const c = useQuery(api.escritorio.centroDeComando, { ultimaVisita });

  if (c === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const r = c.relatorio;
  return (
    <section className="space-y-4" aria-label="Centro de comando">
      <div>
        <h2 className="text-lg font-semibold">{TITULO_DO_PERIODO[c.janela.base]}</h2>
        <p className="text-xs text-muted-foreground">
          desde {formatTimestamp(c.janela.desde)}
          {c.leituraIncompleta && " · alguma lista passou do limite de leitura — pode haver mais"}
        </p>
      </div>

      {r.tudoEmDia && (
        <p className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm">
          <CheckCircle2 className="size-4 text-primary" />
          Nada urgente, nada fora do normal e nada esperando decisão sua.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Gaveta titulo="Urgente" icone={AlertOctagon} linhas={r.urgente} tom="urgente" />
        <Gaveta titulo="Aguardando você" icone={Hourglass} linhas={r.aguardandoVoce} tom="atencao" />
        <Gaveta titulo="Atenção" icone={AlertTriangle} linhas={r.atencao} tom="atencao" />
        <Gaveta titulo="Oportunidades" icone={Sparkles} linhas={r.oportunidades} tom="neutro" />
        <Gaveta titulo="Trabalho feito" icone={CheckCircle2} linhas={r.realizado} tom="neutro" />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide mb-2">Atividade</p>
        {c.feed.atividades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade registrada neste período.
          </p>
        ) : (
          <ol className="space-y-2">
            {c.feed.atividades.map((a, i) => {
              const ator = ATOR[a.ator];
              return (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-28 flex-shrink-0 text-xs text-muted-foreground tabular-nums pt-0.5">
                    {formatTimestamp(a.em)}
                  </span>
                  <span className="flex min-w-0 items-start gap-1.5">
                    <ator.icone className="mt-0.5 size-3.5 flex-shrink-0 text-muted-foreground" aria-label={ator.rotulo} />
                    <span className="break-words">{a.texto}</span>
                  </span>
                </li>
              );
            })}
            {c.feed.cortado && (
              <li className="text-xs text-muted-foreground">Mostrando as mais recentes — há mais.</li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}
