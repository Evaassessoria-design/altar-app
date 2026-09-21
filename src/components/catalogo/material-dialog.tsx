import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { TIPOS_DE_MATERIAL, UNIDADES } from "@/convex/lib/materiais.ts";
import { valorDigitado } from "@/lib/valor-digitado.ts";
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

// ─────────────────────────────────────────────────────────────────────────────
// CORRIGIR UM MATERIAL DEPOIS DE CADASTRADO
//
// O material nascia dentro do diálogo da receita e, a partir dali, não tinha
// onde ser corrigido. `materials.update` e `materials.setArchived` existiam no
// servidor, testadas, e nenhuma tela as chamava: um "Rosa brnaca" digitado
// errado ficava para sempre, e a biblioteca só crescia.
//
// ── DOIS LUGARES, UM DIÁLOGO ────────────────────────────────────────────────
// Ele abre de dois lugares, e é o MESMO componente nos dois: do diálogo da
// receita (corrigir o material de onde ele é escolhido) e da tela de Catálogo
// (revisar a biblioteca inteira antes da temporada).
//
// Por isso ele mora em `src/components/catalogo/` e não dentro da Ficha
// Técnica: duas cópias divergiriam na primeira correção, e o aviso do rodapé
// — o que muda e o que não muda — é justamente o que não pode divergir.
//
// ── O QUE ESTA TELA DELIBERADAMENTE NÃO FAZ ─────────────────────────────────
// Não mexe em receita nenhuma. A receita guarda um SNAPSHOT do material — nome,
// unidade, tipo, custo e margem copiados no momento em que a linha foi criada.
// É isso que impede um evento executado em junho de mudar porque alguém
// renomeou uma flor em setembro.
//
// Então renomear aqui corrige o CATÁLOGO, e as receitas que já citam o material
// continuam como estavam. O aviso no rodapé diz isso em português, porque a
// alternativa — a pessoa achar que corrigiu e não ter corrigido — é pior.
// ─────────────────────────────────────────────────────────────────────────────

export type MaterialEditavel = {
  _id: Id<"materials">;
  nome: string;
  unidade: string;
  categoria?: string;
  tipo?: string;
  custoReferencia?: number;
  margemPercentual?: number;
  archived?: boolean;
};

type Props = {
  material: MaterialEditavel | null;
  onClose: () => void;
};

/**
 * Campo numérico opcional: vazio LIMPA, ilegível RECUSA.
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────────
 * A versão anterior devolvia `null` nos dois casos, e `null` significa "apague
 * este campo". Quem digitasse "1.500,00" no custo de referência via:
 *
 *   `"1.500,00"` → `"1.500.00"` → `Number` → `NaN` → `null` → campo APAGADO
 *
 * seguido de "Material atualizado." em verde. O custo que ela acabara de
 * escrever sumia, e o único sinal era o campo vazio na próxima abertura — que
 * parece esquecimento dela, não defeito do sistema.
 *
 * E "1.500,00" não é digitação exótica: é como se escreve dinheiro no Brasil.
 * `valorDigitado` existe por causa desse mesmo erro em cinco outras telas.
 *
 * As três respostas agora são distintas, porque significam coisas diferentes:
 *   `undefined` — o campo está vazio: limpar;
 *   `number`    — leu;
 *   `"erro"`    — tem texto e não dá para ler: não gravar nada e avisar.
 */
function numeroOpcional(texto: string): number | null | "erro" {
  if (!texto.trim()) return null;
  const valor = valorDigitado(texto);
  return valor === null ? "erro" : valor;
}

