import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ImagePlus, Loader2, Check, Upload } from "lucide-react";
import { AcervoDeFotos } from "@/components/projeto/acervo-de-fotos.tsx";
import { cn } from "@/lib/utils.ts";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { gerarPreview, urlDeExibicao } from "@/lib/imagem-reduzida.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ESCOLHER A FOTO DE UM ITEM — DA GALERIA, OU ENVIANDO UMA NOVA
//
// ── O QUE ISTO SUBSTITUI ────────────────────────────────────────────────────
// Um `<input type="file">` escondido atrás de um retângulo tracejado. Era o
// único caminho: toda foto de item era um arquivo NOVO, mesmo quando a mesma
// imagem já estava na Galeria do evento — com ambiente, legenda, classificação
// e versão leve que o item não herdava.
//
// ── AS DUAS PORTAS LEVAM AO MESMO LUGAR ─────────────────────────────────────
// "Escolher da Galeria" grava um ponteiro (`setPhotoDaGaleria`).
// "Enviar nova" faz a foto NASCER NA GALERIA (`gallery.savePhoto`) e só então
// aponta para ela.
//
// A segunda decisão é a que importa: uma imagem que serve para explicar o
// projeto é imagem do evento, e guardá-la num canto privado do item era o que
// mantinha a Galeria incompleta. Além disso o caminho da Galeria é o único que
// gera VERSÃO LEVE — pelo caminho antigo, a miniatura de 40 px baixava o
// original inteiro.
//
// ── A TERCEIRA PORTA: O ACERVO DA EMPRESA ───────────────────────────────────
// "Já fiz esse arco em 2024" era uma frase que o produto não sabia ouvir. A
// Galeria só respondia pelo evento aberto, e cinco anos de trabalho ficavam em
// álbuns lacrados.
//
// A aba "Meus outros eventos" traz a foto sem subir nada: `reaproveitar` cria
// uma LINHA no evento de destino apontando para o MESMO arquivo. Ela entra na
// Galeria daqui — com legenda e ambiente — e só então é apontada pelo item.
//
// ── O QUE NÃO É PREENCHIDO SOZINHO ──────────────────────────────────────────
// `projectScope` NÃO é herdado do papel do slot. "Referência aprovada" no item
// é o lugar da foto no cartão; `projectScope` é uma DECISÃO COMERCIAL sobre a
// imagem ("isto foi contratado?"), e o repositório já recusou preencher isso
// por conveniência (ver `papelDaFoto` em lib/projeto-visual.ts). O ambiente,
// esse sim, é copiado do item na CRIAÇÃO — e só nela.
// ─────────────────────────────────────────────────────────────────────────────

type FotoDaGrade = {
  _id: Id<"eventPhotos">;
  url?: string | null;
  previewUrl?: string | null;
  filename: string;
  caption?: string;
  ambiente?: string;
};

