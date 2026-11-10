import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Loader2, Sparkles, Upload, LayoutTemplate, Copy } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { MODELOS } from "@/convex/lib/layoutSalaoBiblioteca.ts";
import type { DadosDoLayout } from "@/convex/lib/layoutSalao.ts";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// NOVO LAYOUT — três portas, um mesmo destino (o editor):
//   · modelo pronto, com as medidas e o nº de mesas dela;
//   · um layout de OUTRO evento dela ("é o mesmo salão do casamento de março");
//   · a IA, a partir do croqui e/ou da descrição — que só PROPÕE: o rascunho
//     abre no editor e nada é gravado até ela salvar.
// ─────────────────────────────────────────────────────────────────────────────

const mensagemDe = (e: unknown, padrao: string) =>
  e instanceof ConvexError ? ((e.data as { message?: string })?.message ?? padrao) : padrao;

const numero = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : undefined;
};

type Props = {
  aberto: boolean;
  onFechar: () => void;
  eventId: Id<"events">;
  /** Rascunho pronto para o editor (modelo ou IA). Ainda NÃO gravado. */
  onRascunho: (r: { nome: string; dados: DadosDoLayout; origem: "modelo" | "ia" | "em_branco"; avisos?: string[] }) => void;
  /** Cópia de outro evento — essa já nasce gravada pelo servidor. */
  onCopiado: (layoutId: Id<"eventLayouts">) => void;
};

