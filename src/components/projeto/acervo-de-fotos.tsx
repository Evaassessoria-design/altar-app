import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Input } from "@/components/ui/input.tsx";
import { ImagePlus, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { urlDeExibicao } from "@/lib/imagem-reduzida.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A GRADE DO ACERVO — AS FOTOS DOS OUTROS EVENTOS
//
// ── POR QUE É UM COMPONENTE, E NÃO DUAS CÓPIAS ──────────────────────────────
// Dois lugares precisam da mesma grade: o seletor de foto do item ("use aquele
// arco de 2024 aqui") e a Galeria do evento ("traga aquelas referências para
// esta pasta"). São ações diferentes com a MESMA lista, a mesma busca, o mesmo
// aviso de teto e a mesma etiqueta de evento.
//
// Este repositório já pagou três vezes por cópias assim — cinco mapas de tipo
// de evento, três nomes para composição. Quem escolhe o que FAZER com a foto é
// quem chama, por `onEscolher`; a grade não sabe e não decide.
//
// ── A CONSULTA SÓ ACONTECE QUANDO ALGUÉM OLHA ───────────────────────────────
// `ativo` existe para isso: quem vai escolher uma foto do próprio evento não
// deve pagar a leitura de cinco anos de imagens. Fora da aba, a consulta nem
// sai do navegador.
// ─────────────────────────────────────────────────────────────────────────────

export function AcervoDeFotos({
  /** Fotos deste evento saem da lista — ela já as tem à mão. */
  excetoEventoId,
  /** `false` não consulta nada. */
  ativo = true,
  ocupado = false,
  onEscolher,
}: {
  excetoEventoId?: Id<"events">;
  ativo?: boolean;
  ocupado?: boolean;
  onEscolher: (photoId: Id<"eventPhotos">) => void;
}) {
  const [busca, setBusca] = useState("");

  const acervo = useQuery(
    api.gallery.meuAcervo,
    ativo ? { excetoEventoId, busca: busca.trim() || undefined } : "skip",
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por legenda ou arquivo"
          // `h-10` e não `h-9`: é um campo que se toca com o polegar, e no
          // celular ele abre o teclado por cima de metade do diálogo.
          className="pl-8 h-10"
        />
      </div>

      {acervo === undefined ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : acervo.fotos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {busca.trim()
            ? "Nenhuma foto do seu acervo bate com essa busca."
            : "Seus outros eventos ainda não têm fotos. Elas aparecem aqui conforme você trabalha."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {acervo.fotos.map((f) => (
              <button
                key={f._id}
                disabled={ocupado}
                onClick={() => onEscolher(f._id)}
                title={`${f.caption || f.filename} — ${f.eventoNome}`}
                className={cn(
                  // `aspect-square` + `min-h-20`: grade regular com fotos em
                  // retrato e alvo de toque que o polegar acerta a 320 px.
                  "relative aspect-square min-h-20 rounded-lg overflow-hidden border-2 border-transparent hover:border-primary/50 transition-colors cursor-pointer bg-muted",
                  ocupado && "opacity-50",
                )}
              >
                {urlDeExibicao(f) ? (
                  <img
                    // SEMPRE a versão leve quando existe. Uma grade de 120
                    // fotos pelo original seriam centenas de MB no 4G.
                    src={urlDeExibicao(f)!}
                    alt={f.caption || f.filename}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center">
                    <ImagePlus className="size-4 text-muted-foreground" />
                  </span>
                )}
                {/* De qual casamento ela é. Sem isto a grade é um mural sem
                    memória — e é justamente a memória que ela veio buscar. */}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9px] leading-tight text-white truncate">
                  {f.eventoNome}
                </span>
              </button>
            ))}
          </div>

          {acervo.temMais && (
            // A tela nunca afirma o que não sabe.
            <p className="text-xs text-muted-foreground">
              {acervo.fotos.length} fotos carregadas (há mais). Use a busca para encontrar
              o que procura.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            A foto escolhida entra neste evento sem ser enviada de novo — é o mesmo
            arquivo.
          </p>
        </>
      )}
    </div>
  );
}
