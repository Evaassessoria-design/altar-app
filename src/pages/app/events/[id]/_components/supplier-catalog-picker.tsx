import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Plus, Search, Store } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Primeiro passo ao adicionar um fornecedor ao evento: reaproveitar alguém do
// catálogo da empresa, ou cadastrar um novo.
//
// Só isso muda no fluxo atual. Escolher "Cadastrar novo" leva ao MESMO
// formulário de sempre, sem nenhuma alteração — a experiência que já existe
// fica preservada, e ganha um atalho na frente.
//
// Fornecedores já usados NESTE evento aparecem desabilitados: adicionar duas
// vezes o mesmo fornecedor ao mesmo evento não faz sentido.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  /** Ids do catálogo já vinculados a este evento. */
  alreadyLinked: Array<Id<"suppliers">>;
  /** Categoria sugerida, quando a pessoa clicou em "adicionar" numa categoria. */
  presetCategory?: string;
  onPick: (supplierId: Id<"suppliers">) => void | Promise<void>;
  onCreateNew: () => void;
};

export function SupplierCatalogPicker({
  open,
  onClose,
  alreadyLinked,
  presetCategory,
  onPick,
  onCreateNew,
}: Props) {
  const catalogo = useQuery(api.supplierCatalog.list, {});
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState<Id<"suppliers"> | null>(null);

  const termo = busca.trim().toLowerCase();
  const filtrados = (catalogo ?? []).filter((s) => {
    if (!termo) return true;
    return (
      s.companyName.toLowerCase().includes(termo) ||
      s.category.toLowerCase().includes(termo) ||
      (s.contactName ?? "").toLowerCase().includes(termo)
    );
  });

  // Da categoria pedida primeiro — é o que a pessoa provavelmente procura.
  const ordenados = presetCategory
    ? [...filtrados].sort((a, b) => {
        const aNa = a.category === presetCategory ? 0 : 1;
        const bNa = b.category === presetCategory ? 0 : 1;
        return aNa - bNa;
      })
    : filtrados;

  const escolher = async (supplierId: Id<"suppliers">) => {
    setSalvando(supplierId);
    try {
      await onPick(supplierId);
      onClose();
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar fornecedor</DialogTitle>
          <DialogDescription>
            Escolha um fornecedor do seu catálogo ou cadastre um novo.
          </DialogDescription>
        </DialogHeader>

        <Button variant="secondary" className="w-full gap-2 cursor-pointer" onClick={onCreateNew}>
          <Plus className="size-4" /> Cadastrar novo fornecedor
        </Button>

        {catalogo === undefined ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : catalogo.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <Store className="size-8 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">Seu catálogo ainda está vazio.</p>
            <p className="text-xs text-muted-foreground">
              Os fornecedores que você cadastrar nos eventos aparecem aqui
              automaticamente, prontos para reutilizar.
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no catálogo…"
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {ordenados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum fornecedor encontrado.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {ordenados.map((s) => {
                    const jaNoEvento = alreadyLinked.includes(s._id);
                    return (
                      <li key={s._id}>
                        <button
                          type="button"
                          disabled={jaNoEvento || salvando !== null}
                          onClick={() => void escolher(s._id)}
                          className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{s.companyName}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {s.category}
                                {s.contactName ? ` · ${s.contactName}` : ""}
                                {s.phone ? ` · ${s.phone}` : ""}
                              </p>
                            </div>
                            {jaNoEvento && (
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                já neste evento
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
