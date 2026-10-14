// ─────────────────────────────────────────────────────────────────────────────
// XLSX MÍNIMO, SEM DEPENDÊNCIA
//
// O projeto não tinha biblioteca de planilha (só jsPDF). Um .xlsx é um ZIP de
// arquivos XML; este módulo escreve o mínimo que o Excel, o LibreOffice e o
// Google Planilhas abrem: planilhas com texto, número e data TIPADOS, formato
// de moeda e de data, cabeçalho em negrito e autofiltro.
//
// ── POR QUE NÃO CSV ─────────────────────────────────────────────────────────
// CSV não tem tipo: "01/10/2026" vira texto ou data conforme o idioma de quem
// abre, e "1.200,00" vira 1,2. Para conferência, o valor precisa SER número.
//
// ── FÓRMULA VINDA DE TEXTO DO USUÁRIO ───────────────────────────────────────
// Descrição, fornecedor e cliente são texto digitado. Uma descrição
// "=HYPERLINK(...)" num CSV vira fórmula ao abrir. Aqui todo texto é gravado
// como `inlineStr` — um tipo de célula que o Excel NUNCA avalia — e nenhuma
// célula é escrita com `<f>`. Não há caminho de texto para fórmula.
// ─────────────────────────────────────────────────────────────────────────────

export type Celula =
  | { tipo: "texto"; valor: string }
  | { tipo: "numero"; valor: number; formato?: "moeda" | "inteiro" }
  | { tipo: "data"; valor: string /* AAAA-MM-DD */ }
  | { tipo: "vazio" };

export type Planilha = {
  nome: string;
  cabecalho: string[];
  linhas: Celula[][];
  /** Largura das colunas, em caracteres. */
  larguras?: number[];
};

export const texto = (valor: string | undefined | null): Celula =>
  valor ? { tipo: "texto", valor } : { tipo: "vazio" };
export const moeda = (centavos: number): Celula => ({ tipo: "numero", valor: centavos / 100, formato: "moeda" });
export const data = (dia: string): Celula => ({ tipo: "data", valor: dia });

// ── XML ─────────────────────────────────────────────────────────────────────

/** Caracteres que o XML 1.0 proíbe somem; os especiais viram entidades. */
function permitidoNoXml(cp: number): boolean {
  return cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

function xml(t: string): string {
  return [...t]
    .filter((ch) => permitidoNoXml(ch.codePointAt(0)!))
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function letraDaColuna(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Número de série do Excel: dias desde 30/12/1899. Sem hora, sem fuso. */
export function serialDaData(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

// Estilos: 0 normal · 1 data · 2 moeda · 3 cabeçalho · 4 inteiro
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00;-&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celulaXml(c: Celula, ref: string): string {
  switch (c.tipo) {
    case "vazio":
      return "";
    case "texto":
      // inlineStr: nunca é fórmula, qualquer que seja o primeiro caractere.
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(c.valor)}</t></is></c>`;
    case "numero": {
      const v = Number.isFinite(c.valor) ? c.valor : 0;
      return `<c r="${ref}" s="${c.formato === "moeda" ? 2 : c.formato === "inteiro" ? 4 : 0}"><v>${v}</v></c>`;
    }
    case "data":
      return /^\d{4}-\d{2}-\d{2}$/.test(c.valor)
        ? `<c r="${ref}" s="1"><v>${serialDaData(c.valor)}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${xml(c.valor)}</t></is></c>`;
  }
}

function planilhaXml(p: Planilha): string {
  const linhas: string[] = [];
  linhas.push(
    `<row r="1">${p.cabecalho
      .map((h, i) => `<c r="${letraDaColuna(i)}1" s="3" t="inlineStr"><is><t xml:space="preserve">${xml(h)}</t></is></c>`)
      .join("")}</row>`,
  );
  p.linhas.forEach((l, li) => {
    const r = li + 2;
    linhas.push(`<row r="${r}">${l.map((c, ci) => celulaXml(c, `${letraDaColuna(ci)}${r}`)).join("")}</row>`);
  });
  const ultima = letraDaColuna(Math.max(0, p.cabecalho.length - 1));
  const cols = p.larguras
    ? `<cols>${p.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols}<sheetData>${linhas.join("")}</sheetData>
<autoFilter ref="A1:${ultima}${p.linhas.length + 1}"/>
</worksheet>`;
}

/** Nome de aba: até 31 caracteres, sem os que o Excel proíbe. */
function nomeDeAba(n: string): string {
  return n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha";
}

export function arquivosDoXlsx(planilhas: readonly Planilha[]): { nome: string; conteudo: string }[] {
  const abas = planilhas.map((p, i) => ({ id: i + 1, nome: nomeDeAba(p.nome), p }));
  return [
    {
      nome: "[Content_Types].xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${abas.map((a) => `<Override PartName="/xl/worksheets/sheet${a.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${abas.map((a) => `<sheet name="${xml(a.nome)}" sheetId="${a.id}" r:id="rId${a.id}"/>`).join("")}</sheets>
<definedNames>${abas
        .map(
          (a) =>
            `<definedName name="_xlnm._FilterDatabase" localSheetId="${a.id - 1}" hidden="1">'${xml(a.nome)}'!$A$1:$${letraDaColuna(Math.max(0, a.p.cabecalho.length - 1))}$${a.p.linhas.length + 1}</definedName>`,
        )
        .join("")}</definedNames>
</workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((a) => `<Relationship Id="rId${a.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${a.id}.xml"/>`).join("\n")}
<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nome: "xl/styles.xml", conteudo: ESTILOS },
    ...abas.map((a) => ({ nome: `xl/worksheets/sheet${a.id}.xml`, conteudo: planilhaXml(a.p) })),
  ];
}

// ── ZIP (método "store", sem compressão) ────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSemCompressao(arquivos: readonly { nome: string; conteudo: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = enc.encode(a.conteudo);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // store
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(local.buffer), nome, dados);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), nome);
    deslocamento += 30 + nome.length + dados.length;
  }
  const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const total = todas.reduce((s, b) => s + b.length, 0);
  const saida = new Uint8Array(total);
  let p = 0;
  for (const b of todas) {
    saida.set(b, p);
    p += b.length;
  }
  return saida;
}

export function gerarXlsx(planilhas: readonly Planilha[]): Uint8Array {
  return zipSemCompressao(arquivosDoXlsx(planilhas));
}
