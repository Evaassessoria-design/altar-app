import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { SituacaoDoMarco } from "@/convex/lib/prontidaoDaConta";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { ChevronDown, ChevronUp, PartyPopper, Rocket } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// "MEU ALTAR ESTÁ PRONTO?"
//
// ── POR QUE NÃO É O AVISO DE PRIMEIROS PASSOS ───────────────────────────────
// Aquele responde "a configuração mínima está feita?", é dispensável e some
// para sempre. Esta pergunta é outra: a EMPRESA dela já está dentro do ALTAR?
//
// Uma conta com nome de estúdio e um evento vazio passa nos três primeiros
// passos e ainda não fez nada que valha a assinatura. Esta seção mede a
// jornada até o momento em que o ALTAR se paga — e continua disponível depois,
// porque a resposta muda conforme a empresa entra.
//
// ── PROGRESSIVE DISCLOSURE, DE VERDADE ──────────────────────────────────────
// Aberta enquanto falta essencial; fechada quando está pronta. Quem acabou de
// entrar vê a lista inteira sem clicar; quem já está rodando vê uma linha e
// segue a vida. Não é um tour, não tem "próximo", não bloqueia nada.
//
// ── O MOMENTO AHA VEM SEPARADO DA BARRA ─────────────────────────────────────
// Uma conta pode ter 100% dos essenciais e ainda não ter gerado um projeto
// para mandar para a cliente. Essa distância é justamente o que a tela precisa
// mostrar, em vez de esconder atrás de uma barra cheia.
// ─────────────────────────────────────────────────────────────────────────────

const SINAL: Record<SituacaoDoMarco, { marca: string; classe: string }> = {
  feito: { marca: "✓", classe: "text-green-600 dark:text-green-400" },
  parcial: { marca: "◐", classe: "text-amber-600 dark:text-amber-500" },
  pendente: { marca: "○", classe: "text-muted-foreground" },
};

export function MeuAltarEstaPronto() {
  const dados = useQuery(api.onboarding.prontidao, {});
  // `null` = ela ainda não mexeu no controle. Aí o padrão manda: aberta
  // enquanto falta essencial, fechada quando está pronta.
  const [escolha, setEscolha] = useState<boolean | null>(null);

  if (dados === undefined) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  const aberta = escolha ?? !dados.pronto;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setEscolha(!aberta)}
        aria-expanded={aberta}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <Rocket className="size-4 text-primary" /> Meu ALTAR está pronto?
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dados.pronto
              ? dados.aha.alcancado
                ? "Tudo no lugar."
                : "O essencial está pronto."
              : // O número de minutos é a promessa que a tela faz. Ele soma as
                // estimativas do que falta, e por isso encolhe de verdade a
                // cada passo — em vez de ser um "quase lá" que nunca muda.
                `Faltam ~${dados.minutosRestantes} min`}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {dados.feitos}/{dados.essenciais}
          </span>
          {aberta ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      <div className="px-5 pb-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${dados.percentual}%` }}
            role="progressbar"
            aria-valuenow={dados.percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da configuração"
          />
        </div>
      </div>

      {aberta && (
        <div className="space-y-4 p-5 pt-4">
          {/* ── O AHA ────────────────────────────────────────────────────
              Em destaque, e separado da lista: é o único item que não é uma
              tarefa, é o resultado. */}
          <div
            className={cn(
              "rounded-lg border p-3",
              dados.aha.alcancado
                ? "border-green-600/30 bg-green-50 dark:bg-green-950/30"
                : "border-primary/30 bg-primary/5",
            )}
          >
            <p className="flex items-start gap-2 text-sm font-medium leading-tight">
              {dados.aha.alcancado && (
                <PartyPopper className="mt-0.5 size-4 flex-shrink-0 text-green-600 dark:text-green-400" />
              )}
              {dados.aha.titulo}
            </p>
            <p className="mt-0.5 text-xs leading-tight text-muted-foreground">
              {dados.aha.detalhe}
            </p>
          </div>

          <ul className="space-y-2.5">
            {dados.marcos.map((m) => (
              <li key={m.chave} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn("mt-0.5 flex-shrink-0 text-sm", SINAL[m.situacao].classe)}
                >
                  {SINAL[m.situacao].marca}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight">
                    {m.titulo}
                    {!m.essencial && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(quando quiser)</span>
                    )}
                  </p>
                  {/* O PORQUÊ vem antes da contagem. "Configure seu estúdio"
                      não diz a ninguém por que valeria a pena; "é o que
                      aparece no topo de toda proposta" diz. */}
                  <p className="text-xs leading-tight text-muted-foreground">{m.porque}</p>
                  <p className="text-xs leading-tight text-muted-foreground">
                    {m.detalhe}
                    {maisQueOTeto(m.chave, dados.contagensLimitadas) && " ou mais"}
                  </p>
                  {m.situacao !== "feito" && (
                    <Link
                      to={m.destino}
                      className="mt-0.5 inline-block text-xs text-primary hover:underline"
                    >
                      {m.acao} →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * A contagem deste marco bateu no teto da consulta?
 *
 * Sem isto, uma conta com cinquenta flores leria "6 cadastrados" e concluiria
 * que o catálogo tinha sumido. A consulta lê só o que a regra precisa; a tela
 * escreve "ou mais" onde a leitura parou.
 */
function maisQueOTeto(
  chave: string,
  limitadas: { materiais: boolean; fornecedores: boolean; eventos: boolean },
): boolean {
  if (chave === "catalogo") return limitadas.materiais;
  if (chave === "fornecedores") return limitadas.fornecedores;
  if (chave === "evento") return limitadas.eventos;
  return false;
}
