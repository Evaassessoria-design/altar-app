import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCEPT_DE_DOCUMENTO,
  cabeNoTeto,
  dicaDeTamanho,
  EXTENSOES_DE_DOCUMENTO,
  extensaoDe,
  formatoPermitido,
  MB,
  MIMES_DE_DOCUMENTO,
  motivoDaFalhaDoEnvio,
  PRAZO_DO_ENVIO_MS,
  recadoDeTamanho,
  TAMANHO_MAXIMO_DOCUMENTO,
  TAMANHO_MAXIMO_IMAGEM,
  tetoDoTipo,
} from "./arquivos";

// ═════════════════════════════════════════════════════════════════════════════
// O LIMITE DE ARQUIVO, ATACADO NAS BORDAS
//
// ── O DEFEITO REAL QUE ORIGINOU ESTE ARQUIVO ────────────────────────────────
// Uma decoradora anexou um DOCX de 3,9 MB em Funil → Documentos. Passou pela
// tela (teto 20 MB), passou pelo hook (teto 10 MB) e foi recusada pelo backend
// com "acima do limite de 1.000.000. Confira os zeros."
//
// O backend validava BYTES com `exigirQuantidadeGravavel`, cujo teto existe
// para quantidade física — "um milhão de vasos é erro de digitação". Em bytes,
// 1.000.000 são 0,95 MiB.
//
// Três fontes para a mesma regra, e a mais apertada era a invisível.
// ═════════════════════════════════════════════════════════════════════════════

/** 100 MB, escrito à mão de propósito: se a constante mudar, este teste cobra. */
const CEM_MB = 100 * 1024 * 1024;