export function NovoLayoutDialog({ aberto, onFechar, eventId, onRascunho, onCopiado }: Props) {
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [mesas, setMesas] = useState("");
  const [modelo, setModelo] = useState(MODELOS[0].chave);

  const [descricao, setDescricao] = useState("");
  const [croqui, setCroqui] = useState<{ storageId: Id<"_storage">; nome: string; preview: string } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [copiando, setCopiando] = useState<Id<"eventLayouts"> | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const outros = useQuery(api.layoutSalao.listarParaReaproveitar, aberto ? {} : "skip");
  const duplicar = useMutation(api.layoutSalao.duplicar);
  const rascunhoPorIa = useAction(api.layoutSalaoIa.rascunhoPorIa);
  const gerarUrl = useMutation(api.layoutRenders.generateUploadUrl);
  const { enviar, enviando } = useEnvioDeArquivo(gerarUrl, { tipo: "imagem", aceitos: ["image/"] });

  const medidasOk = (numero(largura) ?? 0) >= 2 && (numero(comprimento) ?? 0) >= 2;

  const usarModelo = () => {
    const m = MODELOS.find((x) => x.chave === modelo);
    if (!m || !medidasOk) return;
    const pedido = Math.max(0, Math.round(numero(mesas) ?? 0));
    const dados = m.montar({ largura: numero(largura)!, comprimento: numero(comprimento)!, mesas: pedido });
    const avisos =
      dados.mesas.posicoes.length < pedido
        ? [`Couberam ${dados.mesas.posicoes.length} de ${pedido} mesas sem sobrepor nada. Ajuste no editor.`]
        : [];
    onRascunho({ nome: m.nome, dados, origem: m.chave === "em-branco" ? "em_branco" : "modelo", avisos });
  };

  const escolherCroqui = async (arquivo: File) => {
    const r = await enviar(arquivo);
    if (!r.ok) {
      toast.error(r.motivo);
      return;
    }
    setCroqui({ storageId: r.storageId, nome: arquivo.name, preview: URL.createObjectURL(arquivo) });
  };

  const lerComIa = async () => {
    setLendo(true);
    try {
      const r = await rascunhoPorIa({
        eventId,
        storageId: croqui?.storageId,
        descricao,
        largura: numero(largura),
        comprimento: numero(comprimento),
        mesas: numero(mesas) !== undefined ? Math.round(numero(mesas)!) : undefined,
      });
      onRascunho({
        nome: "Rascunho da IA",
        dados: r.dados,
        origem: "ia",
        avisos: [...r.avisos, ...(r.observacoes ? [r.observacoes] : [])],
      });
    } catch (e) {
      toast.error(mensagemDe(e, "A IA não conseguiu montar o rascunho. Tente descrever o salão com mais detalhes."));
    } finally {
      setLendo(false);
    }
  };

  const copiar = async (layoutId: Id<"eventLayouts">) => {
    setCopiando(layoutId);
    try {
      const novo = await duplicar({ layoutId, eventIdDestino: eventId });
      onCopiado(novo);
    } catch (e) {
      toast.error(mensagemDe(e, "Não foi possível copiar o layout."));
    } finally {
      setCopiando(null);
    }
  };

  const medidas = (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="nl-largura">Largura (m)</Label>
        <Input id="nl-largura" inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} placeholder="26,90" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nl-comprimento">Comprimento (m)</Label>
        <Input id="nl-comprimento" inputMode="decimal" value={comprimento} onChange={(e) => setComprimento(e.target.value)} placeholder="28,40" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nl-mesas">Mesas</Label>
        <Input id="nl-mesas" inputMode="numeric" value={mesas} onChange={(e) => setMesas(e.target.value)} placeholder="28" />
      </div>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo layout do salão</DialogTitle>
          <DialogDescription>
            Comece por um modelo, reaproveite o salão de outro evento ou deixe a IA ler o seu croqui.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="modelo">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="modelo"><LayoutTemplate className="size-4 mr-1.5" />Modelo</TabsTrigger>
            <TabsTrigger value="outro"><Copy className="size-4 mr-1.5" />Outro evento</TabsTrigger>
            <TabsTrigger value="ia"><Sparkles className="size-4 mr-1.5" />IA</TabsTrigger>
          </TabsList>

          <TabsContent value="modelo" className="space-y-4 pt-3">
            {medidas}
            <div className="grid gap-2">
              {MODELOS.map((m) => (
                <button
                  key={m.chave}
                  type="button"
                  onClick={() => setModelo(m.chave)}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    modelo === m.chave ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
                  )}
                >
                  <p className="font-medium text-sm">{m.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.descricao}</p>
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={!medidasOk} onClick={usarModelo}>
              Abrir no editor
            </Button>
            {!medidasOk && (
              <p className="text-xs text-muted-foreground text-center">Informe largura e comprimento do salão.</p>
            )}
          </TabsContent>

          <TabsContent value="outro" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Mesmo salão de outro evento? Copie o layout e ajuste. As fotos de referência ficam no evento de origem.
            </p>
            {outros === undefined ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="size-4 animate-spin" /> Carregando seus layouts…
              </div>
            ) : outros.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Você ainda não tem layouts em outros eventos.</p>
            ) : (
              <div className="grid gap-2">
                {outros.itens.map((l) => (
                  <div key={l._id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{l.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.eventoNome} · {l.largura} × {l.comprimento} m · {l.mesas} mesas
                      </p>
                    </div>
                    <Button size="sm" variant="outline" disabled={copiando !== null} onClick={() => copiar(l._id)}>
                      {copiando === l._id ? <Loader2 className="size-4 animate-spin" /> : "Usar"}
                    </Button>
                  </div>
                ))}
                {outros.haMais && (
                  <p className="text-xs text-muted-foreground text-center">Mostrando os {outros.itens.length} mais recentes.</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ia" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">
              Envie a foto do croqui e/ou descreva o salão. A IA monta um rascunho em escala; você revisa no editor antes de salvar.
            </p>
            {medidas}
            <input
              ref={arquivoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void escolherCroqui(f);
                e.target.value = "";
              }}
            />
            {croqui ? (
              <div className="flex items-center gap-3 rounded-lg border border-border p-2">
                <img src={croqui.preview} alt="Croqui enviado" className="size-16 object-cover rounded" />
                <p className="text-sm truncate flex-1">{croqui.nome}</p>
                <Button size="sm" variant="ghost" onClick={() => setCroqui(null)}>Trocar</Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" disabled={enviando} onClick={() => arquivoRef.current?.click()}>
                {enviando ? <Loader2 className="size-4 animate-spin mr-2" /> : <Upload className="size-4 mr-2" />}
                Enviar foto do croqui
              </Button>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nl-descricao">Descrição e pedidos</Label>
              <Textarea
                id="nl-descricao"
                rows={5}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: entrada na lateral esquerda; palco de 10,84 × 5,13 m na frente; bar redondo no pilar central; lounges nos cantos do palco; mesa do bolo ao fundo (casamento, aniversário, corporativo…)"
              />
            </div>
            <Button className="w-full" disabled={lendo || enviando || (!croqui && !descricao.trim())} onClick={lerComIa}>
              {lendo ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
              {lendo ? "Montando o rascunho…" : "Montar rascunho com IA"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