export function MaterialDialog({ material, onClose }: Props) {
  const atualizar = useMutation(api.materials.update);
  const arquivar = useMutation(api.materials.setArchived);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tipo, setTipo] = useState("");
  const [custo, setCusto] = useState("");
  const [margem, setMargem] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!material) return;
    setNome(material.nome);
    setCategoria(material.categoria ?? "");
    setTipo(material.tipo ?? "");
    setCusto(material.custoReferencia?.toString() ?? "");
    setMargem(material.margemPercentual?.toString() ?? "");
  }, [material]);

  if (!material) return null;

  const comErro = (e: unknown) =>
    toast.error(
      e instanceof ConvexError
        ? (e.data as { message: string }).message
        : "Não foi possível salvar o material.",
    );

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("O material precisa de um nome.");
      return;
    }
    const custoLido = numeroOpcional(custo);
    if (custoLido === "erro") {
      toast.error("Custo não reconhecido. Ex.: 12,50 ou 1.500,00");
      return;
    }
    if (custoLido !== null && custoLido < 0) {
      toast.error("O custo não pode ser negativo.");
      return;
    }
    const margemLida = numeroOpcional(margem);
    if (margemLida === "erro") {
      toast.error("Margem não reconhecida. Escreva só o número: 40 para 40%.");
      return;
    }
    // A margem é PERCENTUAL, não dinheiro. Um 1500 digitado ali é quase sempre
    // alguém escrevendo o preço no campo errado — e uma sugestão de preço a
    // 1500% passaria despercebida no consolidado.
    if (margemLida !== null && (margemLida < 0 || margemLida > 100)) {
      toast.error("A margem é uma porcentagem entre 0 e 100.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar({
        id: material._id,
        nome: nome.trim(),
        // `null` LIMPA o campo; ausente não mexe. A distinção é do backend
        // (lib/limparCampos.ts) e a tela precisa respeitá-la: mandar `""`
        // gravaria uma categoria vazia em vez de remover a categoria.
        categoria: categoria.trim() || null,
        tipo: (tipo || null) as never,
        custoReferencia: custoLido,
        margemPercentual: margemLida,
      });
      toast.success("Material atualizado. As receitas já salvas não mudam.");
      onClose();
    } catch (e) {
      comErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const alternarArquivo = async () => {
    const indoParaArquivo = !material.archived;
    if (
      indoParaArquivo &&
      !window.confirm(
        `Arquivar "${material.nome}"? Ele sai da lista de escolha, mas as receitas que já o citam continuam legíveis.`,
      )
    )
      return;

    try {
      await arquivar({ id: material._id, archived: indoParaArquivo });
      toast.success(indoParaArquivo ? "Material arquivado." : "Material reativado.");
      onClose();
    } catch (e) {
      comErro(e);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar material</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="mat-nome" className="text-xs">
              Nome
            </Label>
            <Input
              id="mat-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="mat-categoria" className="text-xs">
                Categoria
              </Label>
              <Input
                id="mat-categoria"
                value={categoria}
                placeholder="Flores"
                onChange={(e) => setCategoria(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="mat-tipo" className="text-xs">
                Depois do evento
              </Label>
              <select
                id="mat-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Não classificado</option>
                {TIPOS_DE_MATERIAL.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo} — {t.detalhe}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="mat-custo" className="text-xs">
                Custo de referência (R$)
              </Label>
              <Input
                id="mat-custo"
                inputMode="decimal"
                value={custo}
                placeholder="6,90"
                onChange={(e) => setCusto(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="mat-margem" className="text-xs">
                Margem de segurança (%)
              </Label>
              <Input
                id="mat-margem"
                inputMode="decimal"
                value={margem}
                placeholder="10"
                onChange={(e) => setMargem(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* A unidade NÃO é editável aqui de propósito: ela faz parte da chave
              de identidade do material (lib/materiais.ts). "Rosa em haste" e
              "rosa em maço" são materiais diferentes, com preços diferentes, e
              trocar a unidade de um existente misturaria as duas no
              consolidado. Para mudar de unidade, cadastra-se outro. */}
          <p className="text-xs text-muted-foreground">
            Unidade: <strong>{UNIDADES.find((u) => u.valor === material.unidade)?.rotulo ?? material.unidade}</strong>.
            Ela não muda depois de criada — material em haste e em maço são
            materiais diferentes.
          </p>

          <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            Corrigir aqui muda o <strong>catálogo</strong>. As receitas já
            salvas guardam uma cópia e continuam como estão — é isso que impede
            um evento antigo de mudar sozinho. Para trazer a correção a esta
            receita, escolha o material de novo na linha.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => void alternarArquivo()}
            className="cursor-pointer gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Archive className="size-4" />
            {material.archived ? "Reativar" : "Arquivar"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando} className="cursor-pointer">
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
