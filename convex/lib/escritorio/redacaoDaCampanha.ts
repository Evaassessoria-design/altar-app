import type { ModeloDeMensagem } from "../mensagensDaCampanha";
import { campanhaPorSlug } from "../campanha";

// ─────────────────────────────────────────────────────────────────────────────
// COMO UM RASCUNHO NASCE
//
// ── POR QUE ISTO SAIU DE `campanhaRascunhos.ts` ─────────────────────────────
// Dois caminhos criam rascunho: alguém clicando em "escrever" numa pessoa, e o
// ciclo do Escritório escrevendo em lote. Antes da extração, o segundo teria
// de copiar as quinze linhas do primeiro — e duas cópias da mesma redação
// divergem na primeira correção de texto, com a mesma pessoa recebendo versões
// diferentes conforme o botão por onde a mensagem saiu.
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não lê banco, não decide QUEM recebe, não grava. Recebe um registro e um
// modelo, devolve os campos do rascunho.
// ─────────────────────────────────────────────────────────────────────────────

/** O que a redação precisa saber sobre a pessoa. */
export type LeadParaRedacao = {
  name: string;
  empresa?: string;
  email?: string;
  whatsapp?: string;
  origem?: string;
  campanha?: string;
};

/**
 * O nome que vai para a MENSAGEM — não o que está no cadastro.
 *
 * ── O DEFEITO QUE ISTO IMPEDE ───────────────────────────────────────────────
 * Registros de homologação e de teste entram no banco com marcação: "[TESTE]
 * Helena Rangel". Internamente isso é útil e deve continuar aparecendo, porque
 * é como se distingue dado sintético de pessoa real.
 *
 * Numa mensagem preparada, vira "Olá, [TESTE]! Tudo bem?" — e basta alguém
 * copiar sem ler para uma decoradora receber isso.
 *
 * A limpeza é de PREFIXO entre colchetes, no começo, e só lá: um colchete no
 * meio do nome é parte do nome, e apagá-lo seria corrigir o que não está
 * errado.
 */
export function nomeParaMensagem(nome: string): string {
  let limpo = nome.trim();
  // Repetido porque há registros com mais de uma marca ("[TESTE] [DEMO] Ana").
  while (true) {
    const semPrefixo = limpo.replace(/^\[[^\]]*\]\s*/, "");
    if (semPrefixo === limpo) break;
    limpo = semPrefixo;
  }
  // Nome que era SÓ a marca não pode virar vazio: a saudação sairia como
  // "Olá, !". Devolve o original e a saudação cai no caminho sem nome.
  return limpo.length > 0 ? limpo : nome.trim();
}

/** Por onde falar com ela. WhatsApp na frente: é onde decoradora responde. */
export function canalDe(lead: LeadParaRedacao): {
  canal: "whatsapp" | "email";
  destinatario?: string;
} {
  const zap = lead.whatsapp?.trim();
  if (zap) return { canal: "whatsapp", destinatario: zap };
  const email = lead.email?.trim();
  if (email) return { canal: "email", destinatario: email };
  // Sem contato nenhum: o rascunho ainda nasce, com a pendência declarada. O
  // contrário faria a lista prometer que todo mundo é alcançável.
  return { canal: "whatsapp" };
}

export type RascunhoRedigido = {
  tipo: string;
  canalSugerido: "whatsapp" | "email";
  destinatario?: string;
  texto: string;
  pendencias: string[];
  contexto: string;
  motivo: string;
  proximaAcao: string;
};

/**
 * Os campos de um rascunho, prontos para gravar.
 *
 * `contexto` é por que ESTA pessoa agora; `motivo` é o que originou o preparo.
 * São duas frases diferentes de propósito — a primeira a tela mostra ao lado
 * do texto, a segunda explica de onde o trabalho veio.
 */
export function redigirParaLead(
  lead: LeadParaRedacao,
  modelo: ModeloDeMensagem,
  contexto: string,
  motivo = "Preparado pelo Escritório.",
): RascunhoRedigido {
  const { canal, destinatario } = canalDe(lead);
  const redigido = modelo.redigir({
    nome: nomeParaMensagem(lead.name),
    empresa: lead.empresa,
    origem: lead.origem,
    campanha: campanhaPorSlug(lead.campanha),
  });

  const pendencias = [...redigido.pendencias];
  if (!destinatario) {
    pendencias.push("Não há telefone nem e-mail gravado para esta pessoa.");
  }
  // O modelo tem canal preferido, mas o cadastro manda: preparar um e-mail
  // para quem só tem WhatsApp é um rascunho que não tem para onde ir.
  if (modelo.canal === "email" && canal === "whatsapp" && destinatario) {
    pendencias.push("Este modelo é de e-mail, e só há WhatsApp gravado.");
  }

  return {
    tipo: modelo.id,
    canalSugerido: destinatario ? canal : modelo.canal,
    destinatario,
    texto: redigido.texto,
    pendencias,
    contexto,
    motivo,
    proximaAcao: modelo.proximaAcao,
  };
}
