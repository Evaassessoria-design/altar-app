import { normalizarE164 } from "./central/telefone";

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR UMA LISTA DE INTERESSADOS
//
// ── PARA QUE ISTO EXISTE ────────────────────────────────────────────────────
// Uma live traz nomes de vários lugares: a inscrição, o chat, o direct, a
// lista que alguém montou à mão. Sem importação, cada um desses vira digitação
// — e cem pessoas digitadas uma a uma é a planilha voltando pela porta dos
// fundos.
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não coleta nada. Não acessa Instagram, não varre site, não raspa lista de
// fornecedor. Ele LÊ um arquivo que uma pessoa já tem e o transforma em
// linhas. De onde veio o arquivo é responsabilidade de quem o trouxe.
//
// ── PREVIEW ANTES DE GRAVAR ─────────────────────────────────────────────────
// A leitura devolve o que VAI acontecer com cada linha, e não grava nada. Uma
// importação que escreve primeiro e mostra o resultado depois transforma um
// arquivo errado em duzentos registros errados — e limpar isso à mão é pior do
// que ter digitado tudo.
// ─────────────────────────────────────────────────────────────────────────────

/** As colunas que a importação entende, e os nomes aceitos para cada uma. */
const COLUNAS: Record<string, readonly string[]> = {
  name: ["nome", "name", "contato", "responsavel", "responsável"],
  empresa: ["empresa", "estudio", "estúdio", "negocio", "negócio", "company"],
  whatsapp: ["telefone", "whatsapp", "celular", "fone", "phone"],
  email: ["email", "e-mail", "mail"],
  instagram: ["instagram", "insta", "@"],
  cidade: ["cidade", "city"],
  estado: ["estado", "uf", "state"],
  site: ["site", "website", "url"],
  segmento: ["segmento", "nicho", "especialidade"],
  origem: ["origem", "fonte", "source"],
};

/** Normaliza o cabeçalho para comparar: sem acento, sem espaço, minúsculo. */
function chaveDaColuna(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * O separador do arquivo.
 *
 * Planilha brasileira exporta com PONTO E VÍRGULA, porque a vírgula já é o
 * separador decimal. Supor vírgula faria todo arquivo vindo do Excel em
 * português virar uma coluna só — e o erro apareceria como "nenhum nome
 * encontrado", que não ajuda ninguém a entender o que houve.
 */
export function detectarSeparador(primeiraLinha: string): "," | ";" | "\t" {
  const conta = (c: string) => primeiraLinha.split(c).length - 1;
  const tabs = conta("\t");
  const pontoEVirgula = conta(";");
  const virgulas = conta(",");
  if (tabs > pontoEVirgula && tabs > virgulas) return "\t";
  return pontoEVirgula >= virgulas ? ";" : ",";
}

/**
 * Divide uma linha respeitando aspas.
 *
 * `"Silva, Maria";11999` são DUAS colunas, não três. Sem isto, todo nome com
 * vírgula dentro empurra o resto da linha uma coluna para a direita, e o
 * telefone de uma pessoa vira o e-mail de outra.
 */
export function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      // `""` dentro de aspas é uma aspa literal — a convenção do formato.
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

export type LinhaLida = {
  /** A linha no arquivo, contando o cabeçalho — é o que a pessoa vê no Excel. */
  linha: number;
  name: string;
  empresa?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  cidade?: string;
  estado?: string;
  site?: string;
  segmento?: string;
  origem?: string;
};

export type SituacaoDaLinha =
  | { tipo: "nova"; dados: LinhaLida }
  | { tipo: "duplicada"; dados: LinhaLida; motivo: string }
  | { tipo: "invalida"; dados: LinhaLida; motivo: string };

export type LeituraDoArquivo = {
  /** Colunas reconhecidas, na ordem do arquivo. Vazio = cabeçalho não entendido. */
  colunas: string[];
  /** Cabeçalhos que o arquivo trouxe e a importação não usa. */
  ignoradas: string[];
  linhas: LinhaLida[];
  /** Por que a leitura não produziu nada, quando não produziu. */
  erro?: string;
};

/** Sem nome não há contato: é o único campo de que a importação não abre mão. */
const TETO_DE_LINHAS = 1_000;

/**
 * Lê o arquivo inteiro e devolve as linhas — sem julgar duplicidade ainda.
 *
 * A duplicidade depende do banco, e este módulo não o conhece. Separar as duas
 * coisas é o que permite testar a leitura sem banco nenhum.
 */
export function lerArquivo(conteudo: string): LeituraDoArquivo {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhas.length === 0) return { colunas: [], ignoradas: [], linhas: [], erro: "Arquivo vazio." };
  if (linhas.length === 1) {
    return {
      colunas: [],
      ignoradas: [],
      linhas: [],
      erro: "O arquivo tem só o cabeçalho, sem nenhuma linha de dados.",
    };
  }

  const separador = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], separador).map(chaveDaColuna);

  // De cada posição do arquivo para o campo que ela alimenta.
  const mapa = new Map<number, keyof LinhaLida>();
  const ignoradas: string[] = [];
  cabecalho.forEach((titulo, i) => {
    const campo = Object.entries(COLUNAS).find(([, nomes]) => nomes.includes(titulo));
    if (campo) mapa.set(i, campo[0] as keyof LinhaLida);
    else if (titulo) ignoradas.push(titulo);
  });

  if (!Array.from(mapa.values()).includes("name")) {
    return {
      colunas: [],
      ignoradas,
      linhas: [],
      erro: "Não encontrei a coluna de nome. O cabeçalho precisa ter 'nome'.",
    };
  }

  const lidas: LinhaLida[] = [];
  for (let i = 1; i < linhas.length && lidas.length < TETO_DE_LINHAS; i++) {
    const campos = dividirLinha(linhas[i], separador);
    const linha: LinhaLida = { linha: i + 1, name: "" };
    mapa.forEach((campo, pos) => {
      const valor = (campos[pos] ?? "").trim();
      if (valor) (linha as Record<string, unknown>)[campo] = valor;
    });
    lidas.push(linha);
  }

  return {
    colunas: Array.from(mapa.values()).filter((c) => c !== "linha"),
    ignoradas,
    linhas: lidas,
  };
}

