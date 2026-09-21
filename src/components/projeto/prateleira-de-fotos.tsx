import { Link } from "react-router-dom";
import { cn } from "@/lib/utils.ts";
import type { FotoDoProjeto } from "@/lib/projeto-visual.ts";

// ─────────────────────────────────────────────────────────────────────────────
// UMA PRATELEIRA DE FOTOS, COM O SIGNIFICADO ESCRITO
//
// ── POR QUE O RÓTULO NÃO É DECORAÇÃO ────────────────────────────────────────
// "Inspiração", "Contratado" e "Como ficou" são três coisas diferentes, e
// misturá-las é a confusão mais cara da decoração: a cliente vê a foto de
// inspiração e entende que aquilo foi contratado.
//
// Por isso cada prateleira diz o que é ANTES das imagens, e as três nunca
// dividem a mesma fileira. Uma foto de inspiração não pode parecer decisão; e
// uma foto do evento que já aconteceu não pode aparecer como inspiração
// futura daquele mesmo evento.
//
// ── O TETO DE SEIS ──────────────────────────────────────────────────────────
// Um casamento tem setenta fotos. Desenhar todas aqui faria a tela baixar
// setenta ORIGINAIS — que podem ter 15 MB cada, porque o ALTAR ainda não gera
// miniatura no envio. Seis por prateleira mostram o conceito; o resto continua
// na Galeria, que é a biblioteca, e a tela DIZ quantas ficaram lá.
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE = 6;

type Props = {
  titulo: string;
  descricao?: string;
  fotos: readonly FotoDoProjeto[];
  /** Para onde vão as que não couberam. */
  verTodasEm: string;
  /** A prateleira principal do ambiente é maior. */
  destaque?: boolean;
  tom?: "inspiracao" | "contratado" | "execucao" | "neutro";
};

const TONS: Record<NonNullable<Props["tom"]>, string> = {
  inspiracao: "text-amber-700 dark:text-amber-400",
  contratado: "text-emerald-700 dark:text-emerald-400",
  execucao: "text-sky-700 dark:text-sky-400",
  neutro: "text-muted-foreground",
};

export function PrateleiraDeFotos({
  titulo,
  descricao,
  fotos,
  verTodasEm,
  destaque = false,
  tom = "neutro",
}: Props) {
  if (fotos.length === 0) return null;
  const visiveis = fotos.slice(0, LIMITE);
  const restantes = fotos.length - visiveis.length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn("text-[11px] font-semibold tracking-[0.14em] uppercase", TONS[tom])}>
          {titulo}
          <span className="ml-1.5 font-normal opacity-70">{fotos.length}</span>
        </p>
        {restantes > 0 && (
          <Link
            to={verTodasEm}
            className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            +{restantes} na Galeria
          </Link>
        )}
      </div>

      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}

      <div
        className={cn(
          "grid gap-2",
          destaque
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6",
        )}
      >
        {visiveis.map((foto) => (
          <figure key={foto._id} className="space-y-1">
            {foto.url ? (
              <img
                src={foto.url}
                alt={foto.caption ?? titulo}
                // `lazy` porque esta tela concentra imagens de propósito, e
                // `async` para o navegador não travar a rolagem decodificando.
                loading="lazy"
                decoding="async"
                className={cn(
                  "w-full rounded-lg bg-muted object-cover",
                  destaque ? "aspect-[4/3]" : "aspect-square",
                )}
              />
            ) : (
              // URL ausente acontece: arquivo removido do storage. Um quadrado
              // quebrado assusta mais do que um espaço que se explica.
              <div
                className={cn(
                  "flex w-full items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground",
                  destaque ? "aspect-[4/3]" : "aspect-square",
                )}
              >
                sem imagem
              </div>
            )}
            {foto.caption && (
              <figcaption className="truncate text-[11px] text-muted-foreground">
                {foto.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
