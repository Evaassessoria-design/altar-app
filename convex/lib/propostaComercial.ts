// ─────────────────────────────────────────────────────────────────────────────
// PROPOSTA COMERCIAL — O DOCUMENTO QUE VAI PARA A CLIENTE
//
// ── A DISTINÇÃO QUE ESTE MÓDULO EXISTE PARA SUSTENTAR ───────────────────────
// O ALTAR já tinha UM documento de dinheiro: o Orçamento. Ele é INTERNO —
// traz custo orçado, lucro, margem e a tabela de custos — e desde a rodada
// passada diz isso no título, no rodapé e no nome do arquivo, porque o risco
// de mandar o errado era permanente.
//
// Faltava o outro: o documento que ELA manda. São coisas diferentes, e a
// diferença não é de formatação:
//
//   ORÇAMENTO INTERNO          PROPOSTA COMERCIAL
//   custo, lucro, margem       investimento
//   fornecedor                 —
//   linha a linha da operação  escopo que ela escolheu apresentar
//   para a reunião dela        para a cliente
//
// ── A REGRA DE OURO ─────────────────────────────────────────────────────────
// A fronteira mora na TRANSFORMAÇÃO, não na renderização. `paraOCliente` é a
// única porta por onde uma proposta vira documento, e ela CONSTRÓI um objeto
// novo campo a campo — nunca espalha (`...proposta`) o registro do banco.
//
// É a diferença entre "a tela não mostra o custo" e "o custo não existe no
// objeto que sai daqui". A primeira quebra quando alguém acrescenta um campo;
// a segunda não.
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não calcula margem (não conhece custo), não decide preço, não cobra, não
// assina, não envia e não muda status sozinho. Status é decisão de gente.
// ─────────────────────────────────────────────────────────────────────────────

import { emCentavos, somaEmDinheiro } from "./dinheiro";
import { rotuloDoTipoDeEvento } from "./tiposDeEvento";

/** Os cinco estados de uma proposta. Nenhum deles acontece sozinho. */
export const STATUS_DA_PROPOSTA = [
  "rascunho",
  "enviada",
  "aceita",
  "recusada",
] as const;

export type StatusDaProposta = (typeof STATUS_DA_PROPOSTA)[number];

export const ROTULO_DO_STATUS: Record<StatusDaProposta, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
};

/**
 * "Expirada" NÃO é um status gravado.
 *
 * Ele seria um estado que envelhece sozinho no banco e exigiria alguém
 * varrendo propostas todo dia para mantê-lo verdadeiro. Vencimento é
 * DERIVÁVEL da validade e da data de hoje — e estado derivável é derivado,
 * nunca gravado (é a convenção do repositório).
 */
export function estaVencida(
  validadeAte: string | undefined,
  status: StatusDaProposta,
  hojeISO: string,
): boolean {
  // Decidida é decidida: uma proposta aceita não "vence" depois.
  if (status === "aceita" || status === "recusada") return false;
  if (!validadeAte || !/^\d{4}-\d{2}-\d{2}/.test(validadeAte)) return false;
  return validadeAte.slice(0, 10) < hojeISO.slice(0, 10);
}

/** Um item como a CLIENTE o lê: o que ela recebe e quanto custa. */
export type ItemComercial = {
  /** O que a cliente lê. */
  descricao: string;
  /** Uma linha de detalhe, opcional. Continua sendo texto para a cliente. */
  detalhe?: string;
  /** O valor apresentado. Não é custo, não é margem: é preço. */
  valor: number;
};

/**
 * O investimento total.
 *
 * DERIVADO dos itens, nunca gravado: um total gravado diverge do primeiro item
 * editado, e aí a proposta mostra uma soma que não fecha com as linhas dela.
 *
 * `somaEmDinheiro` porque um item podre não pode transformar o documento
 * inteiro em "R$ NaN" na frente da cliente.
 */