/** E-mail suficientemente parecido com um e-mail. Não é validação de RFC. */
export function pareceEmail(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);
}

export type JaCadastrado = {
  /** E-mails já existentes, em minúsculo. */
  emails: ReadonlySet<string>;
  /** Telefones já existentes, em E.164. */
  telefones: ReadonlySet<string>;
};

/**
 * O que vai acontecer com cada linha — o PREVIEW.
 *
 * ── DUPLICIDADE ÓBVIA, E SÓ ELA ─────────────────────────────────────────────
 * Mesmo e-mail ou mesmo telefone já cadastrado. Nada de casar por nome:
 * "Maria Silva" é duas pessoas diferentes em qualquer lista com cem
 * decoradoras, e fundir duas pessoas é irreversível — o oposto de pular uma
 * linha, que se resolve importando de novo.
 *
 * Duplicada NÃO é sobrescrita. Quem já está no banco pode ter sido trabalhado
 * — etapa movida, observação escrita, porte preenchido — e um arquivo velho
 * apagaria tudo isso em silêncio.
 *
 * A duplicidade DENTRO do próprio arquivo também conta: listas montadas à mão
 * repetem gente, e importar duas vezes a mesma pessoa é o mesmo defeito.
 */
export function analisar(
  linhas: readonly LinhaLida[],
  jaCadastrado: JaCadastrado,
): SituacaoDaLinha[] {
  const emailsDoArquivo = new Set<string>();
  const telefonesDoArquivo = new Set<string>();

  return linhas.map((dados) => {
    if (!dados.name?.trim()) {
      return { tipo: "invalida", dados, motivo: "Sem nome" };
    }
    if (!dados.email?.trim() && !dados.whatsapp?.trim()) {
      // Sem e-mail nem telefone não há como falar com a pessoa. Importar
      // encheria a lista de nomes inalcançáveis.
      return { tipo: "invalida", dados, motivo: "Sem e-mail e sem telefone" };
    }
    const email = dados.email?.trim().toLowerCase();
    if (email && !pareceEmail(email)) {
      return { tipo: "invalida", dados, motivo: `E-mail inválido: ${dados.email}` };
    }

    const telefone = dados.whatsapp ? normalizarE164(dados.whatsapp) : null;

    if (email && jaCadastrado.emails.has(email)) {
      return { tipo: "duplicada", dados, motivo: "Já cadastrado com este e-mail" };
    }
    if (telefone && jaCadastrado.telefones.has(telefone)) {
      return { tipo: "duplicada", dados, motivo: "Já cadastrado com este telefone" };
    }
    if (email && emailsDoArquivo.has(email)) {
      return { tipo: "duplicada", dados, motivo: "Repetido no próprio arquivo" };
    }
    if (telefone && telefonesDoArquivo.has(telefone)) {
      return { tipo: "duplicada", dados, motivo: "Repetido no próprio arquivo" };
    }

    if (email) emailsDoArquivo.add(email);
    if (telefone) telefonesDoArquivo.add(telefone);
    return { tipo: "nova", dados };
  });
}

export type ResumoDaImportacao = {
  novas: number;
  duplicadas: number;
  invalidas: number;
  total: number;
};

export function resumir(situacoes: readonly SituacaoDaLinha[]): ResumoDaImportacao {
  return {
    novas: situacoes.filter((s) => s.tipo === "nova").length,
    duplicadas: situacoes.filter((s) => s.tipo === "duplicada").length,
    invalidas: situacoes.filter((s) => s.tipo === "invalida").length,
    total: situacoes.length,
  };
}
