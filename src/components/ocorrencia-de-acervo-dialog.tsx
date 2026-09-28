import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { Camera, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { mensagemSeguraDoErro } from "@/lib/mensagem-segura.ts";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";
import {
  CONDICOES,
  ROTULO_DA_CONDICAO,
  condicoesDoItem,
  moverCondicao,
  type Condicao,
  type Destino,
} from "@/convex/lib/condicaoDoAcervo.ts";

// ─────────────────────────────────────────────────────────────────────────────
// OCORRÊNCIA DO ACERVO — "a poltrona Siena está com o pé solto"
//
// Feita para quem está no galpão, em pé, com o celular numa mão e a peça na
// outra. Por isso: botões grandes (44 px ou mais), a condição nova é um toque,
// a quantidade começa em 1 com + e −, e a câmera abre direto. Nada de lista
// suspensa pequena nem cinco telas.
//
// A prévia usa a MESMA função que o servidor (`moverCondicao` da lib) — o
// botão não promete o que o servidor vai recusar. Tudo fica no histórico:
// condição anterior e nova, quem registrou, observação e foto.
// ─────────────────────────────────────────────────────────────────────────────

type ItemDaOcorrencia = {
  _id: Id<"collectionItems">;
  nome: string;
  unidade: string;
  quantidadeTotal: number;
  emLimpeza?: number;
  emManutencao?: number;
  indisponivel?: number;
  emConferencia?: number;
};

const DESTINOS: Destino[] = ["limpeza", "reparo", "indisponivel", "conferencia", "pronto", "baixa"];
const ROTULO_DO_DESTINO: Record<Destino, string> = {
  ...ROTULO_DA_CONDICAO,
  baixa: "Sem conserto (dar baixa)",
};

export function OcorrenciaDeAcervoDialog({
  item,
  eventId,
  onClose,
}: {
  item: ItemDaOcorrencia;
  /** Evento de onde a peça voltou, quando a ocorrência nasce dele. */
  eventId?: Id<"events">;
  onClose: () => void;
}) {
  const mover = useMutation(api.acervo.moverCondicao);
  const gerarUrl = useMutation(api.acervo.gerarUrlDeFotoDeOcorrencia);
  const membros = useQuery(api.team.listMembers);

  const condicoes = condicoesDoItem(item);
  // Começa de "pronto" (a peça estava boa e deu problema) — ou da condição
  // que tiver peça, se não houver nenhuma pronta.
  const [de, setDe] = useState<Condicao>(
    condicoes.pronto > 0 ? "pronto" : (CONDICOES.find((c) => condicoes[c] > 0) ?? "pronto"),
  );
  const [para, setPara] = useState<Destino | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [responsavel, setResponsavel] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  const previa = para
    ? moverCondicao({ item, de, para, quantidade, unidade: item.unidade })
    : null;

  const salvar = async () => {
    if (!para || !previa?.ok) return;
    setSalvando(true);
    try {
      let fotoStorageId: Id<"_storage"> | undefined;
      if (foto) {
        const url = await gerarUrl();
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": foto.type }, body: foto });
        if (!r.ok) throw new Error("upload");
        fotoStorageId = ((await r.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      await mover({
        collectionItemId: item._id,
        de,
        para,
        quantidade,
        motivo: motivo.trim() || undefined,
        eventId,
        responsibleId: (responsavel || undefined) as Id<"teamMembers"> | undefined,
        fotoStorageId,
      });
      toast.success("Ocorrência registrada.");
      onClose();
    } catch (e) {
      toast.error(mensagemSeguraDoErro(e) ?? "Não foi possível registrar agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ocorrência — {item.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* De onde a peça sai — só as condições que têm peça. */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">A peça estava</p>
            <div className="flex flex-wrap gap-2">
              {CONDICOES.filter((c) => condicoes[c] > 0).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setDe(c); if (para === c) setPara(null); }}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 text-sm cursor-pointer",
                    de === c ? "border-primary bg-primary/10 font-medium" : "border-border",
                  )}
                >
                  {ROTULO_DA_CONDICAO[c]} <span className="text-muted-foreground">({condicoes[c]})</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">E agora está</p>
            <div className="grid grid-cols-2 gap-2">
              {DESTINOS.filter((d) => d !== de).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPara(d)}
                  className={cn(
                    "min-h-12 rounded-lg border px-3 text-sm text-left cursor-pointer",
                    para === d ? "border-primary bg-primary/10 font-medium" : "border-border",
                    d === "baixa" && "text-destructive",
                  )}
                >
                  {ROTULO_DO_DESTINO[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Quantas</p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="icon" className="size-11 cursor-pointer"
                aria-label="Menos uma" onClick={() => setQuantidade((q) => Math.max(1, q - 1))}>
                <Minus className="size-4" />
              </Button>
              <span className="min-w-12 text-center text-xl font-semibold tabular-nums">{quantidade}</span>
              <Button type="button" variant="outline" size="icon" className="size-11 cursor-pointer"
                aria-label="Mais uma" onClick={() => setQuantidade((q) => q + 1)}>
                <Plus className="size-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{abreviarUnidade(item.unidade)}</span>
            </div>
          </div>

          <div>
            <label htmlFor="oc-motivo" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              O que aconteceu
            </label>
            <AutoTextarea id="oc-motivo" minRows={2} value={motivo} placeholder="Ex.: pé traseiro com folga"
              onChange={(e) => setMotivo(e.target.value)} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* `capture`: no celular abre a câmera direto. Foto é opcional. */}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <Camera className="size-4" />
              {foto ? "Trocar foto" : "Foto (opcional)"}
              <input type="file" accept="image/*" capture="environment" className="sr-only"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </label>
            {foto && <span className="truncate text-xs text-muted-foreground">{foto.name}</span>}
          </div>

          {membros && membros.length > 0 && (
            <div>
              <label htmlFor="oc-quem" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Registrado por
              </label>
              <select id="oc-quem" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer">
                <option value="">— não informar —</option>
                {membros.map((m) => (
                  <option key={m._id} value={m._id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {previa && !previa.ok && <p className="text-sm text-destructive">{previa.motivo}</p>}
          {previa?.ok && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Prontas para uso: {previa.antes.pronto} → <strong>{previa.depois.pronto}</strong>
              {para === "baixa" && <> · no acervo: {item.quantidadeTotal} → <strong>{previa.quantidadeDepois}</strong></>}
            </p>
          )}

          <Button className="h-12 w-full cursor-pointer text-base" disabled={!previa?.ok || salvando}
            onClick={() => void salvar()}>
            {salvando ? "Registrando..." : "Registrar ocorrência"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
