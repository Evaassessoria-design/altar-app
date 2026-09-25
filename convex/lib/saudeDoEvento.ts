import { responsavelDoEvento } from "./responsavel";

// ─────────────────────────────────────────────────────────────────────────────
// A SAÚDE DE UM EVENTO — A CONTA, SEPARADA DA LEITURA DO BANCO
//
// ── POR QUE ESTE MÓDULO NASCEU ──────────────────────────────────────────────
// `computeHealth` fazia as duas coisas: lia o banco E pontuava. Isso obrigava
// a lista de eventos a ler o banco UMA VEZ POR EVENTO.
//
// A conta em números reais, com a decoradora piloto: 40 eventos × (6 consultas
// + um `db.get` por pessoa escalada) = cerca de 360 operações de banco para
// desenhar UMA tela. A tela de Eventos é a primeira que ela abre, e a primeira
// que se mostra numa demonstração. A 300 eventos seriam mais de 2.500.
//
// Pior: a lista pedia `attention` — o laço que percorre fornecedor por
// fornecedor montando avisos — e jogava fora. O cartão só usa percentual,
// situação, convidados, assessoria e responsável.
//
// Com a conta aqui, quem lê o banco decide COMO ler: a tela de um evento lê um
// evento; a lista lê tudo de uma vez, por usuário, e agrupa em memória. As
// duas chamam esta função, então não existe "a saúde da lista" diferente da
// "saúde do evento" — que é o defeito clássico de duplicar a regra.
//
// ── ESTE MÓDULO NÃO CONHECE O CONVEX ────────────────────────────────────────
// Sem `ctx`, sem `db`, sem `Doc`. Recebe o que já foi lido e devolve a
// pontuação. É o que permite testá-lo sem banco.
// ─────────────────────────────────────────────────────────────────────────────

export type ChecagemDeSaude = { key: string; label: string; ok: boolean };

export type SaudeDoEvento = {
  percent: number;
  status: "complete" | "attention" | "incomplete";
  checks: ChecagemDeSaude[];
  attention: string[];
  guestCount?: string;
  assessoria?: string;
  responsible?: string;
  /** Telefone do responsável, quando ele é membro da equipe com telefone. */
  responsiblePhone?: string;
};

/** Só o que a conta lê de cada linha — nunca o documento inteiro. */
export type DadosDaSaude = {
  evento: {
    name?: string;
    date?: string;
    location?: string;
    clientName?: string;
    responsibleId?: string;
    responsible?: string;
    contractPendings?: readonly string[];
  };
  /** Documentos do evento. O contrato da CLIENTE é o sem fornecedor. */
  documentos: readonly { kind?: string; supplierId?: string }[];
  temLancamento: boolean;
  fornecedores: readonly {
    companyName: string;
    category?: string;
    contactName?: string;
    status?: string;
    alignments?: readonly unknown[];
  }[];
  /** Pessoas escaladas, JÁ resolvidas por quem leu o banco. */
  equipe: readonly { _id: string; name: string; role: string; phone?: string }[];
  guestCount?: string;
  temItensDeMontagem: boolean;
};

/**
 * Quantos avisos cabem no cartão antes de virar parede de texto.
 *
 * Um evento com vinte fornecedores incompletos gera sessenta linhas de aviso.
 * Doze é o que uma pessoa lê; o resto ela descobre abrindo o evento.
 */
const TETO_DE_AVISOS = 12;

export function saudeDoEvento(dados: DadosDaSaude): SaudeDoEvento {
  const { evento } = dados;

  // O contrato da CLIENTE, não o de um fornecedor: desde que o documento pode
  // pertencer a um fornecedor (`contracts.supplierId`), `kind: "contract"`
  // deixou de identificar um documento só. Mesma regra de `getContract`.
  const contrato = dados.documentos.find(
    (d) => (d.kind ?? "contract") === "contract" && !d.supplierId,
  );

  const checks: ChecagemDeSaude[] = [
    {
      key: "evento",
      label: "Dados do evento",
      ok: !!(evento.name && evento.date && evento.location && evento.clientName),
    },
    { key: "contrato", label: "Contrato anexado", ok: !!contrato },
    { key: "financeiro", label: "Financeiro", ok: dados.temLancamento },
    { key: "fornecedores", label: "Fornecedores", ok: dados.fornecedores.length > 0 },
    { key: "montagem", label: "Montagem planejada", ok: dados.temItensDeMontagem },
    { key: "responsavel", label: "Responsável definido", ok: dados.equipe.length > 0 },
    { key: "briefing", label: "Convidados (briefing)", ok: !!dados.guestCount?.trim() },
  ];

  // Pontos de atenção — apenas ausências objetivas (nada presumido/inventado).
  const attention: string[] = [];
  if (!contrato) attention.push("Contrato ainda não anexado");
  if (dados.equipe.length === 0) attention.push("Responsável do evento não definido");
  if (dados.fornecedores.length === 0) attention.push("Nenhum fornecedor cadastrado");
  for (const s of dados.fornecedores) {
    if (!s.contactName) attention.push(`Fornecedor sem responsável: ${s.companyName}`);
    if (!s.status) attention.push(`Fornecedor sem status: ${s.companyName}`);
    if (!(s.alignments && s.alignments.length > 0)) {
      attention.push(`Fornecedor sem alinhamento: ${s.companyName}`);
    }
  }
  for (const p of evento.contractPendings ?? []) attention.push(p);

  const passed = checks.filter((c) => c.ok).length;
  const percent = Math.round((passed / checks.length) * 100);
  const status = percent >= 80 ? "complete" : percent >= 50 ? "attention" : "incomplete";

  // A regra de QUEM responde pelo evento prefere não dizer nada a eleger
  // alguém: escolha explícita > anotação > única pessoa escalada. Ver
  // lib/responsavel.ts.
  const responsavel = responsavelDoEvento(
    { responsibleId: evento.responsibleId, responsible: evento.responsible },
    dados.equipe.map((m) => ({ _id: m._id, name: m.name, role: m.role })),
  );
  // O TELEFONE vem do vínculo, não de casar o nome com a lista de escalados:
  // casar por nome errava com duas "Camila" e falhava sempre que o responsável
  // era uma anotação livre.
  const responsiblePhone = responsavel?.membroId
    ? dados.equipe.find((m) => m._id === responsavel.membroId)?.phone
    : undefined;

  return {
    percent,
    status,
    checks,
    attention: attention.slice(0, TETO_DE_AVISOS),
    guestCount: dados.guestCount ?? undefined,
    assessoria: dados.fornecedores.find((s) => s.category === "assessoria")?.companyName,
    responsible: responsavel?.nome,
    responsiblePhone,
  };
}
