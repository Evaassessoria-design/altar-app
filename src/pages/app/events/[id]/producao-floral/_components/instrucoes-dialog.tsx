import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  ROTULO_DA_INSTRUCAO,
  type InstrucoesFlorais,
} from "@/convex/lib/producaoFloral.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUÇÕES DE UMA COMPOSIÇÃO PARA O FLORISTA
//
// Sete campos, todos opcionais, todos texto livre. "Altura 60 cm" e "entre 55
// e 65, o que a flor permitir" são as duas respostas certas, e um número
// obrigatório forçaria a decoradora a mentir para o campo.
//
// Nada aqui mexe na receita: do que o arranjo é FEITO continua na Ficha
// Técnica, cadastrado uma vez só.
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS = [
  { chave: "formato", placeholder: "Compacto, assimétrico, cascata…", linhas: 2 },
  { chave: "altura", placeholder: "Até 35 cm — não pode tapar quem está na mesa", linhas: 2 },
  { chave: "montagem", placeholder: "Espuma floral hidratada, caule de 12 cm…", linhas: 3 },
  { chave: "substituicoes", placeholder: "Se faltar lisianthus: astromélia branca", linhas: 2 },
  { chave: "cuidados", placeholder: "Hortênsia fora da água murcha em 2 h", linhas: 2 },
  { chave: "horario", placeholder: "Entregar às 14h, montado no local", linhas: 1 },
  { chave: "observacoes", placeholder: "O que mais o florista precisa saber", linhas: 3 },
] as const;

export function InstrucoesDialog({
  itemId,
  nome,
  atual,
  onClose,
}: {
  itemId: Id<"assemblyItems"> | null;
  nome: string;
  atual: InstrucoesFlorais;
  onClose: () => void;
}) {
  const salvar = useMutation(api.producaoFloral.setInstrucoes);
  const [form, setForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    setForm({
      formato: atual.formato ?? "",
      altura: atual.altura ?? "",
      montagem: atual.montagem ?? "",
      substituicoes: atual.substituicoes ?? "",
      cuidados: atual.cuidados ?? "",
      horario: atual.horario ?? "",
      observacoes: atual.observacoes ?? "",
    });
    // `atual` é recriado a cada render do pai; a dependência é o item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!itemId) return null;

  const gravar = async () => {
    setSalvando(true);
    try {
      await salvar({
        id: itemId,
        floral: {
          formato: form.formato,
          altura: form.altura,
          montagem: form.montagem,
          substituicoes: form.substituicoes,
          cuidados: form.cuidados,
          horario: form.horario,
          observacoes: form.observacoes,
        },
      });
      toast.success("Instruções salvas.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível salvar as instruções.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Instruções — {nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {CAMPOS.map((campo) => (
            <div key={campo.chave}>
              <Label htmlFor={`floral-${campo.chave}`} className="text-xs">
                {ROTULO_DA_INSTRUCAO[campo.chave]}
              </Label>
              {campo.linhas === 1 ? (
                <Input
                  id={`floral-${campo.chave}`}
                  value={form[campo.chave] ?? ""}
                  placeholder={campo.placeholder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [campo.chave]: e.target.value }))
                  }
                  className="mt-1"
                />
              ) : (
                <Textarea
                  id={`floral-${campo.chave}`}
                  value={form[campo.chave] ?? ""}
                  placeholder={campo.placeholder}
                  rows={campo.linhas}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [campo.chave]: e.target.value }))
                  }
                  className="mt-1"
                />
              )}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Cuidados e horário aparecem duas vezes na ficha: aqui, na composição, e
            num bloco destacado no começo do papel.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={salvando} className="cursor-pointer">
            {salvando ? "Salvando…" : "Salvar instruções"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
