import { normalizeName } from "./materiais";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A CLIENTE VÊ DA FICHA TÉCNICA — E SÓ ISSO
//
// ── O PROBLEMA ──────────────────────────────────────────────────────────────
// A decoradora escreve "Rosa, Lisianthus, Boca-de-leão, Eucalipto". Para quem
// não trabalha com flor isso é uma lista de palavras: a noiva não sabe o que é
// lisianthus, e a decisão que ela precisa tomar é VISUAL. A saída era mandar
// fotos por WhatsApp ou montar um quadro no Canva — trabalho refeito a cada
// casamento, com a informação já cadastrada aqui dentro.
//
// ── POR QUE UMA TRANSFORMAÇÃO, E NÃO UM FILTRO DE TELA ──────────────────────
// A linha consolidada da Ficha Técnica carrega `custoEstimado`,
// `margemPercentual`, `cobertura`, `comprasVinculadas` e `origens` — custo,
// margem e fornecedor. É exatamente a fronteira que `propostaComercial.ts`
// sustenta para a proposta, e pela mesma razão: o que sai para a cliente é
// CONSTRUÍDO campo a campo, nunca espalhado do registro.
//
// Uma tela que esconde continua mandando o custo pela rede, e a primeira
// pessoa que abrir o inspetor — ou o primeiro `...linha` distraído numa rodada
// futura — publica a margem da empresa. Aqui o custo não chega a existir no
// objeto que sai.
//
// ── O QUE FICA DE FORA, DE PROPÓSITO ────────────────────────────────────────
// QUANTIDADE. "185 hastes" é número de COMPRA: carrega a margem de segurança
// (flor quebra no transporte) e muda quando a ficha muda. Impresso para a
// cliente vira promessa contratual sobre um número que existe para proteger a
// execução, não para ser cumprido à risca.
//
// Materiais de item classificado como `referencia` ou `nao_incluso` também não
// entram — mas isso já foi decidido antes, por `ehObrigacaoDeMontagem`, na
// consolidação. Este módulo não reabre a questão.
// ─────────────────────────────────────────────────────────────────────────────

/** O que a Ficha Técnica consolidada oferece — só os campos que este módulo lê. */
export type LinhaParaOProjeto = {
  materialId?: string;
  nome: string;
  categoria?: string;
};

/** O que a cliente vê. Não há mais nada nesta forma, e isso é a proteção. */
export type MaterialDoProjeto = {
  nome: string;
  /** "Flores", "Tecidos". Ausente = material sem categoria no catálogo. */
  categoria?: string;
  /** A foto do CATÁLOGO. `null` = ainda não enviada; a tela desenha o nome. */
  fotoUrl: string | null;
};

/**
 * A lista visual do projeto, a partir das linhas consolidadas.
 *
 * ── UMA FLOR, UMA ENTRADA ───────────────────────────────────────────────────
 * A ficha separa "rosa em haste" de "rosa em maço" porque são preços
 * diferentes e não podem ser somados. Para a cliente é a MESMA flor, e duas
 * fileiras com a mesma foto e o mesmo nome pareceriam erro. A junção é pelo
 * nome normalizado — a mesma chave que o catálogo já usa para deduplicar.
 *
 * A primeira ocorrência manda no rótulo: o texto exibido é sempre o que ela
 * escreveu, e a normalização serve só para descobrir que são a mesma coisa.
 *
 * ── A ORDEM ─────────────────────────────────────────────────────────────────
 * Alfabética, em português. Não é "as com foto primeiro": isso faria a lista
 * se reorganizar sozinha a cada foto enviada, e a cliente que recebeu o
 * projeto na terça leria outra ordem na quinta.
 */
export function materiaisDoProjeto(
  linhas: readonly LinhaParaOProjeto[],
  fotoDoMaterial: (materialId: string) => string | null,
): MaterialDoProjeto[] {
  const porNome = new Map<string, MaterialDoProjeto>();

  for (const linha of linhas) {
    const nome = linha.nome.trim();
    // Linha sem nome não vira quadro vazio na apresentação da cliente.
    if (!nome) continue;

    const chave = normalizeName(nome);
    const foto = linha.materialId ? fotoDoMaterial(linha.materialId) : null;
    const existente = porNome.get(chave);

    if (!existente) {
      // Campo a campo. Um `...linha` aqui publicaria custo e margem.
      porNome.set(chave, {
        nome,
        categoria: linha.categoria?.trim() || undefined,
        fotoUrl: foto,
      });
      continue;
    }

    // Duas unidades da mesma flor, e só uma delas vinculada ao catálogo com
    // foto: a foto vale para as duas. Quem chegou primeiro não pode fazer a
    // imagem sumir.
    if (!existente.fotoUrl && foto) existente.fotoUrl = foto;
    if (!existente.categoria && linha.categoria?.trim()) {
      existente.categoria = linha.categoria.trim();
    }
  }

  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
