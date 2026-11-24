// ─────────────────────────────────────────────────────────────────────────────
// AS TELAS DE DENTRO DE UM EVENTO
//
// ── O PROBLEMA ──────────────────────────────────────────────────────────────
// O evento tem catorze telas internas, e até aqui só duas delas (ficha técnica
// e projeto visual) sabiam levar às irmãs. As outras doze só sabiam voltar
// para a capa. O caminho real do dia era:
//
//     capa → briefing → voltar → capa → ficha → voltar → capa → compras…
//
// Numa manhã em que ela passa por briefing, ficha, pagamentos e reuniões, são
// cerca de dez toques e cinco carregamentos a mais só para ANDAR — e cada
// carregamento é a tela inteira sumindo e voltando, no 4G do sítio.
//
// ── POR QUE UMA LISTA, FORA DO COMPONENTE ───────────────────────────────────
// Mesma razão de `navigation.ts`: lista fora do componente pode ser conferida
// por teste. Uma rota registrada em `App.tsx` que não apareça aqui é uma tela
// órfã — alcançável só digitando a URL —, e uma entrada aqui sem rota é um
// atalho que leva a lugar nenhum. `telas-do-evento.test.ts` confere os dois
// sentidos, e também que nenhuma ETAPA DA JORNADA ficou sem tela na barra.
//
// ── A LISTA NÃO É A JORNADA ─────────────────────────────────────────────────
// A Jornada (`convex/lib/jornadaDoEvento.ts`) responde "em que pé está o
// projeto" e tem onze etapas, duas delas sem tela própria: contrato vive na
// capa, e croqui e planta premium são a MESMA tela. Esta lista responde outra
// pergunta — "para onde eu posso ir daqui" — e por isso inclui as telas de
// trabalho que não são etapa de projeto nenhuma: reuniões, pagamentos,
// carregamento e conferência.
//
// Forçar as duas a serem a mesma estrutura obrigaria a Jornada a inventar
// etapa para "pagamentos" ou a barra a esconder metade das telas.
// ─────────────────────────────────────────────────────────────────────────────

export type TelaDoEvento = {
  /** Sufixo da rota, depois de `/eventos/:id/`. */
  rota: string;
  /** Rótulo curto — é uma pastilha, não um título de página. */
  rotulo: string;
  /**
   * `projeto`  — o que ela constrói para a cliente, na ordem da Jornada.
   * `trabalho` — o que acontece em volta: dinheiro, combinados e galpão.
   *
   * Os dois grupos aparecem separados na barra. Misturados, "Pagamentos"
   * entraria no meio do caminho visual do projeto.
   */
  grupo: "projeto" | "trabalho";
};

/**
 * Ordem = ordem do trabalho, igual à Jornada da capa, e depois as telas de
 * trabalho. Os rótulos são os que o produto JÁ usa nas telas e na capa
 * ("Carregamento", "Conferência") — barra que renomeia o que a capa chama de
 * outro jeito faz a pessoa procurar duas vezes.
 */
export const TELAS_DO_EVENTO = [
  { rota: "briefing", rotulo: "Briefing", grupo: "projeto" },
  { rota: "orcamento", rotulo: "Orçamento", grupo: "projeto" },
  { rota: "fotos", rotulo: "Inspirações", grupo: "projeto" },
  { rota: "fornecedores", rotulo: "Fornecedores", grupo: "projeto" },
  { rota: "ficha-tecnica", rotulo: "Ficha técnica", grupo: "projeto" },
  { rota: "producao-floral", rotulo: "Produção floral", grupo: "projeto" },
  { rota: "acervo", rotulo: "Acervo", grupo: "projeto" },
  { rota: "projeto", rotulo: "Projeto visual", grupo: "projeto" },
  { rota: "layout", rotulo: "Layout do salão", grupo: "projeto" },
  // Croqui e Planta Premium são duas etapas da Jornada e UMA tela só.
  { rota: "planta", rotulo: "Planta", grupo: "projeto" },
  { rota: "reunioes", rotulo: "Reuniões", grupo: "trabalho" },
  { rota: "pagamentos", rotulo: "Pagamentos", grupo: "trabalho" },
  // A rota do checklist leva a fase no caminho; `pre` e `post` são telas
  // diferentes para quem usa — carregar o caminhão e conferir a volta.
  { rota: "checklist/pre", rotulo: "Carregamento", grupo: "trabalho" },
  { rota: "checklist/post", rotulo: "Conferência", grupo: "trabalho" },
] as const satisfies readonly TelaDoEvento[];

/**
 * O id do evento quando o caminho é de DENTRO de um evento, e `null` quando
 * não é.
 *
 * A capa (`/eventos/:id`) responde `null` de propósito: ela já tem a Jornada
 * inteira desenhada, com estado e detalhe de cada etapa. Repetir a barra ali
 * seria dizer duas vezes a mesma coisa, uma delas pior.
 *
 * A lista de eventos (`/eventos`) também responde `null`: não há evento ainda.
 */
export function eventoDoCaminho(caminho: string): { id: string; rota: string } | null {
  // `/eventos/abc123/checklist/pre` → ["eventos", "abc123", "checklist", "pre"]
  const partes = caminho.split("/").filter(Boolean);
  if (partes[0] !== "eventos") return null;
  const id = partes[1];
  if (!id) return null;
  const rota = partes.slice(2).join("/");
  if (!rota) return null;
  return { id, rota };
}

/** A tela aberta, quando o caminho é uma das conhecidas. */
export function telaAberta(rota: string): TelaDoEvento | undefined {
  return TELAS_DO_EVENTO.find((t) => t.rota === rota);
}
