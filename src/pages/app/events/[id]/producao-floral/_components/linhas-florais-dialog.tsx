import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
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
import { valorDigitado } from "@/lib/valor-digitado.ts";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";
import { quantidadeDaLinha, textoDaQuantidade } from "@/convex/lib/producaoFloral.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A PARTE FLORAL DE CADA LINHA DA RECEITA
//
// A receita (quais materiais, em que unidade) é cadastrada UMA vez, na Ficha
// Técnica. Aqui se diz o que só o florista precisa saber sobre cada linha:
// a cor desejada, se a flor é natural ou permanente, e — a distinção que
// motivou a tela — se a quantidade é POR ARRANJO ou o TOTAL distribuído.
//
// ── POR QUE A QUANTIDADE TAMBÉM SE EDITA AQUI ───────────────────────────────
// Porque é aqui que a pergunta aparece. "São 5 em cada mesa ou 2 maços para o
// conjunto todo?" é uma decisão só, e obrigar a trocar de tela no meio dela
// faria a decoradora gravar o número numa tela e o significado na outra.
//
// NÃO é um segundo cadastro: grava no MESMO campo, pela MESMA mutation
// (`fichaTecnica.setReceita`), que reescreve a receita inteira com as linhas
// que já existiam. Adicionar ou remover material continua sendo lá.
// ─────────────────────────────────────────────────────────────────────────────

type LinhaEditavel = {
  materialId?: Id<"materials">;
  nome: string;
  unidade: string;
  quantidade: string;
  cor: string;
  origem: "" | "natural" | "permanente";
  distribuicao: "por_arranjo" | "total";
  apenasOrientacao: boolean;
  /** Campos que não se editam aqui e precisam sobreviver ao salvamento. */
  resto: Record<string, unknown>;
};

export function LinhasFloraisDialog({
  item,
  onClose,
}: {
  item: {
    _id: Id<"assemblyItems">;
    name: string;
    quantity?: number;
    receita?: readonly Record<string, unknown>[];
  } | null;
  onClose: () => void;
}) {
  const setReceita = useMutation(api.fichaTecnica.setReceita);
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!item) return;
    setLinhas(
      (item.receita ?? []).map((c) => {
        const {
          materialId,
          nome,
          unidade,
          quantidade,
          cor,
          origem,
          distribuicao,
          apenasOrientacao,
          ...resto
        } = c as Record<string, never>;
        return {
          materialId: materialId as Id<"materials"> | undefined,
          nome: String(nome ?? ""),
          unidade: String(unidade ?? "un"),
          quantidade: String(quantidade ?? 0),
          cor: cor ? String(cor) : "",
          origem: (origem as LinhaEditavel["origem"]) ?? "",
          distribuicao: distribuicao === "total" ? "total" : "por_arranjo",
          apenasOrientacao: apenasOrientacao === true,
          resto,
        };
      }),
    );
  }, [item]);

  if (!item) return null;

  const unidades = item.quantity ?? 1;

  const trocar = (i: number, campo: keyof LinhaEditavel, valor: unknown) =>
    setLinhas((atual) =>
      atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)),
    );

  const gravar = async () => {
    // A quantidade é lida com a mesma regra de todo campo numérico do ALTAR:
    // vírgula é decimal, e ilegível RECUSA em vez de virar zero em silêncio.
    const receita = [];
    for (const linha of linhas) {
      const lido = linha.apenasOrientacao ? 0 : valorDigitado(linha.quantidade);
      if (lido === null) {
        toast.error(`Quantidade não reconhecida em "${linha.nome}". Ex.: 0,5 ou 2`);
        return;
      }
      if (lido < 0) {
        toast.error(`A quantidade de "${linha.nome}" não pode ser negativa.`);
        return;
      }
      receita.push({
        ...linha.resto,
        materialId: linha.materialId,
        nome: linha.nome,
        unidade: linha.unidade as never,
        quantidade: lido,
        cor: linha.cor.trim() || undefined,
        origem: linha.origem || undefined,
        distribuicao: linha.distribuicao,
        apenasOrientacao: linha.apenasOrientacao || undefined,
      });
    }

    setSalvando(true);
    try {
      await setReceita({ id: item._id, receita: receita as never });
      toast.success("Receita floral salva.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível salvar a receita.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receita floral — {item.name}</DialogTitle>
        </DialogHeader>

        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta composição ainda não tem receita. Cadastre os materiais na Ficha
            Técnica e volte para dizer cor, origem e distribuição.
          </p>
        ) : (
          <div className="space-y-4">
            {linhas.map((linha, i) => {
              const previa = quantidadeDaLinha(
                { quantidade: unidades },
                {
                  nome: linha.nome,
                  unidade: linha.unidade,
                  quantidade: valorDigitado(linha.quantidade) ?? 0,
                  distribuicao: linha.distribuicao,
                  apenasOrientacao: linha.apenasOrientacao,
                },
              );
              return (
                <div
                  key={`${linha.nome}-${i}`}
                  className="border border-border rounded-xl p-3 space-y-2"
                >
                  <p className="font-medium text-sm">{linha.nome}</p>

                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={linha.apenasOrientacao}
                      onChange={(e) =>
                        trocar(i, "apenasOrientacao", e.target.checked)
                      }
                    />
                    <span>
                      Só orientação, sem quantidade definida
                      <span className="block text-muted-foreground">
                        Entra na ficha como instrução e fica fora de todos os totais.
                      </span>
                    </span>
                  </label>

                  {!linha.apenasOrientacao && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs" htmlFor={`qtd-${i}`}>
                            Quantidade ({abreviarUnidade(linha.unidade)})
                          </Label>
                          <Input
                            id={`qtd-${i}`}
                            inputMode="decimal"
                            value={linha.quantidade}
                            onChange={(e) => trocar(i, "quantidade", e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs" htmlFor={`dist-${i}`}>
                            Esta quantidade é
                          </Label>
                          <select
                            id={`dist-${i}`}
                            value={linha.distribuicao}
                            onChange={(e) => trocar(i, "distribuicao", e.target.value)}
                            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="por_arranjo">por arranjo</option>
                            <option value="total">
                              o total, distribuído entre os arranjos
                            </option>
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Na ficha: <strong>{textoDaQuantidade(previa)}</strong>
                      </p>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs" htmlFor={`cor-${i}`}>
                        Cor desejada
                      </Label>
                      <Input
                        id={`cor-${i}`}
                        value={linha.cor}
                        placeholder="branca, rosê…"
                        onChange={(e) => trocar(i, "cor", e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor={`origem-${i}`}>
                        Natural ou permanente
                      </Label>
                      <select
                        id={`origem-${i}`}
                        value={linha.origem}
                        onChange={(e) => trocar(i, "origem", e.target.value)}
                        className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">não informado</option>
                        <option value="natural">natural</option>
                        <option value="permanente">permanente</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          <Button
            onClick={gravar}
            disabled={salvando || linhas.length === 0}
            className="cursor-pointer"
          >
            {salvando ? "Salvando…" : "Salvar receita floral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
