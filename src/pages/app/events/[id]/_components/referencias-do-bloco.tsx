import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FOTOS DE REFERÊNCIA DE UM BLOCO — INSPIRAÇÃO × MODELO APROVADO
//
// Não há upload aqui nem cópia de arquivo: são as fotos da GALERIA do evento,
// com o mesmo `projectScope` que o Projeto Visual e o Caderno já leem.
//
//   Inspiração      = "referencia" — o caderno a rotula REFERÊNCIA VISUAL
//   Modelo aprovado = "incluso"    — o caderno a rotula CONTRATADO
//
// Inspiração NUNCA vira contratado sozinha: só o toque dela em "Modelo
// aprovado" muda a classificação.
// ─────────────────────────────────────────────────────────────────────────────

const OPCOES = [
  { valor: "referencia", rotulo: "Inspiração" },
  { valor: "incluso", rotulo: "Modelo aprovado" },
] as const;

export function ReferenciasDoBloco({ eventId, ambiente }: { eventId: Id<"events">; ambiente?: string }) {
  const fotos = useQuery(api.gallery.listPhotos, { eventId, category: "antes", ...(ambiente ? { ambiente } : {}) });
  const atualizar = useMutation(api.gallery.updatePhoto);
  if (fotos === undefined) return null;

  const marcar = async (id: Id<"eventPhotos">, valor: "referencia" | "incluso") => {
    try {
      await atualizar({ id, projectScope: valor });
    } catch {
      toast.error("Não foi possível marcar a foto.");
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fotos de referência{ambiente ? ` · ${ambiente}` : ""}
        </h4>
        <Link to={`/eventos/${eventId}/fotos`} className="text-xs text-primary hover:underline">
          Enviar na Galeria
        </Link>
      </div>
      {fotos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma foto{ambiente ? ` com o ambiente “${ambiente}”` : ""} na Galeria ainda.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.map((f) => (
            <figure key={f._id} className="min-w-0">
              <img src={f.previewUrl ?? f.url ?? ""} alt={f.caption ?? ""} loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover bg-muted" />
              <div className="mt-1 flex gap-1">
                {OPCOES.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => void marcar(f._id, o.valor)}
                    className={cn(
                      "flex-1 rounded-full border px-1.5 py-0.5 text-[10px] cursor-pointer",
                      f.projectScope === o.valor
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
