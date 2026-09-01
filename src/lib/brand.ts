// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDADE DA EMPRESA NOS DOCUMENTOS
//
// Os PDFs que o ALTAR gera são entregues pela DECORADORA à equipe dela e, em
// alguns casos, ao cliente. O protagonismo é da empresa; o ALTAR assina
// discretamente no rodapé.
//
// A INTERFACE do ALTAR continua sendo o ALTAR. Não há white-label de tela: a
// cor da empresa alimenta só o documento.
//
// ── POR QUE A COR É VALIDADA NA LEITURA ─────────────────────────────────────
// Um valor inválido, vazio ou herdado de um cadastro antigo não pode quebrar
// um documento. E uma cor clara demais com texto branco em cima produz um
// cabeçalho ilegível — que é pior do que não personalizar. Por isso o texto
// sobre a cor é ESCOLHIDO pelo contraste medido, nunca fixado.
// ─────────────────────────────────────────────────────────────────────────────

/** Cor do ALTAR, usada quando a empresa não escolheu nenhuma. */
export const COR_PADRAO_ALTAR = "#8B7355";

export type RGB = [number, number, number];

const HEX = /^#?([0-9a-fA-F]{6})$/;
const HEX_CURTO = /^#?([0-9a-fA-F]{3})$/;

/**
 * Aceita `#RRGGBB`, `RRGGBB` e `#RGB`. Qualquer outra coisa devolve `null`,
 * e quem chama decide o padrão.
 */
export function parseHexColor(valor: string | undefined | null): RGB | null {
  if (!valor) return null;
  const v = valor.trim();
  const curto = HEX_CURTO.exec(v);
  if (curto) {
    const [r, g, b] = curto[1].split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  const m = HEX.exec(v);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Cor válida ou o padrão do ALTAR. Nunca devolve algo inutilizável. */
export function resolveBrandColor(valor: string | undefined | null): RGB {
  return parseHexColor(valor) ?? parseHexColor(COR_PADRAO_ALTAR)!;
}

/** Luminância relativa (WCAG 2.1). */
function luminancia([r, g, b]: RGB): number {
  const canal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste entre duas cores (1 a 21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

const BRANCO: RGB = [255, 255, 255];
const ESCURO: RGB = [26, 26, 26];

/**
 * Cor de texto legível SOBRE um fundo — medida, não presumida.
 *
 * Escolhe entre branco e quase-preto o que tiver maior contraste. Uma empresa
 * com marca amarela ou bege clara receberia texto branco ilegível se o texto
 * fosse fixo.
 */
export function readableTextOn(fundo: RGB): RGB {
  return contrastRatio(fundo, BRANCO) >= contrastRatio(fundo, ESCURO) ? BRANCO : ESCURO;
}

/** O contraste atende o mínimo de texto grande da WCAG (3:1)? */
export function temContrasteSuficiente(fundo: RGB, texto: RGB): boolean {
  return contrastRatio(fundo, texto) >= 3;
}

export type EmpresaLike = {
  studioName?: string;
  name?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  cpfCnpj?: string;
  brandColor?: string;
  brandAccentColor?: string;
};

export type IdentidadeDocumento = {
  /** Nome que aparece no documento. Cai para o nome da pessoa se não houver. */
  nome: string;
  cor: RGB;
  corApoio: RGB;
  /** Texto legível sobre `cor`, escolhido pelo contraste real. */
  textoSobreCor: RGB;
  /** Linha de contato compacta, só com o que existe. */
  contato: string;
  /** A empresa personalizou a cor, ou está no padrão do ALTAR? */
  usaCorPropria: boolean;
};

/**
 * Identidade pronta para o gerador de PDF.
 *
 * Funciona com cadastro vazio: sem nome vira "Minha empresa", sem cor usa o
 * padrão do ALTAR, sem contato a linha some — nenhum "—" ocupando espaço.
 */
export function resolveIdentidade(empresa: EmpresaLike | null | undefined): IdentidadeDocumento {
  const e = empresa ?? {};
  const cor = resolveBrandColor(e.brandColor);
  const corApoio = parseHexColor(e.brandAccentColor) ?? cor;

  const contato = [
    e.phone?.trim(),
    e.instagram?.trim(),
    e.email?.trim(),
    e.website?.trim(),
  ]
    .filter((v): v is string => !!v && v.length > 0)
    .join("  ·  ");

  return {
    nome: e.studioName?.trim() || e.name?.trim() || "Minha empresa",
    cor,
    corApoio,
    textoSobreCor: readableTextOn(cor),
    contato,
    usaCorPropria: parseHexColor(e.brandColor) !== null,
  };
}

/** Assinatura discreta do ALTAR no rodapé. */
export const ASSINATURA_ALTAR = "Gerado por ALTAR";
