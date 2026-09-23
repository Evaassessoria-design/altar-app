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

/**
 * "Essa despesa já está paga e possui 2 comprovantes." — frase inteira, ou
 * `null` quando não há nada a acrescentar.
 *
 * Frase própria, e não um pedaço colado na anterior: emendada em "O custo de
 * R$ 400,00 está registrado no financeiro", saía "o custo... está paga".
 * Concordância errada num aviso sobre dinheiro faz a pessoa reler em vez de
 * decidir.
 */
function retratoDaDespesa(d: DecisaoPendente): string | null {
  const partes: string[] = [];
  if (d.pago) partes.push("já está paga");
  if (d.comprovantes > 0) {
    partes.push(
      d.comprovantes === 1 ? "possui 1 comprovante" : `possui ${d.comprovantes} comprovantes`,
    );
  }
  return partes.length > 0 ? `Essa despesa ${partes.join(" e ")}.` : null;
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
  // O que de fato é preservado — nem mais, nem menos. Prometer "o pagamento e
  // os comprovantes" numa despesa que só tem um dos dois soa genérico e
  // ensina a não ler o aviso.
  const preservado = [
    pendente.pago ? "o pagamento" : null,
    pendente.comprovantes > 0
      ? pendente.comprovantes === 1
        ? "o comprovante"
        : "os comprovantes"
      : null,
  ].filter(Boolean) as string[];

  return (
    <AlertDialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {verbo} "{pendente.nome}"
          </AlertDialogTitle>
          <AlertDialogDescription>
            O custo de <strong>{moeda(pendente.valor)}</strong> está registrado no
            financeiro.{retrato ? ` ${retrato}` : ""} O que deseja fazer?
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
            {/* Só promete preservar o que existe: "com pagamento e
                comprovantes" numa despesa em aberto e sem anexo afirmaria
                duas coisas que não estão lá. */}
            O dinheiro saiu e o registro dele continua no financeiro
            {preservado.length > 0 ? `, com ${preservado.join(" e ")}` : ""}.
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
