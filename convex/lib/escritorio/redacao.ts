import { type Agente, type Fonte } from "./agentes";
import { recadoDoRascunho } from "./semaforo";

// ─────────────────────────────────────────────────────────────────────────────
// A REDAÇÃO SEM MODELO
//
// ── ISTO NÃO É UM MOCK DE DADOS ─────────────────────────────────────────────
// A distinção importa e é o ponto inteiro deste arquivo: os NÚMEROS aqui são
// os mesmos que a tela do Financeiro mostra, vindos das mesmas consultas, da
// conta certa. O que muda é QUEM ESCREVE a frase — uma regra em vez de um
// modelo.
//
// Um mock de dados ("você tem 3 recebimentos vencidos de R$ 4.200") seria
// mentira, e mentira num produto que a decoradora usa para decidir é pior do
// que não ter o produto.
//
// ── ONDE ISTO É USADO ───────────────────────────────────────────────────────
//   · em desenvolvimento e nos testes, onde não há chave de IA — e é o que
//     permite provar o fluxo inteiro sem gastar um centavo nem tocar a rede;
//   · em produção, se o modelo cair ou devolver vazio. O produto continua
//     respondendo com o que sabe, em vez de falhar.
//
// A tarefa grava `provedor: "local"` e a tela diz isso. A decoradora nunca lê
// um texto de regra achando que é de modelo.
// ─────────────────────────────────────────────────────────────────────────────

export type FatoColetado = { fonte: Fonte; rotulo: string; dados: unknown };

const brl = (centavosOuReais: number) =>
  centavosOuReais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** `unknown` → número, ou `undefined`. Nunca `NaN` atravessando para a tela. */
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Os fatos em texto, para o modelo ler.
 *
 * JSON compacto e não prosa: o modelo lê JSON melhor do que lê uma tabela mal
 * desenhada, e o custo por token é menor. O rótulo humano vai junto para a
 * resposta não citar nome técnico de consulta.
 */
export function resumirFatos(fatos: readonly FatoColetado[]): string {
  return fatos
    .map((f) => `## ${f.rotulo}\n${JSON.stringify(f.dados ?? null)}`)
    .join("\n\n");
}

/** Uma linha sobre uma fonte, quando dá para dizer algo honesto sobre ela. */
function linhaDoFato(f: FatoColetado): string | null {
  const d = obj(f.dados);

  switch (f.fonte) {
    case "financeiro.vencidos": {
      const aReceber = obj(d?.aReceber);
      const aPagar = obj(d?.aPagar);
      const qr = num(aReceber?.quantidade) ?? 0;
      const qp = num(aPagar?.quantidade) ?? 0;
      if (qr === 0 && qp === 0) return "Nada vencido — contas em dia.";
      const partes: string[] = [];
      if (qr > 0) {
        partes.push(`${qr} a receber, somando ${brl(num(aReceber?.total) ?? 0)}`);
      }
      if (qp > 0) {
        partes.push(`${qp} a pagar, somando ${brl(num(aPagar?.total) ?? 0)}`);
      }
      return `Vencidos: ${partes.join("; ")}.`;
    }

    case "financeiro.resumo": {
      if (!d) return null;
      const entrou = num(d.totalIncome) ?? 0;
      const saiu = num(d.totalExpense) ?? 0;
      const aReceber = num(d.pendingIncome) ?? 0;
      const corte = d.incompleto === true ? " (considerando os lançamentos mais recentes)" : "";
      return `Entrou ${brl(entrou)}, saiu ${brl(saiu)}, ainda a receber ${brl(aReceber)}${corte}.`;
    }

    case "comercial.funil": {
      if (!d) return null;
      const total = num(d.total) ?? 0;
      if (total === 0) return "Nenhuma oportunidade pedindo retorno.";
      const semAcao = arr(d.semAcao).length;
      const parados = arr(d.parados).length;
      return `${total} oportunidade(s) pedindo retorno — ${semAcao} sem próxima ação, ${parados} sem contato há tempo.`;
    }

    case "comercial.propostas": {
      const lista = Array.isArray(f.dados) ? f.dados : arr(d?.propostas);
      if (lista.length === 0) return "Nenhuma proposta registrada.";
      const vencidas = lista.filter((p) => obj(p)?.vencida === true).length;
      return `${lista.length} proposta(s)${vencidas > 0 ? `, ${vencidas} vencida(s)` : ""}.`;
    }

    case "compras.panorama": {
      const lista = arr(f.dados);
      if (lista.length === 0) return "Nenhuma compra registrada.";
      const pendentes = lista.filter((c) => obj(c)?.isPurchased !== true).length;
      return `${lista.length} compra(s) no painel, ${pendentes} ainda pendente(s).`;
    }

    case "eventos.proximos": {
      const lista = arr(f.dados);
      if (lista.length === 0) return "Nenhum evento à frente.";
      const nomes = lista
        .slice(0, 3)
        .map((e) => obj(e)?.name)
        .filter((n): n is string => typeof n === "string");
      return `${lista.length} evento(s) à frente${nomes.length ? `: ${nomes.join(", ")}` : ""}.`;
    }

    case "eventos.atencao": {
      const lista = Array.isArray(f.dados) ? f.dados : arr(d?.eventos);
      if (lista.length === 0) return "Nenhum evento pedindo atenção agora.";
      const urgentes = lista.filter((e) => obj(e)?.nivel === "urgente").length;
      return `${lista.length} evento(s) pedindo atenção${urgentes > 0 ? `, ${urgentes} urgente(s)` : ""}.`;
    }

    case "acervo.itens": {
      const lista = Array.isArray(f.dados) ? f.dados : arr(d?.itens);
      return lista.length === 0
        ? "Acervo vazio."
        : `${lista.length} item(ns) no acervo.`;
    }

    case "fornecedores.catalogo": {
      const lista = Array.isArray(f.dados) ? f.dados : arr(d?.fornecedores);
      return lista.length === 0
        ? "Nenhum fornecedor no catálogo."
        : `${lista.length} fornecedor(es) no catálogo.`;
    }
  }
  return null;
}

/**
 * A resposta escrita por regra.
 *
 * Curta e sem enfeite. Ela não tenta imitar um modelo: tenta dizer a verdade
 * sobre o que foi consultado, de um jeito que já é útil sozinho.
 */
export function redigirLocalmente(
  agente: Agente,
  _pedido: string,
  fatos: readonly FatoColetado[],
  cor: string,
): string {
  const linhas = fatos
    .map((f) => {
      const linha = linhaDoFato(f);
      return linha ? `• ${linha}` : null;
    })
    .filter((l): l is string => l !== null);

  const corpo =
    linhas.length > 0
      ? linhas.join("\n")
      : "Não encontrei nada registrado nessas áreas ainda.";

  const cabecalho = `${agente.nome} — ${agente.funcao}`;
  const rodape = fatos.length
    ? `\n\nConsultei: ${fatos.map((f) => f.rotulo).join(" · ")}.`
    : "";

  const aviso = cor === "amarelo" ? `${recadoDoRascunho(undefined)}\n\n` : "";

  return `${aviso}${cabecalho}\n\n${corpo}${rodape}`;
}
