import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// "E O DINHEIRO QUE JÁ SAIU?"
//
// Cancelar ou excluir uma compra que já teve o custo registrado é a única
// situação em que o ALTAR não pode decidir sozinho. As duas saídas são
// legítimas e levam a lugares opostos:
//
//   · comprei, paguei e depois cancelei o pedido → o dinheiro saiu, o
//     registro dele tem de ficar;
//   · registrei por engano, nada foi movimentado → o registro tem de sumir.
//
// Escolher por ela erraria metade das vezes. Em uma dessas metades o erro
// apaga um comprovante de pagamento que aconteceu de verdade.
//
// Por isso a pergunta NOMEIA o que está em jogo — "já está paga", "1
// comprovante" — em vez de uma frase genérica. Quem decide precisa saber o
// que perde.
// ─────────────────────────────────────────────────────────────────────────────

export type DecisaoPendente = {
  acao: "cancelar" | "excluir";
  nome: string;
  valor: number;
  pago: boolean;
  comprovantes: number;
};

const moeda = (centavos: number) =>
  centavos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "já está paga e tem 2 comprovantes" — ou `null` quando não há o que dizer. */
function retratoDaDespesa(d: DecisaoPendente): string | null {
  const partes: string[] = [];
  if (d.pago) partes.push("já está paga");
  if (d.comprovantes > 0) {
    partes.push(
      d.comprovantes === 1 ? "tem 1 comprovante" : `tem ${d.comprovantes} comprovantes`,
    );
  }
  return partes.length > 0 ? partes.join(" e ") : null;
}

export function DecisaoDaDespesa({
  pendente,
  onEscolher,
  onFechar,
}: {
  pendente: DecisaoPendente;
  onEscolher: (decisao: "manter" | "remover") => void;
  onFechar: () => void;
}) {
  const retrato = retratoDaDespesa(pendente);
  const verbo = pendente.acao === "cancelar" ? "Cancelar" : "Excluir";

  return (
    <AlertDialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {verbo} "{pendente.nome}"
          </AlertDialogTitle>
          <AlertDialogDescription>
            O custo de <strong>{moeda(pendente.valor)}</strong> está registrado no
            financeiro
            {retrato ? ` e ${retrato}` : ""}. O que fazer com ele?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Botões empilhados: são duas escolhas de peso, não um sim/não. No
            telefone eles ocupam a largura toda, um em cima do outro. */}
        <div className="space-y-2">
          <AlertDialogAction
            onClick={() => onEscolher("manter")}
            className="w-full cursor-pointer"
          >
            Manter o custo no financeiro
          </AlertDialogAction>
          <p className="px-1 text-xs text-muted-foreground">
            O dinheiro saiu e o registro fica — com pagamento e comprovantes.
            {pendente.acao === "cancelar"
              ? " A compra fica cancelada."
              : " A compra é excluída."}
          </p>

          <AlertDialogAction
            onClick={() => onEscolher("remover")}
            className="w-full cursor-pointer bg-destructive text-white hover:bg-destructive/90"
          >
            Apagar o custo também
          </AlertDialogAction>
          <p className="px-1 text-xs text-muted-foreground">
            Some do financeiro
            {pendente.comprovantes > 0
              ? `, junto com ${pendente.comprovantes === 1 ? "o comprovante" : "os comprovantes"}`
              : ""}
            . Não há como desfazer.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Deixar como está</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
