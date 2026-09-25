// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VÊM LEADS NOVOS
//
// ── O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É ─────────────────────────────────
// É um CONTRATO. Nenhuma fonte externa está ligada, nenhuma chamada de rede
// acontece aqui, e não há scraping de coisa nenhuma.
//
// Ele existe para que, no dia em que houver uma fonte legítima — uma lista
// comprada de um fornecedor, uma exportação de um evento do setor, uma
// integração com um diretório que ofereça API —, ligá-la seja escrever UM
// adaptador, e não reescrever a campanha.
//
// É o mesmo desenho de `lib/channels/tipos.ts`, que já provou funcionar: a
// Central não conhece WhatsApp, conhece `MensagemNormalizada`. Aqui a campanha
// não conhece fonte nenhuma; conhece `CandidatoALead`.
//
// ── O QUE NÃO SE FAZ, E POR QUÊ ─────────────────────────────────────────────
// Não se raspa site que proíbe. Não se contorna bloqueio. Não se inventa
// telefone a partir de padrão. Não se deduz e-mail de nome + domínio.
//
// A razão não é só legal: um contato inventado que dá errado queima o número
// de quem manda, e o número é o ativo da campanha inteira. Uma lista de mil
// contatos inventados vale menos do que dez reais.
//
// ── POR QUE CANDIDATO, E NÃO LEAD ───────────────────────────────────────────
// O que uma fonte devolve é um CANDIDATO: pode ser duplicata, pode estar fora
// do público, pode não ter contato utilizável. Só vira `landingLeads` depois
// de passar pela qualificação — e essa passagem é a diferença entre uma base
// e um monte de linhas.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarE164 } from "../central/telefone";

/** Como a fonte é identificada no cadastro. Espelha `ORIGENS` de campanha.ts. */
export type OrigemDaFonte = "prospeccao" | "evento" | "indicacao" | "outro";

/**
 * O que uma fonte entrega.
 *
 * Tudo opcional menos o nome, porque uma fonte honesta entrega o que tem. Uma
 * que preencha todos os campos sempre está inventando alguns.
 */
export type CandidatoALead = {
  nome: string;
  empresa?: string;
  email?: string;
  whatsapp?: string;
  cidade?: string;
  estado?: string;
  site?: string;
  instagram?: string;
  /** Eventos por ano, quando a fonte informa. Porte é o único sinal objetivo. */
  eventosPorAno?: number;
  /**
   * De onde ESTE registro saiu, na fonte.
   *
   * Uma URL, um id de exportação, o nome do arquivo. Serve para responder
   * "de onde veio esta pessoa?" seis meses depois, que é a pergunta que
   * aparece quando alguém reclama de ter sido contactado.
   */
  procedencia?: string;
};

export type FonteDeLeads = {
  id: string;
  rotulo: string;
  origem: OrigemDaFonte;
  /** A fonte está utilizável neste ambiente? Sem credencial, `false`. */
  configurada(): boolean;
  /**
   * Busca candidatos.
   *
   * Assinatura declarada, implementação inexistente: nenhuma fonte real está
   * escrita. A primeira que for precisa respeitar o `limite` — uma fonte que
   * devolva dez mil de uma vez transforma a qualificação num processo que não
   * fecha.
   */
  buscar(criterio: CriterioDeBusca, limite: number): Promise<CandidatoALead[]>;
};

export type CriterioDeBusca = {
  /** "decoração de eventos", "cerimonial". Texto que a fonte entende. */
  termo?: string;
  cidade?: string;
  estado?: string;
};

// ── QUALIFICAÇÃO ────────────────────────────────────────────────────────────

export type MotivoDeRecusa =
  | "sem_nome"
  | "sem_contato"
  | "contato_ilegivel"
  | "ja_cadastrado";

export type Qualificacao = {
  candidato: CandidatoALead;
  aprovado: boolean;
  /** Ausente quando aprovado. */
  recusa?: MotivoDeRecusa;
  /**
   * Por que este candidato vale a pena, em palavras.
   *
   * ── POR QUE NÃO É UM SCORE ──────────────────────────────────────────────
   * Um número diria "73" e ninguém saberia o que fazer com isso — nem se 73 é
   * bom, nem o que mudaria para virar 80.
   *
   * Uma frase diz "faz 40 eventos por ano, em São Paulo", e a decisão de falar
   * com ela primeiro sai sozinha. É a mesma escolha de `procurouOAltar`: fato
   * verificável em vez de peso arbitrário.
   */
  porque: string[];
  /** E.164, quando o telefone normaliza. É o que permite deduplicar. */
  whatsappE164?: string;
  emailNormalizado?: string;
};

/** O que já está na base, para a fonte não reapresentar quem já existe. */
export type BaseConhecida = {
  emails: ReadonlySet<string>;
  telefones: ReadonlySet<string>;
};

/**
 * Um candidato vira lead?
 *
 * ── A ORDEM DAS RECUSAS É A ORDEM DO QUE É PIOR ─────────────────────────────
 * Sem nome primeiro: um registro sem nome não tem como ser abordado nem
 * reconhecido depois. Depois sem contato, que é inalcançável. Por último
 * duplicata, que é o caso BOM — significa que a base já tinha a pessoa.
 */
