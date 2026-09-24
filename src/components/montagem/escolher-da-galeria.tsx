import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { urlDeExibicao } from "@/lib/imagem-reduzida.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A MESMA FOTO, UMA VEZ SÓ
//
// ── O TRABALHO QUE ISTO APAGA ───────────────────────────────────────────────
// Ela sobe trinta fotos do projeto na Galeria, classifica cada uma por
// ambiente e escopo — e, para pendurar uma delas num item de montagem, tinha
// de ENVIAR O MESMO ARQUIVO DE NOVO. Dois uploads no 4G do sítio, dois
// arquivos cobrados, e duas verdades: reclassificar na Galeria não mexia na
// cópia presa ao item.
//
// ── ESTA TELA NÃO SOBE NEM APAGA NADA ───────────────────────────────────────
// A Galeria é a biblioteca; aqui só se ESCOLHE. O que sai daqui é um
// ponteiro (`assemblyItems.referencePhotoId`), nunca uma cópia — o arquivo
// continua sendo um só, como na capa do evento.
// ─────────────────────────────────────────────────────────────────────────────

export function EscolherDaGaleria({
  eventId,
  titulo,
  onEscolher,
  onFechar,
}: {
  eventId: Id<"events">;
  titulo: string;
  onEscolher: (photoId: Id<"eventPhotos">) => void;
  onFechar: () => void;
}) {
  const fotos = useQuery(api.gallery.listPhotos, { eventId });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            As fotos deste evento. Escolher não cria cópia — é a mesma imagem da Galeria.
          </DialogDescription>
        </DialogHeader>

        {fotos === undefined ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        ) : fotos.length === 0 ? (
          // Não promete o que não existe: sem foto na Galeria, o caminho é
          // enviar uma — e essa porta continua no próprio item.
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este evento ainda não tem fotos na Galeria. Envie por lá, ou use
            "Adicionar" para subir uma foto só deste item.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotos.map((foto) => (
              <button
                key={foto._id}
                onClick={() => onEscolher(foto._id)}
                title={foto.caption || foto.filename}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted transition-colors hover:border-primary cursor-pointer"
              >
                {/* A versão leve quando existe — a mesma regra das outras três
                    telas (`urlDeExibicao`). Baixar o original de 15 MB para
                    desenhar um quadrado de 80px é o desperdício que ela
                    existe para evitar. */}
                {urlDeExibicao(foto) ? (
                  <img
                    src={urlDeExibicao(foto)!}
                    alt={foto.caption || foto.filename}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
                    {foto.filename}
                  </span>
                )}
                {/* O ambiente, quando ela classificou. É o que distingue uma
                    foto da outra numa grade de trinta miniaturas. */}
                {foto.ambiente && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">
                    {foto.ambiente}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
