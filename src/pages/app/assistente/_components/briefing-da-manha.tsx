import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { ITENS_EM_DESTAQUE, type Gravidade } from "@/convex/lib/assistente/briefing";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// O BRIEFING DA MANHÃ
//
// ── POR QUE ELE VEM ANTES DA CAIXA DE PERGUNTA ──────────────────────────────
// Porque a pergunta que a decoradora mais precisa fazer é a que ela não sabe
// que precisa fazer. O recebimento que venceu ontem fica invisível até alguém
// lembrar de procurá-lo — e ninguém lembra.
//
// Esta seção inverte a ordem: o ALTAR olha, separa e apresenta. Ela decide.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
// Não é um feed. Mostra cinco linhas e resume o resto — um briefing de vinte
// linhas é uma caixa de entrada, e caixa de entrada é justamente o que ela já
// tem e não lê.
//
// Não inventa: cada linha carrega o número que a gerou e leva à tela onde se
// resolve. E quando não há nada, ela DIZ que não há, em vez de ficar em branco
// como se estivesse carregando para sempre.
// ─────────────────────────────────────────────────────────────────────────────

const TOM: Record<Gravidade, string> = {
  critico: "text-destructive",
  atencao: "text-amber-600 dark:text-amber-500",
  oportunidade: "text-primary",
  informativo: "text-muted-foreground",
};

const MARCA: Record<Gravidade, string> = {
  critico: "bg-destructive",
  atencao: "bg-amber-500",
  oportunidade: "bg-primary",
  informativo: "bg-muted-foreground/40",
};

export function BriefingDaManha() {
  const [mostrarTudo, setMostrarTudo] = useState(false);
  // A hora vem do NAVEGADOR: o servidor não sabe o fuso dela, e chutar
  // Brasília faria o "Bom dia" aparecer às 22h para quem está em Portugal.
  const briefing = useQuery(api.assistenteBriefing.daManha, {
    hora: new Date().getHours(),
  });

  if (briefing === undefined) {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  const visiveis = mostrarTudo ? briefing.itens : briefing.itens.slice(0, ITENS_EM_DESTAQUE);
  const escondidos = briefing.itens.length - visiveis.length;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-serif text-lg leading-tight">{briefing.saudacao}</h2>
        <p className="text-sm text-muted-foreground">{briefing.resumo}</p>
      </div>

      {briefing.tudoEmDia ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 flex-shrink-0 text-green-600 dark:text-green-400" />
          {/* Um "tudo certo" precisa dizer o que foi conferido, senão é só uma
              tela vazia com um tique verde. */}
          Conferi financeiro, funil, eventos e compras. Nada vencido, nada
          atrasado, nada esperando você.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visiveis.map((item) => (
            <li key={item.chave}>
              <Link
                to={item.destino}
                className="group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-accent"
              >
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-1.5 flex-shrink-0 rounded-full", MARCA[item.gravidade])}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("text-sm font-medium leading-tight", TOM[item.gravidade])}>
                    {item.titulo}
                  </span>
                  {item.detalhe && (
                    <span className="block text-xs leading-tight text-muted-foreground">
                      {item.detalhe}
                    </span>
                  )}
                </span>
                <ChevronRight className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {escondidos > 0 && (
        <button
          onClick={() => setMostrarTudo(true)}
          className="cursor-pointer text-xs text-primary hover:underline"
        >
          Ver mais {escondidos}
        </button>
      )}

      {/* ── O QUE NÃO FOI OLHADO ────────────────────────────────────────────
          Uma tela que diz "está tudo bem" sobre uma área que ninguém mediu é
          pior do que uma tela que não diz nada. Quando uma área fica de fora,
          ela é nomeada.

          Só que "ficou de fora" e "entrou por outro caminho" são coisas
          diferentes: fornecedores e acervo chegam pelos eventos, e listá-los
          aqui fazia esta linha aparecer em toda conta, todo dia. Aviso que
          aparece sempre não é aviso — é ruído, e ruído ensina a ignorar a
          linha inteira, inclusive no dia em que ela apontar uma falha real. */}
      {briefing.areasNaoMedidas.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Não consegui olhar: {briefing.areasNaoMedidas.join(", ")}.
        </p>
      )}

      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground">
          O que eu conferi
        </summary>
        <ul className="mt-1.5 space-y-0.5">
          {briefing.trabalhoApurado.map((linha) => (
            <li key={linha} className="text-xs text-muted-foreground">
              · {linha}
            </li>
          ))}
          <li className="text-xs text-muted-foreground">· {briefing.observacao}</li>
        </ul>
      </details>
    </section>
  );
}