export function qualificar(
  candidato: CandidatoALead,
  base: BaseConhecida,
): Qualificacao {
  const nome = candidato.nome?.trim() ?? "";
  if (!nome) {
    return { candidato, aprovado: false, recusa: "sem_nome", porque: [] };
  }

  const email = candidato.email?.trim().toLowerCase();
  const emailValido = email && email.includes("@") ? email : undefined;
  const e164 = candidato.whatsapp ? (normalizarE164(candidato.whatsapp) ?? undefined) : undefined;

  if (!emailValido && !candidato.whatsapp?.trim()) {
    return { candidato, aprovado: false, recusa: "sem_contato", porque: [] };
  }
  // Telefone que não normaliza E nenhum e-mail: a pessoa entra e não tem como
  // ser alcançada. Recusar é melhor do que deixá-la ocupar lugar na fila.
  if (!emailValido && !e164) {
    return { candidato, aprovado: false, recusa: "contato_ilegivel", porque: [] };
  }

  const jaTem =
    (e164 && base.telefones.has(e164)) || (emailValido && base.emails.has(emailValido));
  if (jaTem) {
    return {
      candidato,
      aprovado: false,
      recusa: "ja_cadastrado",
      porque: [],
      whatsappE164: e164,
      emailNormalizado: emailValido,
    };
  }

  // ── POR QUE VALE A PENA ──────────────────────────────────────────────
  // Só fatos que a FONTE entregou. Nada inferido, nada suposto.
  const porque: string[] = [];
  if (candidato.eventosPorAno !== undefined) {
    porque.push(`${candidato.eventosPorAno} eventos por ano`);
  }
  if (candidato.empresa) porque.push(candidato.empresa);
  if (candidato.cidade) {
    porque.push([candidato.cidade, candidato.estado].filter(Boolean).join("/"));
  }
  if (e164) porque.push("telefone utilizável");
  else if (emailValido) porque.push("e-mail utilizável");

  return {
    candidato,
    aprovado: true,
    porque,
    whatsappE164: e164,
    emailNormalizado: emailValido,
  };
}

export type ResumoDaQualificacao = {
  analisados: number;
  aprovados: number;
  porRecusa: Record<MotivoDeRecusa, number>;
};

/**
 * As contagens, para a tela dizer o que aconteceu com a lista inteira.
 *
 * "Importei 200 e entraram 140" precisa ser seguido de onde foram os outros
 * 60 — senão a pessoa conclui que o importador perdeu registros.
 */
export function resumirQualificacao(
  qualificacoes: readonly Qualificacao[],
): ResumoDaQualificacao {
  const porRecusa: Record<MotivoDeRecusa, number> = {
    sem_nome: 0,
    sem_contato: 0,
    contato_ilegivel: 0,
    ja_cadastrado: 0,
  };
  for (const q of qualificacoes) {
    if (q.recusa) porRecusa[q.recusa]++;
  }
  return {
    analisados: qualificacoes.length,
    aprovados: qualificacoes.filter((q) => q.aprovado).length,
    porRecusa,
  };
}

/** A frase para quem lê. Nunca "alguns registros foram ignorados". */
export function fraseDaQualificacao(r: ResumoDaQualificacao): string {
  if (r.analisados === 0) return "Nenhum candidato para analisar.";
  const partes: string[] = [`${r.aprovados} de ${r.analisados} podem entrar`];
  const nomes: Record<MotivoDeRecusa, string> = {
    sem_nome: "sem nome",
    sem_contato: "sem contato",
    contato_ilegivel: "com contato ilegível",
    ja_cadastrado: "já cadastrados",
  };
  for (const [motivo, n] of Object.entries(r.porRecusa) as [MotivoDeRecusa, number][]) {
    if (n > 0) partes.push(`${n} ${nomes[motivo]}`);
  }
  return `${partes.join(" · ")}.`;
}

// ── O REGISTRO DE FONTES ────────────────────────────────────────────────────

/**
 * As fontes disponíveis neste build.
 *
 * VAZIO de propósito. A importação de CSV que já existe (`lib/importacaoDeLeads.ts`)
 * NÃO é uma fonte neste sentido: ela recebe um arquivo que uma pessoa escolheu,
 * e não busca nada. Registrá-la aqui daria a impressão de que o sistema procura
 * leads sozinho, que é exatamente o que ele não faz.
 */
export const FONTES: readonly FonteDeLeads[] = [];

export function fontesConfiguradas(): FonteDeLeads[] {
  return FONTES.filter((f) => f.configurada());
}

/** A frase honesta sobre prospecção automática. */
export function recadoSobreFontes(): string {
  const prontas = fontesConfiguradas();
  if (prontas.length === 0) {
    return "Nenhuma fonte de leads conectada. Os interessados entram pela landing, por importação de lista ou digitados à mão.";
  }
  return `Fontes conectadas: ${prontas.map((f) => f.rotulo).join(", ")}.`;
}
