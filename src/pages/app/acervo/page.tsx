import { useState } from "react";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { formatTimestamp } from "@/lib/safe-date.ts";
import {
  aplicarAjuste, aplicarContagem, ROTULO_DO_AJUSTE, TIPOS_DE_AJUSTE,
  type TipoDeAjuste,
} from "@/convex/lib/ajusteDeAcervo.ts";
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
import { Boxes, Plus, Archive, Search, SlidersHorizontal } from "lucide-react";
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
    if (!item && !Number.isFinite(quantidadeTotal)) return toast.error("Quantidade inválida.");
    setSalvando(true);
    try {
      if (item) {
        // Sem `quantidadeTotal`: estoque so muda por "Ajustar estoque", que
        // registra motivo e deixa historico. Editar nome nao pode ser a porta
        // dos fundos para mexer no numero de pecas.
        await atualizar({
          id: item._id, nome: nome.trim(),
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
              {/* Na EDICAO a quantidade e so leitura: mexer nela aqui mudaria
                  o estoque sem motivo nem historico. Quem muda e "Ajustar
                  estoque". Na CRIACAO ela e o saldo de abertura. */}
              <Input id="ac-total" inputMode="decimal" value={total} placeholder="40"
                disabled={!!item}
                onChange={(e) => setTotal(e.target.value)} />
              {item && (
                <p className="text-xs text-muted-foreground">
                  Para mudar, use “Ajustar estoque”.
                </p>
              )}
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


// ─────────────────────────────────────────────────────────────────────────────
// AJUSTAR ESTOQUE — a única tela que muda a quantidade física
//
// Mostra sempre o "Antes → Depois" ANTES de confirmar. Baixa de acervo é
// decisão que custa dinheiro: a pessoa precisa ver o número que vai ficar, não
// deduzir. E a conta é feita no servidor de novo, na hora de gravar — o que
// aparece aqui é uma prévia, nunca o valor gravado.
// ─────────────────────────────────────────────────────────────────────────────
function AjusteDialog({
  item,
  onClose,
}: {
  item: { _id: Id<"collectionItems">; nome: string; unidade: string; quantidadeTotal: number };
  onClose: () => void;
}) {
  const ajustar = useMutation(api.acervo.ajustarEstoque);
  const contar = useMutation(api.acervo.registrarContagem);
  const historico = useQuery(api.acervo.historicoDoItem, { collectionItemId: item._id, limite: 8 });

  const [tipo, setTipo] = useState<TipoDeAjuste>("perda");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ehContagem = tipo === "acerto_inventario";
  const numero = Number(quantidade.replace(",", "."));
  const valido = Number.isFinite(numero) && quantidade.trim() !== "";

  // Prévia — a decisão de verdade é do servidor (lib/ajusteDeAcervo.ts).
  const previa = !valido
    ? null
    : ehContagem
      ? aplicarContagem({ quantidadeAtual: item.quantidadeTotal, quantidadeContada: numero, unidade: item.unidade })
      : aplicarAjuste({ quantidadeAtual: item.quantidadeTotal, tipo, quantidade: numero, unidade: item.unidade });

  const salvar = async () => {
    if (!valido) return toast.error("Informe a quantidade.");
    setSalvando(true);
    try {
      if (ehContagem) {
        await contar({ collectionItemId: item._id, quantidadeContada: numero, motivo: motivo.trim() || undefined });
      } else {
        await ajustar({
          collectionItemId: item._id, tipo, quantidade: numero,
          motivo: motivo.trim() || undefined,
        });
      }
      toast.success("Estoque ajustado.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível ajustar.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar estoque — {item.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Hoje: <strong className="text-foreground">{item.quantidadeTotal} {abreviarUnidade(item.unidade)}</strong>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="aj-tipo">O que aconteceu</Label>
            <select id="aj-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeAjuste)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer">
              {TIPOS_DE_AJUSTE.map((t) => (
                <option key={t} value={t}>{ROTULO_DO_AJUSTE[t]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj-qtd">{ehContagem ? "Quantas eu contei" : "Quantas peças"}</Label>
            <Input id="aj-qtd" inputMode="decimal" value={quantidade} placeholder="2"
              onChange={(e) => setQuantidade(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj-motivo">Observações</Label>
            <AutoTextarea id="aj-motivo" minRows={2} value={motivo} placeholder="Ex.: quebrou no retorno do casamento"
              onChange={(e) => setMotivo(e.target.value)} />
          </div>

          {previa && (
            previa.ok ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{item.quantidadeTotal}</span>
                <span className="mx-2">→</span>
                <strong>{previa.quantidadeDepois} {abreviarUnidade(item.unidade)}</strong>
              </div>
            ) : (
              <p className="text-xs text-destructive">{previa.motivo}</p>
            )
          )}

          {historico && historico.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Ajustes recentes</p>
              <ul className="space-y-1">
                {historico.map((h) => (
                  <li key={h._id} className="text-xs text-muted-foreground flex items-baseline gap-1.5">
                    <span className={h.delta > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                      {h.delta > 0 ? "+" : ""}{h.delta}
                    </span>
                    <span>{ROTULO_DO_AJUSTE[h.tipo]}</span>
                    <span className="opacity-60">({h.quantidadeAntes} → {h.quantidadeDepois})</span>
                    {h.eventName && <span className="opacity-60 truncate">· {h.eventName}</span>}
                    <span className="ml-auto opacity-60 flex-shrink-0">{formatTimestamp(h._creationTime)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
          <Button disabled={salvando || !previa?.ok} onClick={() => void salvar()} className="cursor-pointer">
            {salvando ? "Salvando..." : "Confirmar ajuste"}
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
  const [ajustando, setAjustando] = useState<string | null>(null);

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
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Alvo de toque de 40px: esta tela e usada no galpao, em pe. */}
                    <button onClick={() => setAjustando(item._id)}
                      aria-label={`Ajustar estoque de ${item.nome}`}
                      title="Ajustar estoque"
                      className="p-2.5 rounded-lg hover:bg-accent text-muted-foreground cursor-pointer">
                      <SlidersHorizontal className="size-4" />
                    </button>
                    <button onClick={() => void handleArquivar(item._id, item.nome)}
                      aria-label={`Arquivar ${item.nome}`}
                      className="p-2.5 rounded-lg hover:bg-accent text-muted-foreground cursor-pointer">
                      <Archive className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {criando && <ItemDialog open onClose={() => setCriando(false)} />}
      {ajustando && (() => {
        const alvo = (itens ?? []).find((i) => i._id === ajustando);
        return alvo ? <AjusteDialog item={alvo} onClose={() => setAjustando(null)} /> : null;
      })()}
      {editando && (
        <ItemDialog open onClose={() => setEditando(null)}
          item={(itens ?? []).find((i) => i._id === editando) as never} />
      )}
    </div>
  );
}
