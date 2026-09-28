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

export type FatoColetado = {
  fonte: Fonte;
  rotulo: string;
  dados: unknown;
  /**
   * A leitura desta fonte falhou. O fato continua na lista para a resposta
   * poder DIZER que não conseguiu ler — calar faria "não achei nada" parecer
   * "está tudo em dia".
   */
  indisponivel?: true;
};

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
 * Uma fonte em JSON, cabendo no orçamento dela.
 *
 * ── POR QUE NÃO UM `.slice` NO FIM ──────────────────────────────────────────
 * Até 28/09 o executor fazia `resumirFatos(fatos).slice(0, 8000)` no texto
 * inteiro. A primeira fonte grande comia o teto e as seguintes sumiam — sem
 * aviso ao modelo, que respondia "não há vencidos" porque o bloco de vencidos
 * nunca chegou. Cortar no fim é esconder dado em silêncio.
 *
 * Aqui cada fonte tem a SUA parte. Lista é aparada item a item, do começo (as
 * consultas já devolvem na ordem que a tela mostra), e o texto DIZ quantos
 * itens ficaram de fora. Objeto que não cabe é cortado com o mesmo aviso. O
 * modelo sabe o que não viu — e a instrução manda dizer quando não sabe.
 */
function jsonNoOrcamento(dados: unknown, orcamento: number): string {
  const inteiro = JSON.stringify(dados ?? null);
  if (inteiro.length <= orcamento) return inteiro;

  if (Array.isArray(dados)) {
    const aviso = (n: number) =>
      `\n(lista cortada: ${n} de ${dados.length} itens mostrados; os demais existem e não foram lidos)`;
    let cabem = 0;
    let tamanho = 2; // os colchetes
    for (const item of dados) {
      const t = JSON.stringify(item ?? null).length + 1;
      if (tamanho + t + aviso(cabem + 1).length > orcamento) break;
      tamanho += t;
      cabem++;
    }
    return JSON.stringify(dados.slice(0, cabem)) + aviso(cabem);
  }

  const aviso = "\n(dado cortado por tamanho: o restante existe e não foi lido)";
  return inteiro.slice(0, Math.max(0, orcamento - aviso.length)) + aviso;
}

/**
 * Os fatos em texto, para o modelo ler.
 *
 * JSON compacto e não prosa: o modelo lê JSON melhor do que lê uma tabela mal
 * desenhada, e o custo por token é menor. O rótulo humano vai junto para a
 * resposta não citar nome técnico de consulta.
 *
 * `limite` é dividido igualmente entre as fontes lidas (ver `jsonNoOrcamento`).
 */
export function resumirFatos(
  fatos: readonly FatoColetado[],
  limite: number = Number.POSITIVE_INFINITY,
): string {
  const lidos = fatos.filter((f) => !f.indisponivel);
  const orcamento = lidos.length > 0 ? Math.floor(limite / lidos.length) : limite;
  return fatos
    .map((f) =>
      f.indisponivel
        ? `## ${f.rotulo}\n(indisponível agora: esta área não pôde ser lida)`
        : `## ${f.rotulo}\n${jsonNoOrcamento(f.dados, orcamento)}`,
    )
    .join("\n\n");
}

/** Uma linha sobre uma fonte, quando dá para dizer algo honesto sobre ela. */
function linhaDoFato(f: FatoColetado): string | null {
  if (f.indisponivel) return `${f.rotulo}: não consegui ler agora.`;
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
  const lidos = fatos.filter((f) => !f.indisponivel);
  const rodape = lidos.length
    ? `\n\nConsultei: ${lidos.map((f) => f.rotulo).join(" · ")}.`
    : "";

  const aviso = cor === "amarelo" ? `${recadoDoRascunho(undefined)}\n\n` : "";

  return `${aviso}${cabecalho}\n\n${corpo}${rodape}`;
}
