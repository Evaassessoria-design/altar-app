// ─────────────────────────────────────────────────────────────────────────────
// POSSÍVEL DUPLICIDADE — APONTAR, NUNCA FUNDIR
//
// ── POR QUE O SISTEMA NÃO FUNDE SOZINHO ─────────────────────────────────────
// Fundir dois registros é destrutivo e não tem volta: some um id, somem as
// observações de quem conversou, some o histórico de etapas de um dos dois.
//
// E o palpite erra. "Ana Silva" e "Ana Silva" podem ser duas decoradoras
// diferentes na mesma cidade. Telefone de escritório compartilhado por duas
// sócias é o mesmo número e duas pessoas. E-mail de contato@ateliê é a
// empresa, não a dona.
//
// Por isso aqui só existe SINAL. Uma pessoa olha os dois lados e decide — e é
// a mesma disciplina de `customerVoiceSignals`, onde a IA sugere e o merge é
// humano, pelo mesmo motivo.
//
// ── OS SINAIS NÃO VALEM O MESMO ─────────────────────────────────────────────
// Telefone igual é quase certeza; e-mail igual é forte; nome igual sozinho é
// fraco e existe só para não deixar passar o caso em que a pessoa se cadastrou
// duas vezes com contatos diferentes. Misturar os três num "é duplicado"
// binário faria a lista encher de homônimo e ninguém olharia mais nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

export type RegistroComparavel = {
  _id: string;
  name: string;
  email?: string;
  /** Telefone JÁ normalizado em E.164. Cru não serve para comparar. */
  whatsappE164?: string;
  empresa?: string;
};

export type ForcaDaSuspeita = "alta" | "media" | "baixa";

export type Suspeita = {
  /** Os dois ids, sempre na mesma ordem — evita o par aparecer duas vezes. */
  ids: [string, string];
  nomes: [string, string];
  forca: ForcaDaSuspeita;
  /** O que bateu, em português. A pessoa decide olhando isto. */
  motivo: string;
};

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizarEmail(email: string | undefined): string | undefined {
  const limpo = email?.trim().toLowerCase();
  return limpo && limpo.includes("@") ? limpo : undefined;
}

/** Teto de pares apontados. Uma lista maior do que isto ninguém revisa. */
export const LIMITE_DE_SUSPEITAS = 50;

/**
 * Os pares que MERECEM uma olhada humana.
 *
 * ── O CUSTO É LINEAR, NÃO QUADRÁTICO ───────────────────────────────────────
 * Comparar todo mundo com todo mundo é O(n²): com três mil interessados são
 * quatro milhões e meio de comparações a cada abertura de tela.
 *
 * Aqui os registros são AGRUPADOS por chave (telefone, e-mail, nome) num passo
 * só, e suspeita é um grupo com mais de um membro. O custo cresce com o número
 * de registros, não com o quadrado dele.
 */
export function possiveisDuplicados(
  registros: readonly RegistroComparavel[],
): Suspeita[] {
  const porChave = new Map<string, { chave: string; forca: ForcaDaSuspeita; itens: RegistroComparavel[] }>();

  const agrupar = (chave: string, forca: ForcaDaSuspeita, r: RegistroComparavel) => {
    const atual = porChave.get(chave);
    if (atual) atual.itens.push(r);
    else porChave.set(chave, { chave, forca, itens: [r] });
  };

  for (const r of registros) {
    if (r.whatsappE164) agrupar(`tel:${r.whatsappE164}`, "alta", r);
    const email = normalizarEmail(r.email);
    if (email) agrupar(`mail:${email}`, "media", r);
    const nome = normalizarNome(r.name);
    // Nome de uma palavra ("Ana", "Estúdio") casa com meio mundo. Abaixo de
    // duas palavras o sinal não é sinal, é ruído.
    if (nome.includes(" ")) agrupar(`nome:${nome}`, "baixa", r);
  }

  const vistos = new Set<string>();
  const suspeitas: Suspeita[] = [];
  const peso: Record<ForcaDaSuspeita, number> = { alta: 0, media: 1, baixa: 2 };

  // ── A ORDEM DE VARREDURA É EXPLÍCITA, E PRECISA SER ─────────────────────
  // O par só é registrado uma vez, pelo PRIMEIRO grupo que o encontra. Confiar
  // na ordem de inserção do Map parecia funcionar e não funciona: as chaves de
  // registros diferentes se intercalam, e um par que bate por telefone E por
  // nome pode ser achado primeiro pelo grupo de nome — entrando como suspeita
  // "baixa" quando é quase certeza, e indo para o fim de uma lista que ninguém
  // lê até o fim.
  const grupos = [...porChave.values()].sort((a, b) => peso[a.forca] - peso[b.forca]);

  for (const grupo of grupos) {
    if (grupo.itens.length < 2) continue;
    for (let i = 0; i < grupo.itens.length; i++) {
      for (let j = i + 1; j < grupo.itens.length; j++) {
        const a = grupo.itens[i];
        const b = grupo.itens[j];
        // A ordem fixa impede o mesmo par de aparecer duas vezes quando ele
        // bate por dois motivos — e o par forte é o que fica, porque os
        // grupos são percorridos do mais forte para o mais fraco.
        const par: [string, string] = a._id < b._id ? [a._id, b._id] : [b._id, a._id];
        const chaveDoPar = par.join("|");
        if (vistos.has(chaveDoPar)) continue;
        vistos.add(chaveDoPar);

        suspeitas.push({
          ids: par,
          nomes: a._id < b._id ? [a.name, b.name] : [b.name, a.name],
          forca: grupo.forca,
          motivo:
            grupo.forca === "alta"
              ? "Mesmo telefone"
              : grupo.forca === "media"
                ? "Mesmo e-mail"
                : "Mesmo nome, contatos diferentes",
        });
      }
    }
  }

  // Já saem ordenados pela varredura; o teto corta o rabo fraco da lista.
  return suspeitas.slice(0, LIMITE_DE_SUSPEITAS);
}
