import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { TELAS_DO_EVENTO, eventoDoCaminho, telaAberta } from "@/lib/telas-do-evento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A BARRA DE TELAS DO EVENTO — um toque para qualquer lugar de dentro dele
//
// Mora no SHELL (pages/app/layout.tsx) e não em cada tela: são catorze telas,
// cada uma com um cabeçalho próprio, e repetir a barra em catorze arquivos
// garantiria que a décima quinta nascesse sem ela. Aqui ela aparece sozinha
// para toda rota de dentro de um evento, inclusive as que ainda não existem.
//
// ── NÃO FAZ CONSULTA ────────────────────────────────────────────────────────
// Nem uma. A barra é só caminho: sai do próprio endereço da página. Por isso
// aparece instantaneamente, antes de qualquer dado da tela chegar — e é
// exatamente quando a pessoa já quer tocar no próximo destino.
//
// Não desenha progresso de propósito. Quem responde "em que pé está" é a
// Jornada, na capa, com estado e detalhe por etapa. Uma pastilha pintada de
// verde aqui precisaria de sete consultas em toda navegação para dizer pior o
// que a capa já diz bem.
// ─────────────────────────────────────────────────────────────────────────────

export function BarraDoEvento() {
  const { pathname } = useLocation();
  const atual = eventoDoCaminho(pathname);
  // Capa do evento e lista de eventos não têm barra — ver `eventoDoCaminho`.
  if (!atual) return null;

  const aberta = telaAberta(atual.rota);
  const projeto = TELAS_DO_EVENTO.filter((t) => t.grupo === "projeto");
  const trabalho = TELAS_DO_EVENTO.filter((t) => t.grupo === "trabalho");

  const pastilha = (ativa: boolean) =>
    cn(
      "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
      ativa
        ? "bg-primary text-primary-foreground"
        : "bg-accent text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      aria-label="Telas deste evento"
      className="border-b border-border bg-card/60"
    >
      {/* `overflow-x-auto` no CONTÊINER, não na página: a barra rola sozinha no
          celular e a página continua sem rolagem horizontal. */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 md:px-6">
        <Link
          to={`/eventos/${atual.id}`}
          className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Evento
        </Link>

        <span className="h-4 w-px flex-shrink-0 bg-border" aria-hidden="true" />

        {projeto.map((t) => (
          <Link
            key={t.rota}
            to={`/eventos/${atual.id}/${t.rota}`}
            aria-current={t.rota === atual.rota ? "page" : undefined}
            className={pastilha(t.rota === atual.rota)}
          >
            {t.rotulo}
          </Link>
        ))}

        <span className="h-4 w-px flex-shrink-0 bg-border" aria-hidden="true" />

        {trabalho.map((t) => (
          <Link
            key={t.rota}
            to={`/eventos/${atual.id}/${t.rota}`}
            aria-current={t.rota === atual.rota ? "page" : undefined}
            className={pastilha(t.rota === atual.rota)}
          >
            {t.rotulo}
          </Link>
        ))}

        {/* Tela de dentro do evento que não está na lista: a barra NÃO afirma
            que a pessoa está em nenhuma das pastilhas. Acontece com rota nova
            antes de alguém acrescentá-la — e `telas-do-evento.test.ts` quebra
            no mesmo commit, para que isso não durasse. */}
        {aberta === undefined && (
          <span className="flex-shrink-0 px-1 text-xs text-muted-foreground">
            esta tela
          </span>
        )}
      </div>
    </nav>
  );
}