export function investimentoTotal(itens: readonly ItemComercial[]): number {
  return somaEmDinheiro(itens.map((i) => i.valor));
}

/** O que o documento da cliente contém. NADA além disto. */
export type PropostaParaCliente = {
  titulo: string;
  apresentacao?: string;
  estudio: { nome: string; contato?: string };
  cliente: string;
  evento?: { tipo?: string; data?: string; local?: string; convidados?: number };
  itens: readonly ItemComercial[];
  investimento: number;
  condicoesPagamento?: string;
  validadeAte?: string;
  observacoes?: string;
};

/** O registro de proposta, como o banco o guarda. */
export type PropostaArmazenada = {
  titulo: string;
  apresentacao?: string;
  clienteNome: string;
  eventoTipo?: string;
  eventoData?: string;
  eventoLocal?: string;
  eventoConvidados?: number;
  itens: readonly ItemComercial[];
  condicoesPagamento?: string;
  validadeAte?: string;
  observacoes?: string;
};

const textoLimpo = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * A ÚNICA porta por onde uma proposta vira documento.
 *
 * Constrói um objeto NOVO, campo a campo. Não existe `...proposta` aqui, e
 * essa ausência é a regra: um campo interno acrescentado ao schema amanhã não
 * entra neste objeto por acidente, porque nada entra por acidente.
 *
 * O ITEM também é reconstruído. Espalhar o item deixaria passar qualquer
 * anotação interna que um dia seja acrescentada à linha.
 */
export function paraOCliente(
  proposta: PropostaArmazenada,
  estudio: { nome: string; contato?: string },
): PropostaParaCliente {
  const itens = proposta.itens.map((i) => ({
    descricao: i.descricao.trim(),
    detalhe: textoLimpo(i.detalhe),
    valor: emCentavos(i.valor),
  }));

  return {
    titulo: proposta.titulo.trim(),
    apresentacao: textoLimpo(proposta.apresentacao),
    estudio: { nome: estudio.nome, contato: textoLimpo(estudio.contato) },
    cliente: proposta.clienteNome.trim(),
    evento: {
      // Traduz OUTRA VEZ, de propósito. `create` já grava o rótulo, mas as
      // propostas criadas antes desta correção têm o slug gravado, e não há
      // backfill: o documento da cliente é o último lugar onde um "wedding"
      // pode aparecer, então é aqui que ele para. Valor desconhecido volta
      // como veio, então traduzir duas vezes é inofensivo.
      tipo: rotuloDoTipoDeEvento(textoLimpo(proposta.eventoTipo)),
      data: textoLimpo(proposta.eventoData),
      local: textoLimpo(proposta.eventoLocal),
      convidados:
        typeof proposta.eventoConvidados === "number" &&
        Number.isFinite(proposta.eventoConvidados)
          ? proposta.eventoConvidados
          : undefined,
    },
    itens,
    investimento: investimentoTotal(itens),
    condicoesPagamento: textoLimpo(proposta.condicoesPagamento),
    validadeAte: textoLimpo(proposta.validadeAte),
    observacoes: textoLimpo(proposta.observacoes),
  };
}

/**
 * A proposta está pronta para ser enviada?
 *
 * Não é validação de formulário — é a pergunta que evita mandar para a cliente
 * um documento sem preço ou sem escopo. Devolve as frases que faltam, em
 * português, para a tela não inventar as suas.
 */
export function faltaParaEnviar(proposta: PropostaArmazenada): string[] {
  const faltas: string[] = [];
  if (!proposta.titulo.trim()) faltas.push("A proposta precisa de um título.");
  if (proposta.itens.length === 0) {
    faltas.push("Inclua pelo menos um item de escopo — é o que a cliente vai ler.");
  }
  if (proposta.itens.some((i) => !i.descricao.trim())) {
    faltas.push("Todo item precisa de uma descrição.");
  }
  if (!proposta.clienteNome.trim()) faltas.push("Informe para quem é a proposta.");
  return faltas;
}
