import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
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
// a cor desejada, se a flor é natural ou permanente, se a quantidade é POR
// ARRANJO ou o TOTAL distribuído, e uma orientação escrita para ele.
//
// ── GRAVA SÓ A PARTE FLORAL ─────────────────────────────────────────────────
// Antes gravava pela `fichaTecnica.setReceita`, que recopia do catálogo o
// custo, a margem e a unidade de cada linha: mudar a cor de um evento antigo
// mexia em silêncio no snapshot financeiro. Agora grava por
// `producaoFloral.setLinhasFlorais`, que só toca os campos florais. A
// quantidade só vai no pedido se a decoradora a mudou aqui.
//
// ── "SÓ ORIENTAÇÃO" ESCONDE, NÃO APAGA ──────────────────────────────────────
// Marcar tira a linha dos totais; o número digitado continua no formulário e
// no banco. Desmarcar devolve exatamente o que estava.
// ─────────────────────────────────────────────────────────────────────────────

type LinhaEditavel = {
  indice: number;
  materialId?: Id<"materials">;
  nome: string;
  unidade: string;
  /** Texto do campo, como digitado. */
  quantidade: string;
  /** O número gravado quando o diálogo abriu — para saber se mudou. */
  quantidadeOriginal: number;
  cor: string;
  origem: "" | "natural" | "permanente";
  distribuicao: "por_arranjo" | "total";
  apenasOrientacao: boolean;
  orientacaoFlorista: string;
};

type ComponenteCru = {
  materialId?: Id<"materials">;
  nome?: string;
  unidade?: string;
  quantidade?: number;
  cor?: string;
  origem?: "natural" | "permanente";
  distribuicao?: string;
  apenasOrientacao?: boolean;
  orientacaoFlorista?: string;
};

const quantidadeComoTexto = (n: number) =>
  Number.isFinite(n) ? String(n).replace(".", ",") : "0";

export function LinhasFloraisDialog({
  item,
  onClose,
}: {
  item: {
    _id: Id<"assemblyItems">;
    name: string;
    quantity?: number;
    receita?: readonly ComponenteCru[];
  } | null;
  onClose: () => void;
}) {
  const setLinhasFlorais = useMutation(api.producaoFloral.setLinhasFlorais);
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const itemId = item?._id;

  // Carrega uma vez por item aberto — a lista ao vivo mudando não pode apagar
  // o que a decoradora está digitando.
  useEffect(() => {
    if (!item) return;
    setLinhas(
      (item.receita ?? []).map((c, indice) => ({
        indice,
        materialId: c.materialId,
        nome: String(c.nome ?? ""),
        unidade: String(c.unidade ?? "un"),
        quantidade: quantidadeComoTexto(c.quantidade ?? 0),
        quantidadeOriginal: c.quantidade ?? 0,
        cor: c.cor ?? "",
        origem: c.origem ?? "",
        distribuicao: c.distribuicao === "total" ? "total" : "por_arranjo",
        apenasOrientacao: c.apenasOrientacao === true,
        orientacaoFlorista: c.orientacaoFlorista ?? "",
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!item) return null;

  const unidades = item.quantity ?? 1;

  const trocar = <K extends keyof LinhaEditavel>(i: number, campo: K, valor: LinhaEditavel[K]) =>
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));

  const gravar = async () => {
    const pedido = [];
    for (const linha of linhas) {
      // A quantidade só é lida — e só vai — se esta linha conta. Em "só
      // orientação" o campo está escondido e o número gravado fica como está.
      let quantidade: number | undefined;
      if (!linha.apenasOrientacao) {
        const lido = valorDigitado(linha.quantidade);
        if (lido === null) {
          toast.error(`Quantidade não reconhecida em "${linha.nome}". Ex.: 0,5 ou 2`);
          return;
        }
        if (lido < 0) {
          toast.error(`A quantidade de "${linha.nome}" não pode ser negativa.`);
          return;
        }
        if (lido !== linha.quantidadeOriginal) quantidade = lido;
      }
      pedido.push({
        indice: linha.indice,
        nome: linha.nome,
        materialId: linha.materialId,
        cor: linha.cor.trim() || undefined,
        origem: linha.origem || undefined,
        distribuicao: linha.distribuicao,
        apenasOrientacao: linha.apenasOrientacao,
        orientacaoFlorista: linha.orientacaoFlorista.trim() || undefined,
        quantidade,
      });
    }

    setSalvando(true);
    try {
      await setLinhasFlorais({ id: item._id, linhas: pedido });
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
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">Receita floral — {item.name}</DialogTitle>
        </DialogHeader>

        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta composição ainda não tem receita. Cadastre os materiais na Ficha
            Técnica e volte para dizer cor, origem e distribuição.
          </p>
        ) : (
          <div className="space-y-4 min-w-0">
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
                  key={`${linha.indice}-${linha.nome}`}
                  className="border border-border rounded-xl p-3 space-y-2"
                >
                  <p className="font-medium text-sm break-words">{linha.nome}</p>

                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={linha.apenasOrientacao}
                      onChange={(e) => trocar(i, "apenasOrientacao", e.target.checked)}
                    />
                    <span>
                      Só orientação, sem quantidade definida
                      <span className="block text-muted-foreground">
                        Entra na ficha como instrução e fica fora de todos os totais.
                        A quantidade informada fica guardada.
                      </span>
                    </span>
                  </label>

                  {!linha.apenasOrientacao && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                            onChange={(e) =>
                              trocar(i, "distribuicao", e.target.value as LinhaEditavel["distribuicao"])
                            }
                            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="por_arranjo">por arranjo</option>
                            <option value="total">o total, distribuído entre os arranjos</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Na ficha: <strong>{textoDaQuantidade(previa)}</strong>
                      </p>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                        onChange={(e) => trocar(i, "origem", e.target.value as LinhaEditavel["origem"])}
                        className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">não informado</option>
                        <option value="natural">natural</option>
                        <option value="permanente">permanente</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs" htmlFor={`orientacao-${i}`}>
                      Orientações para o florista
                    </Label>
                    <Textarea
                      id={`orientacao-${i}`}
                      value={linha.orientacaoFlorista}
                      placeholder="Abrir os botões na véspera; folhagem a gosto…"
                      onChange={(e) => trocar(i, "orientacaoFlorista", e.target.value)}
                      className="mt-1 min-h-16"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Vai no papel do florista. As anotações internas da receita não vão.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando} className="cursor-pointer h-10 sm:h-9">
            Cancelar
          </Button>
          <Button
            onClick={gravar}
            disabled={salvando || linhas.length === 0}
            className="cursor-pointer h-10 sm:h-9"
          >
            {salvando ? "Salvando…" : "Salvar receita floral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
