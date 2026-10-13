import type { BriefingFields } from "../briefing-areas.ts";
import type { FotoDoProjeto } from "../projeto-visual.ts";
import type { FontesDoCaderno, ItemDoCaderno, PecaReservada } from "./montar-caderno.ts";

// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VEM CADA PEDAÇO DO CADERNO
//
// Nada aqui é cadastro novo. Cada fonte é uma consulta que já existia, e cada
// uma já confere o dono do evento no servidor (`getOwnedEvent`) — o caderno
// de outra conta chega VAZIO, nunca com dado alheio:
//
//   evento ............ events.get                (nome, tipo, data, local, pendências do contrato)
//   briefing .......... briefing.getBriefing      (estilo, ambientes, itens em texto, local)
//   itens ............. assemblyItems.listByEvent (itens, escopo, fotos resolvidas, opcional)
//   fotos ............. gallery.listPhotos        (ambiente, legenda, escopo, visibilidade)
//   planta ............ layoutRenders.listByEvent (planta pronta; senão o croqui enviado)
//   acervo ............ acervo.doEvento           (reservado, saiu, voltou, condição)
//   equipe ............ team.listEventTeam        (escala do evento)
//   checklist ......... briefing.getChecklist     (fase "pre" — o que já existe)
//   convidados/resp. .. health.getEventHealth
//
// As fotos não são copiadas: o caderno guarda a URL, e o PDF baixa cada
// arquivo uma vez (`carregarImagensDoCaderno`).
// ─────────────────────────────────────────────────────────────────────────────

type Evento = {
  name: string;
  type: string;
  date: string;
  location?: string;
  contractPendings?: string[];
};

type Planta = {
  status: string;
  outputUrl?: string | null;
  sketchUrl?: string | null;
  originalSketchFilename?: string;
};

type Reserva = {
  quantidade: number;
  saiu?: number;
  voltou?: number;
  item: {
    nome: string;
    unidade?: string;
    emManutencao?: number;
    emLimpeza?: number;
    indisponivel?: number;
  } | null;
};

type Escala = {
  scheduledTime?: string;
  member: { name: string; role?: string } | null;
};

export type ConsultasDoCaderno = {
  evento: Evento;
  briefing?: Partial<BriefingFields> | null;
  itens?: readonly unknown[] | null;
  fotos?: readonly unknown[] | null;
  plantas?: readonly Planta[] | null;
  acervo?: { reservas: readonly Reserva[] } | null;
  equipe?: readonly Escala[] | null;
  checklist?: readonly { name: string; quantity?: number; unit?: string; category?: string }[] | null;
  saude?: { guestCount?: string; responsible?: string; responsiblePhone?: string } | null;
};

/**
 * A planta que vai para o papel: a pronta (gerada a partir do croqui) vence;
 * sem ela, o próprio croqui que ela enviou — desde que seja imagem. Croqui em
 * PDF não se desenha dentro de outro PDF, e um quadro vazio não ajuda.
 */
export function plantaDoCaderno(plantas: readonly Planta[] | null | undefined): FontesDoCaderno["planta"] {
  const lista = plantas ?? [];
  const pronta = lista.find((r) => r.status === "done" && r.outputUrl);
  if (pronta?.outputUrl) return { url: pronta.outputUrl, origem: "planta" };
  const croqui = lista.find(
    (r) => r.sketchUrl && !/\.pdf$/i.test(r.originalSketchFilename ?? ""),
  );
  return croqui?.sketchUrl ? { url: croqui.sketchUrl, origem: "croqui" } : null;
}

export function fontesDoCaderno(c: ConsultasDoCaderno): FontesDoCaderno {
  const acervo: PecaReservada[] = (c.acervo?.reservas ?? [])
    .filter((r) => r.item)
    .map((r) => ({
      nome: r.item!.nome,
      unidade: r.item!.unidade,
      quantidade: r.quantidade,
      saiu: r.saiu,
      voltou: r.voltou,
      emManutencao: r.item!.emManutencao,
      emLimpeza: r.item!.emLimpeza,
      indisponivel: r.item!.indisponivel,
    }));
  return {
    evento: {
      name: c.evento.name,
      type: c.evento.type,
      date: c.evento.date,
      location: c.evento.location,
      contractPendings: c.evento.contractPendings,
    },
    briefing: c.briefing ?? null,
    itens: (c.itens ?? []) as ItemDoCaderno[],
    fotos: (c.fotos ?? []) as FotoDoProjeto[],
    planta: plantaDoCaderno(c.plantas),
    acervo,
    equipe: (c.equipe ?? [])
      .filter((e) => e.member)
      .map((e) => ({ nome: e.member!.name, funcao: e.member!.role, horario: e.scheduledTime })),
    checklist: c.checklist ?? [],
    convidados: c.saude?.guestCount,
    responsavel: c.saude?.responsible,
    responsavelTelefone: c.saude?.responsiblePhone,
  };
}
