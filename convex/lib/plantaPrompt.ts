// ─────────────────────────────────────────────────────────────────────────────
// Metodologia "Designer de Plantas para Casamentos" aplicada ao ALTAR.
//
// Isolado num módulo próprio porque o prompt é PARTE DO DADO: cada geração
// grava `promptVersion` + `promptSnapshot` no histórico, para sabermos
// exatamente com quais instruções cada planta foi produzida. Ao evoluir as
// instruções, suba PROMPT_VERSION — as versões antigas continuam auditáveis.
//
// REGRA ABSOLUTA: estética pode mudar, projeto não.
// ─────────────────────────────────────────────────────────────────────────────

export const PROMPT_VERSION = "planta-premium-v1";

export type LayoutElement = {
  tipo: string;
  quantidade: number;
  observacao?: string;
};

export type LayoutInterpretation = {
  ambientes: string[];
  elementos: LayoutElement[];
  circulacao?: string;
  acessos?: string;
  observacoes?: string;
};

// ── Etapa 1: leitura do croqui ───────────────────────────────────────────────

export const INTERPRETATION_SYSTEM_PROMPT = `Você lê croquis e plantas de layout de eventos (casamentos, festas e eventos corporativos) no Brasil.

Sua tarefa é APENAS DESCREVER o que existe no desenho. Você é um leitor, não um projetista.

CONTAGEM — a parte mais importante:
- Conte cada elemento repetitivo que conseguir identificar: mesas, cadeiras, lounges, etc.
- Conte o que está desenhado. Não arredonde, não estime, não complete.
- Se houver 12 mesas, escreva 12. Se houver 118 cadeiras, escreva 118 — nunca "cerca de 120".
- Se não conseguir contar com confiança, use quantidade 0 e explique na observação.

O QUE IDENTIFICAR (somente quando visível no desenho):
ambientes/salões, mesas (e tipo: redonda, retangular, imperial), cadeiras, palco,
bar, pista de dança, lounge, buffet, altar/cerimônia, entradas e acessos,
circulação, estruturas (tendas, painéis, arcos, passarelas).

REGRAS:
- NÃO invente elementos que não estão no croqui.
- NÃO sugira melhorias, mudanças ou otimizações de layout.
- NÃO opine sobre o projeto.
- Se algo estiver ambíguo, registre em "observacoes" em vez de adivinhar.

Responda SOMENTE com JSON válido, sem texto ao redor, neste formato:
{
  "ambientes": ["Salão principal"],
  "elementos": [
    { "tipo": "mesa redonda", "quantidade": 12, "observacao": "8 lugares cada" },
    { "tipo": "cadeira", "quantidade": 96 },
    { "tipo": "pista de dança", "quantidade": 1 }
  ],
  "circulacao": "corredor central ligando entrada e pista",
  "acessos": "entrada principal ao sul, acesso de serviço a leste",
  "observacoes": "canto superior direito ilegível"
}`;

// ── Etapa 2: geração da planta premium ───────────────────────────────────────

const ABSOLUTE_RULES = `REGRAS ABSOLUTAS — CUMPRIMENTO OBRIGATÓRIO:

Você NÃO está criando um projeto novo. Você está REDESENHANDO VISUALMENTE um
projeto que já existe, com acabamento profissional. O layout é decisão de outra
pessoa e já foi tomado.

É PROIBIDO:
- mover mesas, cadeiras, palco, bar, pista, lounge ou qualquer elemento;
- alterar a posição, a rotação ou o espaçamento de qualquer elemento;
- criar mesas, cadeiras, bares, ambientes ou estruturas que não existem;
- remover ou omitir qualquer elemento presente no croqui;
- alterar a quantidade de mesas ou de cadeiras;
- alterar dimensões, proporções, geometria ou formato do espaço;
- alterar circulação, corredores, entradas ou acessos;
- reinterpretar, "melhorar", otimizar ou reorganizar o projeto;
- mudar a ocupação do espaço.

Reconhecer um elemento NÃO dá liberdade para modificá-lo. Reconhecer serve
apenas para desenhá-lo bonito NO MESMO LUGAR.

O QUE VOCÊ DEVE FAZER:
Substituir os símbolos simples do croqui por representação visual premium, na
mesma posição, na mesma escala e na mesma quantidade. Um retângulo vira uma mesa
bem desenhada — no lugar exato onde o retângulo estava.

ESTÉTICA PODE MUDAR. PROJETO NÃO.`;

const VISUAL_DIRECTION = `DIREÇÃO VISUAL — planta baixa 2D de decoração de casamento de alto padrão:
- vista superior (planta baixa), traço limpo e preciso;
- estética editorial, elegante e sofisticada;
- paleta neutra e refinada (off-white, areia, greige, verde-sálvia, dourado suave);
- mobiliário desenhado com detalhe: tampos, cadeiras individuais visíveis, lounges estofados;
- texturas realistas e sutis em tecidos, madeira e vegetação;
- arranjos florais e vegetação apenas onde já existirem no croqui;
- iluminação delicada sugerida por sombras suaves;
- tipografia serifada elegante nos rótulos dos ambientes;
- acabamento profissional, organizado, sem ruído visual, sem marca d'água.`;

function formatElements(elements: LayoutElement[]): string {
  const listed = elements.filter((e) => e.tipo.trim());
  if (listed.length === 0) return "(nenhum elemento contabilizado)";
  return listed
    .map((e) => {
      const obs = e.observacao?.trim() ? ` — ${e.observacao.trim()}` : "";
      return `- ${e.tipo}: EXATAMENTE ${e.quantidade}${obs}`;
    })
    .join("\n");
}

/**
 * Monta o prompt final da geração. Recebe a interpretação JÁ CONFIRMADA pela
 * decoradora (com as correções dela aplicadas) — nunca a leitura crua da IA.
 */
export function buildPremiumPlanPrompt(
  interpretation: LayoutInterpretation,
  corrections?: string,
): string {
  const blocks: string[] = [
    "Redesenhe a planta baixa em anexo com acabamento profissional premium, preservando integralmente o projeto original.",
    ABSOLUTE_RULES,
    VISUAL_DIRECTION,
  ];

  const inventory: string[] = [];
  if (interpretation.ambientes.length > 0) {
    inventory.push(`Ambientes: ${interpretation.ambientes.join(", ")}`);
  }
  inventory.push(
    `Inventário conferido pela decoradora — estas quantidades são obrigatórias e devem aparecer no resultado:\n${formatElements(interpretation.elementos)}`,
  );
  if (interpretation.circulacao?.trim()) {
    inventory.push(`Circulação (preservar como está): ${interpretation.circulacao.trim()}`);
  }
  if (interpretation.acessos?.trim()) {
    inventory.push(`Acessos (preservar como estão): ${interpretation.acessos.trim()}`);
  }
  if (interpretation.observacoes?.trim()) {
    inventory.push(`Observações do croqui: ${interpretation.observacoes.trim()}`);
  }
  blocks.push(inventory.join("\n\n"));

  if (corrections?.trim()) {
    blocks.push(
      `CORREÇÕES DA DECORADORA — têm prioridade sobre a leitura automática:\n${corrections.trim()}`,
    );
  }

  blocks.push(
    "Confira a contagem antes de finalizar: o número de cada elemento no resultado deve bater exatamente com o inventário acima. Mantenha cada elemento na posição em que aparece na imagem de referência.",
  );

  return blocks.join("\n\n---\n\n");
}