describe("100 MB é um número só, e é este", () => {
  it("o teto de documento é exatamente 104.857.600 bytes", () => {
    // Era 20 MB até 06/10. Subiu por decisão de produto: orçamento de
    // fornecedor chega a 30–36 MB (docs/upload/arquivo-orfao.md).
    expect(TAMANHO_MAXIMO_DOCUMENTO).toBe(CEM_MB);
    expect(TAMANHO_MAXIMO_DOCUMENTO).toBe(104_857_600);
  });

  it("o prazo do POST é o do Convex: 2 minutos", () => {
    expect(PRAZO_DO_ENVIO_MS).toBe(120_000);
  });

  it("MB é mebibyte — o que o sistema operacional chama de MB na tela", () => {
    expect(MB).toBe(1024 * 1024);
  });

  it("documento e imagem têm tetos PRÓPRIOS, e o de documento é maior", () => {
    // Era o contrário, e um teste antigo afirmava isso. A inversão é decisão
    // de produto: proposta em DOCX ou PPTX com fotos de ambiente passa de
    // 15 MB, e quem desenha foto na tela é a galeria, não o leitor de PDF.
    expect(tetoDoTipo("documento")).toBe(TAMANHO_MAXIMO_DOCUMENTO);
    expect(tetoDoTipo("imagem")).toBe(TAMANHO_MAXIMO_IMAGEM);
    expect(TAMANHO_MAXIMO_DOCUMENTO).toBeGreaterThan(TAMANHO_MAXIMO_IMAGEM);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DE BORDAS
// ─────────────────────────────────────────────────────────────────────────────

const BORDAS: ReadonlyArray<readonly [string, number, boolean]> = [
  ["500 KB", 500 * 1024, true],
  ["1 MB", 1 * MB, true],
  // O caso do relato. 3,9 MB é 4.089.446 bytes — quatro vezes o teto antigo.
  ["3,9 MB (o arquivo do relato)", Math.round(3.9 * MB), true],
  ["10 MB (o teto antigo do hook)", 10 * MB, true],
  ["20 MB + 1 byte (recusado até 06/10)", 20 * MB + 1, true],
  ["36 MB (o orçamento de fornecedor)", 36 * MB, true],
  ["99,9 MB", Math.round(99.9 * MB), true],
  ["100 MB exatos", CEM_MB, true],
  ["100 MB + 1 byte", CEM_MB + 1, false],
  ["150 MB", 150 * MB, false],
];

describe("o teto de documento, byte a byte", () => {
  it.each(BORDAS)("%s → %s", (_rotulo, bytes, deveCaber) => {
    expect(cabeNoTeto(bytes, TAMANHO_MAXIMO_DOCUMENTO)).toBe(deveCaber);
  });

  it("o limite é inclusivo: o último byte que cabe é o 104.857.600", () => {
    expect(cabeNoTeto(CEM_MB, TAMANHO_MAXIMO_DOCUMENTO)).toBe(true);
    expect(cabeNoTeto(CEM_MB + 1, TAMANHO_MAXIMO_DOCUMENTO)).toBe(false);
  });
});

describe("número que não é tamanho é recusado", () => {
  // `v.number()` do Convex aceita NaN e Infinity: são floats válidos, e o
  // validador os gravaria sem reclamar. `NaN bytes` na tela é o tipo de ruído
  // que faz desconfiar do resto do produto.
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["negativo", -1],
    ["negativo grande", -5 * MB],
  ])("%s não cabe", (_rotulo, valor) => {
    expect(cabeNoTeto(valor, TAMANHO_MAXIMO_DOCUMENTO)).toBe(false);
  });

  it("ZERO não cabe — arquivo vazio não é documento", () => {
    // A regra coerente do domínio: a tela já dizia "está vazio" antes desta
    // correção, e `motivoParaRecusarArquivo` também. O que faltava era o
    // backend concordar em vez de aceitar em silêncio.
    expect(cabeNoTeto(0, TAMANHO_MAXIMO_DOCUMENTO)).toBe(false);
  });
});

describe("o recado é de gente, não de máquina", () => {
  it("diz o limite em MB e o que fazer", () => {
    const recado = recadoDeTamanho(TAMANHO_MAXIMO_DOCUMENTO);
    expect(recado).toBe(
      "Este arquivo ultrapassa o limite de 100 MB. Escolha um arquivo menor e tente novamente.",
    );
  });

  it("não sobrou nenhum vestígio da mensagem antiga", () => {
    const recado = recadoDeTamanho(TAMANHO_MAXIMO_DOCUMENTO);
    // "Confira os zeros" para quem escolheu um arquivo, e um número de sete
    // dígitos que ninguém interpreta.
    expect(recado).not.toMatch(/zeros/i);
    expect(recado).not.toMatch(/1\.000\.000|1000000|bytes/i);
  });

  it("a dica ao lado do seletor sai da mesma constante", () => {
    expect(dicaDeTamanho("documento")).toBe("Máximo de 100 MB por arquivo.");
    expect(dicaDeTamanho("imagem")).toBe("Máximo de 15 MB por arquivo.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUANDO O ENVIO FALHA, A FRASE DIZ O MOTIVO CERTO
//
// O navegador devolve "falha de rede" tanto para o Wi-Fi que caiu quanto para
// o POST que o Convex cortou aos 2 minutos. Mandar "verifique a conexão" para
// quem está conectado, mas com subida lenta, não ajuda ninguém.
// ─────────────────────────────────────────────────────────────────────────────

describe("motivoDaFalhaDoEnvio", () => {
  it("perto do prazo, culpa a velocidade — não a conexão", () => {
    const m = motivoDaFalhaDoEnvio({ nome: "Orçamento.pptx", status: 0, decorridoMs: 119_000 });
    expect(m).toMatch(/passou de 2 minutos/);
    expect(m).toContain("Orçamento.pptx");
    expect(m).not.toMatch(/Verifique a conexão/);
  });

  it("queda rápida é conexão", () => {
    const m = motivoDaFalhaDoEnvio({ nome: "a.pdf", status: 0, decorridoMs: 3_000 });
    expect(m).toMatch(/Verifique a conexão/);
  });

  it("413 vira o recado de tamanho, sem número cru", () => {
    const m = motivoDaFalhaDoEnvio({ nome: "a.pdf", status: 413, decorridoMs: 1_000 });
    expect(m).toMatch(/ultrapassa o limite de 100 MB/);
  });

  it("outro status diz o código, para o suporte ter por onde começar", () => {
    const m = motivoDaFalhaDoEnvio({ nome: "a.pdf", status: 502, decorridoMs: 1_000 });
    expect(m).toMatch(/erro 502/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FORMATOS — EXTENSÃO **OU** MIME
// ─────────────────────────────────────────────────────────────────────────────

const arq = (name: string, type = "") => ({ name, type });
const DOC = [MIMES_DE_DOCUMENTO, EXTENSOES_DE_DOCUMENTO] as const;
const permitido = (name: string, type = "") => formatoPermitido(arq(name, type), ...DOC);

describe("os sete formatos de papelada entram", () => {
  it.each([
    ["PDF", "proposta.pdf", "application/pdf"],
    ["DOC", "contrato.doc", "application/msword"],
    [
      "DOCX",
      "orcamento.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["XLS", "planilha.xls", "application/vnd.ms-excel"],
    [
      "XLSX",
      "custos.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    ["PPT", "apresentacao.ppt", "application/vnd.ms-powerpoint"],
    [
      "PPTX",
      "projeto.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  ])("%s com MIME correto", (_f, nome, mime) => {
    expect(permitido(nome, mime)).toBe(true);
  });

  it("e o `accept` do seletor lista extensões E MIMEs", () => {
    for (const ext of [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]) {
      expect(ACCEPT_DE_DOCUMENTO).toContain(ext);
    }
    expect(ACCEPT_DE_DOCUMENTO).toContain("application/pdf");
  });
});

describe("o navegador mente, e a regra sobrevive a isso", () => {
  // Cada um destes é comportamento real, não hipótese.
  it("DOCX como `application/octet-stream` (máquina sem Office) passa pela extensão", () => {
    expect(permitido("proposta.docx", "application/octet-stream")).toBe(true);
  });

  it("DOC sem MIME nenhum passa pela extensão", () => {
    expect(permitido("contrato.doc", "")).toBe(true);
  });

  it("XLSX anunciado como XLS pelo Windows passa de qualquer jeito", () => {
    expect(permitido("custos.xlsx", "application/vnd.ms-excel")).toBe(true);
  });

  it("MIME em MAIÚSCULAS não engana", () => {
    expect(permitido("a.pdf", "APPLICATION/PDF")).toBe(true);
  });

  it("extensão em MAIÚSCULAS não engana", () => {
    expect(permitido("PROPOSTA FINAL.DOCX", "application/octet-stream")).toBe(true);
  });

  it("arquivo salvo de anexo, sem extensão mas com MIME certo, passa", () => {
    expect(permitido("anexo", "application/pdf")).toBe(true);
  });

  it("sem extensão e sem MIME passa — não se recusa trabalho por ausência de dado", () => {
    // Não é frouxidão: isto é conveniência de seletor. Quem decide o que vira
    // registro é a mutation, com dono conferido.
    expect(permitido("arquivo", "")).toBe(true);
  });
});

describe("formato proibido é recusado", () => {
  it.each([
    ["executável", "virus.exe", "application/x-msdownload"],
    ["vídeo", "festa.mp4", "video/mp4"],
    ["zip", "tudo.zip", "application/zip"],
    ["imagem, onde só se espera papelada", "foto.jpg", "image/jpeg"],
  ])("%s", (_f, nome, mime) => {
    expect(permitido(nome, mime)).toBe(false);
  });

  it("extensão certa com MIME errado AINDA passa — o OU é deliberado", () => {
    // Consequência assumida: a extensão basta. É o preço de aceitar DOCX em
    // máquina sem Office, e o backend continua sendo a barreira real.
    expect(permitido("planilha.xlsx", "video/mp4")).toBe(true);
  });
});

describe("lista vazia de aceitos = qualquer formato", () => {
  it("é o caso de Referência e «Outro documento» no funil", () => {
    // Essas duas recebem imagem, planilha e o que mais a negociação produzir.
    // Restringir ali seria trocar um defeito de tamanho por um de formato.
    expect(formatoPermitido(arq("foto.jpg", "image/jpeg"), [], [])).toBe(true);
    expect(formatoPermitido(arq("tudo.zip", "application/zip"), [], [])).toBe(true);
  });
});

describe("extensaoDe", () => {
  it.each([
    ["proposta.docx", ".docx"],
    ["Proposta Final.DOCX", ".docx"],
    ["com.ponto.no.meio.pdf", ".pdf"],
    ["sem-extensao", null],
    [".oculto", null],
    ["termina-com-ponto.", null],
    ["", null],
  ])("%s → %s", (nome, esperado) => {
    expect(extensaoDe(nome)).toBe(esperado);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA QUE IMPEDE A VOLTA DO DEFEITO
// ─────────────────────────────────────────────────────────────────────────────

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("byte nunca mais é validado como quantidade física", () => {
  it("`leadDocuments` usa o validador de TAMANHO, não o de quantidade", () => {
    const fonte = semComentarios("convex/leadDocuments.ts");
    expect(fonte).toContain("exigirTamanhoDeArquivoGravavel(args.fileSize");
    // A linha exata que causou o defeito em produção.
    expect(fonte).not.toContain("exigirQuantidadeGravavel");
  });

  it("nenhum lugar do backend valida tamanho de arquivo com `exigirQuantidadeGravavel`", () => {
    const fonte = semComentarios("convex/leadDocuments.ts");
    const chamadas = [...fonte.matchAll(/exigirQuantidadeGravavel\(([^,)]+)/g)].map((m) => m[1]);
    for (const arg of chamadas) {
      expect(arg).not.toMatch(/size|bytes|tamanho/i);
    }
  });

  it("o teto de documento não é escrito à mão em mais de um lugar", () => {
    // `tiposDeDocumento` declarava `TAMANHO_MAXIMO_MB = 20` por conta própria.
    const fonte = semComentarios("convex/lib/tiposDeDocumento.ts");
    expect(fonte).toContain("TAMANHO_MAXIMO_DOCUMENTO");
    expect(fonte).not.toMatch(/TAMANHO_MAXIMO_MB\s*=\s*\d+/);
  });

  it("o front não recria o teto: importa a fonte única", () => {
    const fonte = semComentarios("src/lib/upload.ts");
    // A GRAFIA do caminho não é o que importa, e exigi-la quebrou este teste
    // quando o import virou relativo (o alias `@/convex/*` não está mapeado
    // no projeto `convex`, que compila este módulo via o teste de banco).
    // O que importa é de onde vem o número.
    expect(fonte).toMatch(/from "[./@a-z]*convex\/lib\/arquivos\.ts"/);
    // E que ele não declare teto próprio — era `10 * MB` aqui dentro.
    expect(fonte).not.toMatch(/=\s*\d+\s*\*\s*MB/);
  });
});