export function SeletorDeFoto({
  eventId,
  itemId,
  slot,
  ambienteDoItem,
  selecionada,
  onClose,
}: {
  eventId: Id<"events">;
  itemId: Id<"assemblyItems">;
  slot: "reference" | "contracted";
  /** Ambiente do ITEM — semeia o da foto nova. Nunca reescreve foto existente. */
  ambienteDoItem?: string;
  /** Foto já apontada, para marcar na grade. */
  selecionada?: string;
  onClose: () => void;
}) {
  const fotos = useQuery(api.gallery.listPhotos, { eventId }) as FotoDaGrade[] | undefined;
  const setPhotoDaGaleria = useMutation(api.assemblyItems.setPhotoDaGaleria);
  const savePhoto = useMutation(api.gallery.savePhoto);
  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl);
  const { enviar } = useEnvioDeArquivo(generateUploadUrl, {
    tipo: "imagem",
    aceitos: ["image/"],
  });

  const reaproveitar = useMutation(api.gallery.reaproveitar);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [trabalhando, setTrabalhando] = useState<"enviando" | "vinculando" | null>(null);
  const [aba, setAba] = useState<"evento" | "acervo">("evento");

  /**
   * Traz a foto de outro evento e aponta o item para ela.
   *
   * Dois passos, nesta ordem, porque cada um responde por uma coisa:
   * `reaproveitar` põe a imagem na Galeria DESTE evento (onde ela ganha
   * ambiente e classificação próprios), e `setPhotoDaGaleria` prende ao item.
   * O item nunca aponta para foto de outro evento — `requireEventPhoto` faz
   * essa pergunta no servidor e recusaria.
   */
  const trazerDoAcervo = async (photoId: Id<"eventPhotos">) => {
    setTrabalhando("vinculando");
    try {
      const daqui = await reaproveitar({
        photoId,
        paraEventoId: eventId,
        ambiente: ambienteDoItem?.trim() || undefined,
      });
      await setPhotoDaGaleria({ id: itemId, slot, photoId: daqui });
      toast.success("Foto trazida do seu acervo.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível trazer esta foto.",
      );
    } finally {
      setTrabalhando(null);
    }
  };

  const escolher = async (photoId: Id<"eventPhotos">) => {
    setTrabalhando("vinculando");
    try {
      await setPhotoDaGaleria({ id: itemId, slot, photoId });
      toast.success("Foto escolhida.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível usar esta foto.",
      );
    } finally {
      setTrabalhando(null);
    }
  };

  const enviarNova = async (arquivo: File) => {
    setTrabalhando("enviando");
    try {
      const r = await enviar(arquivo);
      if (!r.ok) {
        toast.error(r.motivo);
        return;
      }
      // A versão leve vem DEPOIS do original já guardado, e `null` é resultado
      // legítimo (HEIC no Android, imagem já pequena). Mesma ordem da Galeria.
      let previewStorageId: Id<"_storage"> | undefined;
      const preview = await gerarPreview(arquivo);
      if (preview) {
        const p = await enviar(preview);
        if (p.ok) previewStorageId = p.storageId;
      }

      const photoId = await savePhoto({
        eventId,
        storageId: r.storageId,
        previewStorageId,
        filename: arquivo.name,
        // "antes" é a fase de PLANEJAMENTO — que é o que uma referência de
        // item é. As fotos de montagem/evento/desmontagem registram o que
        // aconteceu, e não é isso que está sendo enviado aqui.
        category: "antes",
        ambiente: ambienteDoItem?.trim() || undefined,
      });
      await setPhotoDaGaleria({ id: itemId, slot, photoId });
      toast.success("Foto enviada e adicionada à Galeria.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Erro ao enviar a foto.",
      );
    } finally {
      setTrabalhando(null);
    }
  };

  const ocupado = trabalhando !== null;

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      {/* Altura limitada por `svh` e não `vh`: no Safari do iPhone a barra de
          endereço faz `vh` prometer uma altura que a tela não tem, e o rodapé
          do diálogo fica embaixo do navegador. */}
      <DialogContent className="max-w-2xl max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {slot === "reference" ? "Referência aprovada" : "Item contratado"}
          </DialogTitle>
          <DialogDescription>
            Escolha uma foto que já está na Galeria deste evento — ou envie uma nova, que
            entra na Galeria junto.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enviarNova(f);
            e.target.value = "";
          }}
        />

        <Button
          variant="secondary"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer gap-2 w-full h-11"
        >
          {trabalhando === "enviando" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {trabalhando === "enviando" ? "Enviando…" : "Enviar nova foto"}
        </Button>

        {/* Duas fontes, uma tela. Um segundo diálogo por cima deste seria
            exatamente o que não cabe num telefone. */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([
            ["evento", "Deste evento"],
            ["acervo", "Meus outros eventos"],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setAba(valor)}
              disabled={ocupado}
              // `flex-1` + `h-9`: dois alvos largos, que é o que o polegar
              // acerta. Rótulo longo não quebra a caixa porque cada um ocupa
              // metade exata.
              className={cn(
                "flex-1 h-9 rounded-md text-sm font-medium transition-colors cursor-pointer",
                aba === valor
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>


        {aba === "acervo" ? (
          <AcervoDeFotos
            excetoEventoId={eventId}
            ocupado={ocupado}
            onEscolher={(photoId) => void trazerDoAcervo(photoId)}
          />
        ) : fotos === undefined ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : fotos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            A Galeria deste evento ainda está vazia. Envie a primeira foto acima — ela fica
            guardada no evento, não só neste item.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {fotos.map((f) => {
              const marcada = f._id === selecionada;
              return (
                <button
                  key={f._id}
                  disabled={ocupado}
                  onClick={() => void escolher(f._id)}
                  title={f.caption || f.filename}
                  className={cn(
                    // `aspect-square` mantém a grade regular com nomes longos e
                    // fotos em retrato; `min-h-20` garante alvo de toque.
                    "relative aspect-square min-h-20 rounded-lg overflow-hidden border-2 transition-colors cursor-pointer bg-muted",
                    marcada ? "border-primary" : "border-transparent hover:border-primary/50",
                    ocupado && "opacity-50",
                  )}
                >
                  {/* SEMPRE a versão leve quando existe. Uma grade de 40 fotos
                      pelo original seriam centenas de MB no 4G do galpão. */}
                  {urlDeExibicao(f) ? (
                    <img
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
                  {marcada && (
                    <span className="absolute top-1 right-1 rounded-full bg-primary text-primary-foreground p-0.5">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {trabalhando === "vinculando" && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> Vinculando…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
