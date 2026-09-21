import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Archive } from "lucide-react";
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
import { formatEventDateShort } from "@/lib/event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CORRIGIR UMA RECEITA DA BIBLIOTECA
//
// A biblioteca só enche por um caminho: "Salvar na biblioteca", no diálogo da
// receita. Até aqui era caminho de mão única — `compositions.update` e
// `compositions.setArchived` existiam no servidor, testadas, e nenhuma tela as
// chamava. Um "Arranjo bxo" salvo com o nome errado ficava no menu para
// sempre, e uma receita que a decoradora não usa mais também.
//
// ── DOIS LUGARES, UM DIÁLOGO ────────────────────────────────────────────────
// Abre do diálogo da receita (corrigir de onde a composição é escolhida) e da
// tela de Catálogo (revisar a biblioteca inteira). É o mesmo componente nos
// dois, por isso mora em `src/components/catalogo/`.
//
// ── O QUE ESTA TELA DELIBERADAMENTE NÃO FAZ ─────────────────────────────────
// Não mexe em evento nenhum. O item de montagem guarda um SNAPSHOT da receita
// — é isso que impede um evento já executado de mudar porque alguém corrigiu a
// biblioteca depois. Por isso "usada em" aparece como PROCEDÊNCIA, para
// reconhecer a receita, e não como aviso de estrago.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  compositionId: Id<"compositions"> | null;
  onClose: () => void;
};

export function ComposicaoDialog({ compositionId, onClose }: Props) {
  const detalhe = useQuery(
    api.compositions.ondeEUsada,
    compositionId ? { id: compositionId } : "skip",
  );
  const atualizar = useMutation(api.compositions.update);
  const arquivar = useMutation(api.compositions.setArchived);

  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (detalhe) setNome(detalhe.nome);
  }, [detalhe]);

  if (!compositionId) return null;

  const comErro = (e: unknown) =>
    toast.error(
      e instanceof ConvexError
        ? (e.data as { message: string }).message
        : "Não foi possível salvar a receita.",
    );

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("A receita precisa de um nome.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar({ id: compositionId, nome: nome.trim() });
      toast.success("Receita renomeada na biblioteca. Os eventos não mudam.");
      onClose();
    } catch (e) {
      comErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const alternarArquivo = async () => {
    if (!detalhe) return;
    const indoParaArquivo = !detalhe.archived;
    if (
      indoParaArquivo &&
      !window.confirm(
        `Arquivar "${detalhe.nome}"? Ela sai do menu de receitas, e os eventos ` +
          "que já a usaram continuam exatamente como estão.",
      )
    ) {
      return;
    }
    try {
      await arquivar({ id: compositionId, archived: indoParaArquivo });
      toast.success(indoParaArquivo ? "Receita arquivada." : "Receita reativada.");
      onClose();
    } catch (e) {
      comErro(e);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receita da biblioteca</DialogTitle>
        </DialogHeader>

        {/* Enquanto a consulta não volta, nada é afirmado — nem o nome, nem
            "usada em nenhum evento". */}
        {detalhe === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : detalhe === null ? (
          <p className="text-sm text-muted-foreground">
            Esta receita não está mais na biblioteca.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="comp-nome" className="text-xs">
                Nome
              </Label>
              <Input
                id="comp-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {detalhe.materiais} {detalhe.materiais === 1 ? "material" : "materiais"} nesta receita.
              {detalhe.archived && " Está arquivada — não aparece no menu de escolha."}
            </p>

            <div>
              <p className="text-xs font-medium">Usada em</p>
              {detalhe.eventos.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhum evento ainda. Ela fica guardada para o próximo.
                </p>
              ) : (
                <>
                  <ul className="mt-1 space-y-1">
                    {detalhe.eventos.map((e) => (
                      <li key={e.eventId} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{e.nome}</span>{" "}
                        · {formatEventDateShort(e.data)} · {e.itens.join(", ")}
                      </li>
                    ))}
                  </ul>
                  {/* A tela diz que há mais em vez de somar um total que não
                      contou. */}
                  {detalhe.temMais && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {detalhe.eventos.length} listados — há mais.
                    </p>
                  )}
                </>
              )}
            </div>

            <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
              Corrigir aqui muda a <strong>biblioteca</strong>. Os eventos acima
              guardam uma cópia da receita e continuam como estão — é isso que
              impede um evento antigo de mudar sozinho.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={!detalhe}
            onClick={() => void alternarArquivo()}
            className="cursor-pointer gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Archive className="size-4" />
            {detalhe?.archived ? "Reativar" : "Arquivar"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              onClick={() => void salvar()}
              disabled={salvando || !detalhe}
              className="cursor-pointer"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
