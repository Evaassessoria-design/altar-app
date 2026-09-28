import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { mensagemSeguraDoErro } from "@/lib/mensagem-segura.ts";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA DE RETORNO — a segunda-feira, peça por peça, numa tela só
//
//   Mesa Toscana — saíram 8 · voltaram 8
//   prontas 6 · limpar 1 · reparo 1 · indisponível 0
//
// "Prontas" nunca é digitado: é o que voltou menos as outras condições. A
// conferência vai inteira ao servidor (`acervo.conferirRetorno`), numa
// transação: uma linha errada recusa tudo, e nada fica conferido pela metade.
// O que não está pronto sai da disponibilidade na hora.
// ─────────────────────────────────────────────────────────────────────────────

type ReservaParaConferir = {
  _id: Id<"collectionReservations">;
  saiu?: number;
  voltou?: number;
  conferidoEm?: number;
  item: { nome: string; unidade: string } | null;
};

type Linha = { voltou: number; limpeza: number; reparo: number; indisponivel: number };

function Contador({ rotulo, valor, onMudar, max }: { rotulo: string; valor: number; onMudar: (n: number) => void; max: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{rotulo}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="size-10 cursor-pointer"
          aria-label={`Menos ${rotulo}`} disabled={valor <= 0} onClick={() => onMudar(valor - 1)}>
          <Minus className="size-4" />
        </Button>
        <span className="w-8 text-center tabular-nums font-medium">{valor}</span>
        <Button type="button" variant="outline" size="icon" className="size-10 cursor-pointer"
          aria-label={`Mais ${rotulo}`} disabled={valor >= max} onClick={() => onMudar(valor + 1)}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function ConferenciaDeRetorno({
  eventId,
  reservas,
}: {
  eventId: Id<"events">;
  reservas: ReservaParaConferir[];
}) {
  const conferir = useMutation(api.acervo.conferirRetorno);
  const membros = useQuery(api.team.listMembers);
  const pendentes = reservas.filter((r) => (r.saiu ?? 0) > 0 && r.conferidoEm === undefined);
  const [linhas, setLinhas] = useState<Record<string, Linha>>(() =>
    Object.fromEntries(
      pendentes.map((r) => [r._id, { voltou: r.voltou ?? r.saiu ?? 0, limpeza: 0, reparo: 0, indisponivel: 0 }]),
    ),
  );
  const [responsavel, setResponsavel] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (pendentes.length === 0) return null;

  const mudar = (id: string, campo: keyof Linha, valor: number) =>
    setLinhas((l) => ({ ...l, [id]: { ...l[id], [campo]: Math.max(0, valor) } }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await conferir({
        eventId,
        responsibleId: (responsavel || undefined) as Id<"teamMembers"> | undefined,
        linhas: pendentes.map((p) => ({ reservaId: p._id, ...linhas[p._id] })),
      });
      toast.success(
        r.pecasForaDeUso > 0
          ? `Retorno conferido. ${r.pecasForaDeUso} peça(s) ficaram fora de uso até a limpeza ou o reparo.`
          : "Retorno conferido. Tudo pronto para o próximo evento.",
      );
    } catch (e) {
      toast.error(mensagemSeguraDoErro(e) ?? "Não foi possível conferir agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section aria-label="Conferência de retorno"
      className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
      <div>
        <h2 className="font-semibold">Conferência de retorno</h2>
        <p className="text-xs text-muted-foreground">
          Quantas voltaram e em que condição. "Prontas" é o que sobra — não precisa contar.
        </p>
      </div>

      {pendentes.map((r) => {
        const l = linhas[r._id];
        const naoProntas = l.limpeza + l.reparo + l.indisponivel;
        const prontas = l.voltou - naoProntas;
        const un = abreviarUnidade(r.item?.unidade ?? "");
        return (
          <div key={r._id} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-sm">{r.item?.nome ?? "Item removido"}</p>
              <p className="text-xs text-muted-foreground">saíram {r.saiu} {un}</p>
            </div>
            <Contador rotulo="Voltaram" valor={l.voltou} max={r.saiu ?? 0}
              onMudar={(n) => mudar(r._id, "voltou", Math.min(n, r.saiu ?? 0))} />
            <Contador rotulo="Precisa limpar" valor={l.limpeza} max={l.voltou - l.reparo - l.indisponivel}
              onMudar={(n) => mudar(r._id, "limpeza", n)} />
            <Contador rotulo="Precisa de reparo" valor={l.reparo} max={l.voltou - l.limpeza - l.indisponivel}
              onMudar={(n) => mudar(r._id, "reparo", n)} />
            <Contador rotulo="Danificado / indisponível" valor={l.indisponivel} max={l.voltou - l.limpeza - l.reparo}
              onMudar={(n) => mudar(r._id, "indisponivel", n)} />
            <p className="text-sm">
              Prontas para o próximo evento:{" "}
              <strong className={prontas < 0 ? "text-destructive" : ""}>{prontas}/{r.saiu}</strong>
              {l.voltou < (r.saiu ?? 0) && (
                <span className="text-amber-700 dark:text-amber-400"> · {(r.saiu ?? 0) - l.voltou} ainda fora</span>
              )}
            </p>
          </div>
        );
      })}

      {membros && membros.length > 0 && (
        <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}
          aria-label="Quem conferiu"
          className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer">
          <option value="">Quem conferiu — não informar</option>
          {membros.map((m) => (
            <option key={m._id} value={m._id}>{m.name}</option>
          ))}
        </select>
      )}

      <Button className="h-12 w-full cursor-pointer text-base" disabled={salvando}
        onClick={() => void salvar()}>
        {salvando ? "Conferindo..." : "Confirmar conferência"}
      </Button>
    </section>
  );
}
