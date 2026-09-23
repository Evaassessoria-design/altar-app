// ─────────────────────────────────────────────────────────────────────────────
// A DESPESA QUE SOBREVIVEU À COMPRA
//
// Cancelar ou excluir uma compra que já virou custo abre uma escolha: apagar a
// despesa ou mantê-la. Manter é o caminho certo quando o dinheiro saiu de
// verdade — e manter DESVINCULA, porque enquanto o vínculo existe a compra
// cancelada é uma inconsistência que cala a margem do evento inteiro.
//
// O efeito colateral era uma linha órfã no livro: "Rosas brancas — Flora Bela ·
// R$ 400", sem nada dizendo que aquilo é o resto de uma compra desfeita. Meses
// depois, ninguém sabe se ainda vale.
//
// `transactions.origemCompra` é o snapshot que fecha esse buraco, e este módulo
// é o que a tela diz sobre ele. PROVENIÊNCIA, não vínculo: nada aqui reconstrói
// ligação nenhuma, e nenhuma soma muda por causa deste texto.
// ─────────────────────────────────────────────────────────────────────────────

export type DespesaComOrigem = {
  description?: string;
  origemCompra?: {
    nome: string;
    desfecho: "cancelada" | "excluida";
    em: string;
  };
};

/**
 * Normaliza para COMPARAR — nunca para exibir.
 *
 * Mesma ideia de `chaveDoAmbiente`: a comparação ignora caixa e acento, e o
 * texto mostrado continua sendo o que ela escreveu.
 */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * "de compra cancelada" — a frase curta da linha do Financeiro.
 *
 * `null` quando a despesa não veio de compra desfeita, que é o caso de quase
 * todo lançamento: os avulsos, os do contrato, e os cuja compra continua viva
 * e vinculada (nesses, quem responde "de onde veio?" é o próprio vínculo).
 *
 * O NOME só entra quando acrescenta. A descrição do lançamento já nasce do
 * nome da compra ("Rosas brancas — Flora Bela"), então repeti-lo seria eco — o
 * mesmo motivo pelo qual o Caderno de Montagem tira "Ambiente: ..." das linhas
 * quando vira repetição do título. Mas a descrição é EDITÁVEL no Financeiro:
 * quem reescreveu a linha para "Ajuste de outubro" perdeu a única pista do que
 * aquilo era, e aí o nome da compra é exatamente o que falta.
 */
export function origemDaDespesa(tx: DespesaComOrigem): string | null {
  const origem = tx.origemCompra;
  if (!origem) return null;

  const desfecho = origem.desfecho === "cancelada" ? "cancelada" : "excluída";
  const nome = origem.nome.trim();
  const descricao = tx.description ?? "";
  // Nome em branco não acrescenta nada — e emendá-lo produziria "de compra
  // cancelada: ", com os dois-pontos pendurados no fim da linha.
  const acrescenta = nome !== "" && !chave(descricao).includes(chave(nome));

  return acrescenta ? `de compra ${desfecho}: ${nome}` : `de compra ${desfecho}`;
}

/**
 * A frase inteira, para o diálogo — com a data em que o vínculo foi desfeito.
 *
 * Separada da curta de propósito: na linha da lista, vinte caracteres a mais
 * empurram categoria e data para fora em 320px. Quem abriu o diálogo quer o
 * detalhe.
 */
export function detalheDaOrigem(
  tx: DespesaComOrigem,
  formatarData: (iso: string) => string,
): string | null {
  const origem = tx.origemCompra;
  if (!origem) return null;
  const desfecho = origem.desfecho === "cancelada" ? "cancelada" : "excluída";
  const nome = origem.nome.trim() || "uma compra";
  return `Nasceu da compra "${nome}", ${desfecho} em ${formatarData(origem.em)}. O custo foi mantido no financeiro.`;
}
