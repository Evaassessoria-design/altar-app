import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Plus, Trash2, Loader2, BookMarked } from "lucide-react";
import { TIPOS_DE_MATERIAL, UNIDADES, aceitaDecimal } from "@/convex/lib/materiais.ts";
import { necessidadeDoComponente, quantidadeTexto } from "@/convex/lib/fichaTecnica.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RECEITA DE UM ITEM
//
// "Do que este arranjo é feito?" — cinco campos, não quinze. A decoradora não
// precisa aprender engenharia de produção para dizer que um arranjo leva 5
// rosas.
//
// ── CRIAÇÃO RÁPIDA ──────────────────────────────────────────────────────────
// O material pode ser escolhido do catálogo OU digitado na hora. Digitar cria
// o material e já o usa, sem sair da tela — forçar um cadastro em outro lugar
// antes de continuar é como catálogos ficam vazios.
// ─────────────────────────────────────────────────────────────────────────────

type Linha = {
  materialId?: Id<"materials">;
  nome: string;
  unidade: string;
  quantidade: string;
  tipo?: string;
};

export function ReceitaDialog({
  itemId,
  open,
  onClose,
}: {
  itemId: Id<"assemblyItems">;
  open: boolean;
  onClose: () => void;
}) {
  const item = useQuery(api.assemblyItems.get, open ? { id: itemId } : "skip");
  const materiais = useQuery(api.materials.list, open ? {} : "skip");
  const composicoes = useQuery(api.compositions.list, open ? {} : "skip");
  const setReceita = useMutation(api.fichaTecnica.setReceita);
  const criarMaterial = useMutation(api.materials.create);
  const aplicar = useMutation(api.fichaTecnica.aplicarComposicao);
  const salvarNaBiblioteca = useMutation(api.fichaTecnica.salvarNaBiblioteca);

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [salvandoNaBiblioteca, setSalvandoNaBiblioteca] = useState(false);
  const [carregada, setCarregada] = useState(false);

  // Carrega a receita existente uma vez por abertura — reabrir o diálogo não
  // pode descartar o que a pessoa acabou de digitar.
  useEffect(() => {
    if (!open) {
      setCarregada(false);
      setLinhas([]);
      return;
    }
    if (carregada || item === undefined) return;
    setLinhas(
      (item?.receita ?? []).map((c) => ({
        materialId: c.materialId,
        nome: c.nome,
        unidade: c.unidade,
        quantidade: String(c.quantidade),
        tipo: c.tipo,
      })),
    );
    setCarregada(true);
  }, [open, item, carregada]);

  const unidades = item?.quantity ?? 1;

  const alterar = (i: number, campos: Partial<Linha>) =>
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, ...campos } : l)));

  const escolherMaterial = (i: number, materialId: string) => {
    if (!materialId) return alterar(i, { materialId: undefined });
    const m = (materiais ?? []).find((x) => x._id === materialId);
    if (!m) return;
    // Nome, unidade e tipo vêm do catálogo — a receita não inventa nenhum deles.
    alterar(i, { materialId: m._id, nome: m.nome, unidade: m.unidade, tipo: m.tipo });
  };

  const salvar = async () => {
    const preenchidas = linhas.filter((l) => l.nome.trim());
    setSalvando(true);
    try {
      // Material digitado na hora vira cadastro antes de entrar na receita:
      // sem `materialId` o consolidado não consegue agrupar entre ambientes
      // nem gerar compra idempotente.
      const resolvidas = [];
      for (const l of preenchidas) {
        const quantidade = Number(l.quantidade.replace(",", "."));
        if (!Number.isFinite(quantidade) || quantidade < 0) {
          toast.error(`Quantidade inválida em "${l.nome}".`);
          setSalvando(false);
          return;
        }
        let materialId = l.materialId;
        if (!materialId) {
          const r = await criarMaterial({
            nome: l.nome.trim(),
            unidade: l.unidade as never,
            tipo: l.tipo as never,
          });
          materialId = r.materialId;
        }
        resolvidas.push({
          materialId,
          nome: l.nome.trim(),
          unidade: l.unidade as never,
          quantidade,
        });
      }
      await setReceita({ id: itemId, receita: resolvidas });
      toast.success("Ficha técnica salva.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível salvar.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const usarComposicao = async (compositionId: string) => {
    try {
      await aplicar({
        id: itemId,
        compositionId: compositionId as Id<"compositions">,
        substituir: true,
      });
      toast.success("Receita aplicada. A biblioteca não muda com o que você editar aqui.");
      setCarregada(false);
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível aplicar.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha técnica — {item?.name ?? "..."}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Do que UMA unidade é feita. O ALTAR multiplica por {unidades}{" "}
          {unidades === 1 ? "unidade" : "unidades"} e soma com os outros ambientes.
        </p>

        {(composicoes?.length ?? 0) > 0 && (
          <div>
            <Label htmlFor="ficha-biblioteca" className="text-xs">
              Usar uma receita da biblioteca
            </Label>
            <select
              id="ficha-biblioteca"
              defaultValue=""
              onChange={(e) => e.target.value && void usarComposicao(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer"
            >
              <option value="">Começar do zero</option>
              {(composicoes ?? []).map((c) => (
                <option key={c._id} value={c._id}>
                  {c.nome} ({c.receita.length})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          {linhas.map((linha, i) => (
            <div key={i} className="border border-border rounded-lg p-2.5 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs" htmlFor={`mat-${i}`}>
                    Material
                  </Label>
                  <select
                    id={`mat-${i}`}
                    value={linha.materialId ?? ""}
                    onChange={(e) => escolherMaterial(i, e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer"
                  >
                    <option value="">Digitar um novo</option>
                    {(materiais ?? []).map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}
                  aria-label={`Remover ${linha.nome || "linha"}`}
                  className="mt-5 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {!linha.materialId && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs" htmlFor={`nome-${i}`}>
                      Nome
                    </Label>
                    <Input
                      id={`nome-${i}`}
                      value={linha.nome}
                      placeholder="Rosa branca"
                      onChange={(e) => alterar(i, { nome: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`tipo-${i}`}>
                      Depois do evento
                    </Label>
                    <select
                      id={`tipo-${i}`}
                      value={linha.tipo ?? "consumivel"}
                      onChange={(e) => alterar(i, { tipo: e.target.value })}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer"
                    >
                      {TIPOS_DE_MATERIAL.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs" htmlFor={`qtd-${i}`}>
                    Por unidade
                  </Label>
                  <Input
                    id={`qtd-${i}`}
                    inputMode="decimal"
                    value={linha.quantidade}
                    placeholder={aceitaDecimal(linha.unidade) ? "2,5" : "5"}
                    onChange={(e) => alterar(i, { quantidade: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs" htmlFor={`un-${i}`}>
                    Unidade
                  </Label>
                  <select
                    id={`un-${i}`}
                    value={linha.unidade}
                    disabled={!!linha.materialId}
                    onChange={(e) => alterar(i, { unidade: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer disabled:opacity-60"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u.valor} value={u.valor}>
                        {u.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* O total desta linha, calculado pelo MESMO helper do backend. */}
              {Number(linha.quantidade.replace(",", ".")) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total no evento:{" "}
                  <span className="text-foreground font-medium">
                    {quantidadeTexto(
                      necessidadeDoComponente(
                        { quantidade: item?.quantity },
                        { quantidade: Number(linha.quantidade.replace(",", ".")) },
                      ),
                      linha.unidade,
                    )}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setLinhas((a) => [...a, { nome: "", unidade: "un", quantidade: "1" }])
          }
          className="cursor-pointer gap-1.5 w-full"
        >
          <Plus className="size-4" /> Adicionar material
        </Button>

        <DialogFooter className="gap-2 sm:gap-2">
          {(item?.receita?.length ?? 0) > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={salvandoNaBiblioteca}
              onClick={() => {
                // Sem esta trava, dois toques criavam DUAS composicoes iguais
                // na biblioteca: a mutation faz `insert`, nao upsert.
                if (salvandoNaBiblioteca) return;
                setSalvandoNaBiblioteca(true);
                void salvarNaBiblioteca({ id: itemId })
                  .then(() => toast.success("Receita salva na biblioteca."))
                  .catch(() => toast.error("Não foi possível salvar na biblioteca."))
                  .finally(() => setSalvandoNaBiblioteca(false));
              }}
              className="cursor-pointer gap-1.5 mr-auto"
            >
              <BookMarked className="size-4" /> Salvar na biblioteca
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          <Button disabled={salvando} onClick={() => void salvar()} className="cursor-pointer">
            {salvando && <Loader2 className="size-4 animate-spin mr-1.5" />}
            {salvando ? "Salvando..." : "Salvar ficha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
