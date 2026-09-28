import {
  definicaoDoEstagio,
  estagioDe,
  procurouOAltar,
  type EstagioDoInteressado,
} from "./campanha";
import { INTENCOES_DE_INTERESSE } from "./respostaDoInteressado";

// ═════════════════════════════════════════════════════════════════════════════
// PRIORIDADE DO INTERESSADO — um número que se explica
//
// ── A OBJEÇÃO QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────────
// `lib/campanha.ts` recusou score, e o motivo está escrito lá: "um score diria
// 87 e ninguém saberia o que fazer com isso". A objeção é certa sobre scores
// mágicos. Por isso aqui o número é o MENOS importante: cada ponto vem com o
// motivo, em português, e a lista de motivos é o que a tela mostra primeiro.
// "82 — pediu demonstração, respondeu que quer participar, WhatsApp
// informado; parado há 20 dias" diz exatamente o que fazer.
//
// ── AS REGRAS ───────────────────────────────────────────────────────────────
//   · determinístico: os mesmos fatos dão sempre o mesmo número;
//   · só fatos que EXISTEM no registro — ausente não pontua nem desconta (não
//     saber a cidade não é defeito da pessoa);
//   · pesos numa tabela só (`PESOS`), para a fórmula evoluir num lugar e o
//     teste acusar quando mudar;
//   · quem saiu do funil (cliente, perdido) não tem prioridade: tem desfecho.
// ═════════════════════════════════════════════════════════════════════════════

export const PESOS = {
  procurouOAltar: 25,
  pediuDemonstracao: 10,
  pediuBeta: 5,
  whatsapp: 10,
  empresa: 5,
  porteGrande: 10,
  respostaDeInteresse: 20,
  respostaComDuvida: 10,
  paradoDuasSemanas: -10,
  paradoUmMes: -20,
} as const;

/** Quanto o avanço no funil vale — é o sinal mais forte de todos. */
export const PESO_DO_ESTAGIO: Partial<Record<EstagioDoInteressado, number>> = {
  respondeu: 10,
  interessado: 20,
  confirmou: 30,
  participou: 25,
  demonstracao: 25,
  testando: 30,
  nao_participou: 5,
};

/** A partir de quantos eventos por ano a empresa é "de porte" para o ALTAR. */
export const EVENTOS_POR_ANO_DE_PORTE = 30;

export type Temperatura = "quente" | "morna" | "fria" | "fora";

export const ROTULO_DA_TEMPERATURA: Record<Temperatura, string> = {
  quente: "Alto interesse",
  morna: "Interesse médio",
  fria: "Baixo interesse",
  fora: "Fora do funil",
};

export type FatorDaPrioridade = { texto: string; pontos: number };

export type Prioridade = {
  /** 0 a 100. Zero para quem está fora do funil. */
  pontos: number;
  temperatura: Temperatura;
  /** Os motivos, positivos primeiro — é isto que a tela mostra. */
  fatores: FatorDaPrioridade[];
};

export type FatosParaPrioridade = {
  status?: string;
  origem?: string;
  intent?: string;
  whatsappE164?: string;
  empresa?: string;
  eventosPorAno?: number;
  /** "AAAA-MM-DD". */
  ultimaInteracao?: string;
  /** A intenção da resposta mais recente registrada, se houver. */
  ultimaIntencao?: string;
};

function diasEntre(deISO: string, ateISO: string): number | undefined {
  const a = Date.parse(`${deISO}T12:00:00Z`);
  const b = Date.parse(`${ateISO}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.round((b - a) / 86_400_000);
}

export function prioridadeDoInteressado(f: FatosParaPrioridade, hojeISO: string): Prioridade {
  const estagio = estagioDe(f);
  if (estagio === "convertido" || estagio === "descartado") {
    return {
      pontos: 0,
      temperatura: "fora",
      fatores: [
        { texto: estagio === "convertido" ? "Já é cliente" : "Marcado como perdido", pontos: 0 },
      ],
    };
  }

  const fatores: FatorDaPrioridade[] = [];
  const somar = (texto: string, pontos: number) => fatores.push({ texto, pontos });

  if (procurouOAltar(f)) somar("Procurou a ALTAR", PESOS.procurouOAltar);
  if (f.intent === "demo") somar("Pediu demonstração", PESOS.pediuDemonstracao);
  else if (f.intent === "beta") somar("Pediu acesso ao beta", PESOS.pediuBeta);

  const doEstagio = PESO_DO_ESTAGIO[estagio];
  if (doEstagio) somar(`Etapa: ${definicaoDoEstagio(estagio).rotulo}`, doEstagio);

  if (f.ultimaIntencao && INTENCOES_DE_INTERESSE.has(f.ultimaIntencao)) {
    somar("Respondeu com interesse", PESOS.respostaDeInteresse);
  } else if (f.ultimaIntencao === "duvida_preco" || f.ultimaIntencao === "duvida_funcionalidade") {
    somar("Respondeu com uma dúvida", PESOS.respostaComDuvida);
  }

  if (f.whatsappE164?.trim()) somar("WhatsApp informado", PESOS.whatsapp);
  if (f.empresa?.trim()) somar("Empresa identificada", PESOS.empresa);
  if (typeof f.eventosPorAno === "number" && f.eventosPorAno >= EVENTOS_POR_ANO_DE_PORTE) {
    somar(`${f.eventosPorAno} eventos por ano`, PESOS.porteGrande);
  }

  // Parado conta só quando há data: sem `ultimaInteracao` não se sabe, e não
  // saber não é o mesmo que estar parado.
  const parado = f.ultimaInteracao ? diasEntre(f.ultimaInteracao, hojeISO) : undefined;
  if (parado !== undefined && parado > 30) somar(`Sem contato há ${parado} dias`, PESOS.paradoUmMes);
  else if (parado !== undefined && parado > 14) {
    somar(`Sem contato há ${parado} dias`, PESOS.paradoDuasSemanas);
  }

  const bruto = fatores.reduce((s, x) => s + x.pontos, 0);
  const pontos = Math.max(0, Math.min(100, bruto));
  return {
    pontos,
    temperatura: pontos >= 60 ? "quente" : pontos >= 30 ? "morna" : "fria",
    fatores: fatores.sort((a, b) => b.pontos - a.pontos),
  };
}
