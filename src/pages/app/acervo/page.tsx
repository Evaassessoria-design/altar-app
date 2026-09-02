import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Boxes, Plus, Archive, Search } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { UNIDADES, abreviarUnidade } from "@/convex/lib/materiais.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ACERVO
//
// "O que eu tenho." Contagem por quantidade — não há peça numerada, prateleira
// nem código de barras.
//
// ── POR QUE ESTA TELA NÃO MOSTRA "DISPONÍVEL AGORA" ─────────────────────────
// Disponibilidade depende de uma JANELA. "28 disponíveis" sem data é um número
// enganoso: pode haver 30 comprometidos no fim de semana que vem e nenhum na
// semana seguinte. Aqui aparece o TOTAL e quantos eventos já reservaram; o
// número real aparece no evento, onde existe uma data para perguntar.
// ─────────────────────────────────────────────────────────────────────────────

function ItemDialog({
  open, onClose, item,
}: {
  open: boolean;
  onClose: () => void;
  item?: { _id: Id<"collectionItems">; nome: string; unidade: string; quantidadeTotal: number; categoria?: string; materialId?: Id<"materials"> };
}) {
  const materiais = useQuery(api.materials.list, open ? {} : "skip");
  const criar = useMutation(api.acervo.createItem);
  const atualizar = useMutation(api.acervo.updateItem);

  const [nome, setNome] = useState(item?.nome ?? "");
  const [unidade, setUnidade] = useState(item?.unidade ?? "un");
  const [total, setTotal] = useState(String(item?.quantidadeTotal ?? ""));
  const [categoria, setCategoria] = useState(item?.categoria ?? "");
  const [materialId, setMaterialId] = useState<string>(item?.materialId ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const quantidadeTotal = Number(total.replace(",", "."));
    if (!nome.trim()) return toast.error("Informe o nome do item.");
    if (!Number.isFinite(quantidadeTotal)) return toast.error("Quantidade inválida.");
    setSalvando(true);
    try {
      if (item) {
        await atualizar({
          id: item._id, nome: nome.trim(), quantidadeTotal,
          categoria: categoria.trim() || null,
          materialId: (materialId || null) as Id<"materials"> | null,
        });
      } else {
        const r = await criar({
          nome: nome.trim(), unidade: unidade as never, quantidadeTotal,
          categoria: categoria.trim() || undefined,
          materialId: (materialId || undefined) as Id<"materials"> | undefined,
        });
        // Cadastrar de novo reativa o arquivado, mas NUNCA soma quantidade —
        // somar em silêncio dobraria o acervo sem ninguém pedir.
        if (!r.criado) toast.info("Este item já existia no acervo.");
      }
      toast.success("Acervo atualizado.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível salvar.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item do acervo" : "Novo item do acervo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-nome">Nome</Label>
            <Input id="ac-nome" value={nome} placeholder="Vaso cilíndrico 25cm"
              onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ac-total">Quantas eu tenho</Label>
              <Input id="ac-total" inputMode="decimal" value={total} placeholder="40"
                onChange={(e) => setTotal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-un">Unidade</Label>
              <select id="ac-un" value={unidade} disabled={!!item}
                onChange={(e) => setUnidade(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer disabled:opacity-60">
                {UNIDADES.map((u) => (
                  <option key={u.valor} value={u.valor}>{u.rotulo}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ac-cat">Categoria</Label>
            <Input id="ac-cat" value={categoria} placeholder="Peças"
              onChange={(e) => setCategoria(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ac-mat">Material da ficha técnica</Label>
            {/* Vínculo EXPLÍCITO. "Vaso X reutilizável" pode ser da decoradora
                OU alugado de terceiro — e só ela sabe a diferença. */}
            <select id="ac-mat" value={materialId} onChange={(e) => setMaterialId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer">
              <option value="">Sem vínculo</option>
              {(materiais ?? []).map((m) => (
                <option key={m._id} value={m._id}>{m.nome}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Com o vínculo, a Ficha Técnica passa a saber quanto do acervo cobre a necessidade.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
          <Button disabled={salvando} onClick={() => void salvar()} className="cursor-pointer">
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AcervoPage() {
  const itens = useQuery(api.acervo.listItems, {});
  const arquivar = useMutation(api.acervo.setItemArchived);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const visiveis = (itens ?? []).filter((i) =>
    i.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  const handleArquivar = async (id: Id<"collectionItems">, nome: string) => {
    if (!window.confirm(`Arquivar "${nome}"? Ele sai das reservas novas, mas o histórico continua.`)) return;
    try {
      await arquivar({ id, archived: true });
      toast.success("Item arquivado.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível arquivar.",
      );
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="size-5 text-primary" /> Acervo
          </h1>
          <p className="text-sm text-muted-foreground">As peças que são suas</p>
        </div>
        <Button size="sm" onClick={() => setCriando(true)} className="cursor-pointer gap-1.5">
          <Plus className="size-4" /> Novo item
        </Button>
      </div>

      {itens === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : itens.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
            <EmptyTitle>Seu acervo está vazio</EmptyTitle>
            <EmptyDescription>
              Cadastre as peças que são suas — vasos, castiçais, sousplats, estruturas. Depois a
              Ficha Técnica passa a dizer quanto do que você precisa já está no galpão.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no acervo" className="pl-9" />
          </div>

          <div className="space-y-2">
            {visiveis.map((item) => (
              <div key={item._id}
                className={cn(
                  "bg-card border border-border rounded-xl px-4 py-3 flex items-start justify-between gap-3",
                  item.archived && "opacity-60",
                )}>
                <button onClick={() => setEditando(item._id)} className="text-left min-w-0 cursor-pointer">
                  <p className="font-medium text-sm">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantidadeTotal} {abreviarUnidade(item.unidade)}
                    {item.categoria && ` · ${item.categoria}`}
                  </p>
                  {/* Nunca "X disponíveis": sem uma janela, o número engana. */}
                  {item.eventosComReserva > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reservado em {item.eventosComReserva}{" "}
                      {item.eventosComReserva === 1 ? "evento" : "eventos"}
                    </p>
                  )}
                </button>
                {!item.archived && (
                  <button onClick={() => void handleArquivar(item._id, item.nome)}
                    aria-label={`Arquivar ${item.nome}`}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground cursor-pointer flex-shrink-0">
                    <Archive className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {criando && <ItemDialog open onClose={() => setCriando(false)} />}
      {editando && (
        <ItemDialog open onClose={() => setEditando(null)}
          item={(itens ?? []).find((i) => i._id === editando) as never} />
      )}
    </div>
  );
}
