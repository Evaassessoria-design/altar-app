import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { montarCaderno, type FontesDoCaderno, type ItemDoCaderno } from "./montar-caderno.ts";
import { fontesDoCaderno, plantaDoCaderno } from "./fontes-do-caderno.ts";
import { falaDeDinheiro, linhaSemValores, nomeSemValores, paragrafoSemValores } from "./sem-valores.ts";
import { lerAmbientesDoTexto, lerItensDoTexto } from "./itens-do-texto.ts";
import { desenharCaderno, urlsDoCaderno, type ImagensDoCaderno } from "../generate-assembly-pdf.ts";
import { AUDIENCIAS, opcaoDaAudiencia, rotuloDaVersao } from "../audiencia-do-caderno.ts";
import { resolveIdentidade } from "../brand.ts";
import { ehObrigacaoDeMontagem } from "../decoration-project.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O CADERNO NOVO — DUAS VERSÕES, UMA MONTAGEM, NENHUM VALOR ONDE NÃO DEVE
//
// Os testes deste arquivo geram o caderno de verdade (`montarCaderno`) e o PDF
// de verdade (`desenharCaderno`, em jsdom) e procuram no RESULTADO — não no
// código-fonte. Uma regra que só existe no texto do gerador não protege nada;
// o que protege é o papel não conter o valor.
//
// O evento de teste é o caso real que motivou a mudança: o contrato lido por
// IA deixou no briefing "no valor de 2800" e "no valor de 2980", e isso saía
// no caderno da EQUIPE.
// ═════════════════════════════════════════════════════════════════════════════

const NOTAS_DO_CONTRATO =
  "Mobiliário da mesa de doces, suportes para doces e bolo e estilos de alguns arranjos serão definidos com a contratante. " +
  "As flores nobres serão as disponíveis na época. Sousplats, louças, talheres e forminhas de doces não estão inclusos. " +
  "A estrutura para o bar, no valor de 2800, e o lounge adicional, no valor de 2980, são opcionais e deverão ser contratados futuramente. " +
  "O bolo cenográfico é opcional e cortesia.";

const ITENS_DO_CONTRATO =
  "flores: Flores nobres; flores: Folhagens; iluminação: Pendentes de iluminação; mobiliário: Aparador (x1); " +
  "mobiliário: Mesas redondas e quadradas do acervo local (x22); mobiliário: Cadeiras para a cerimônia (x220); " +
  "mobiliário: Cadeiras do acervo local (x200); mobiliário: Lounge sala (x1); decoração: Cilindros com velas (x27); " +
  "decoração: Toalhas em tecido (x27)";

let seq = 0;
function item(parcial: Partial<ItemDoCaderno> & { name: string }): ItemDoCaderno {
  seq++;
  return {
    _id: `item-${seq}`,
    area: "party",
    visibility: "cliente",
    includeInAssemblyReport: true,
    checkOnAssembly: false,
    ...parcial,
  } as ItemDoCaderno;
}

function fontes(extra: Partial<FontesDoCaderno> = {}): FontesDoCaderno {
  return {
    evento: {
      name: "Casamento Marina e Vinicius",
      type: "wedding",
      date: "2026-10-17",
      location: "Reserva Maranhão",
      contractPendings: ["Definir estilo de alguns arranjos", "Saldo de R$ 10.000 a pagar até 10/10"],
    },
    briefing: {
      decorStyle: "Arranjos estilo jardim; mesa de doces contemporânea",
      atmosphereDescription: "Cerimônia, recepção, Welcome Drink, altar, corredor, mesa familiar, lounge",
      furnitureNotes: ITENS_DO_CONTRATO,
      generalNotes: NOTAS_DO_CONTRATO,
      flowerBudget: "R$ 9.999 de flores",
      insuranceInfo: "Apólice 777 — R$ 50.000",
      setupTime: "08h",
      venueContact: "Renata (fazenda)",
      venueRules: "Montagem só após as 8h. Taxa de limpeza de R$ 500 se sujar o salão.",
    },
    itens: [
      item({ name: "Mesa de doces contemporânea", quantity: 1, ambiente: "Mesa do bolo", notes: "Levar 2 a mais. Custo do aluguel R$ 350.", supplierName: "Locadora Sol" }),
      item({ name: "Arco de flores", quantity: 1, ambiente: "Altar", projectScope: "incluso" }),
      item({ name: "Estrutura para o bar", ambiente: "Bar", projectScope: "opcional", valorOpcional: 4321 }),
      item({ name: "Bolo cenográfico", ambiente: "Mesa do bolo", projectScope: "opcional", valorOpcional: 0 }),
      item({ name: "Sousplats", projectScope: "nao_incluso" }),
      item({ name: "Painel inspiração Pinterest", projectScope: "referencia" }),
      item({ name: "Brinde da equipe (interno)", visibility: "interno", quantity: 5 }),
      item({ name: "Gerador de reserva", visibility: "equipe", quantity: 1 }),
      // Mesmo nome de uma linha do texto do contrato, com OUTRA quantidade:
      // o cadastrado vale e o texto não soma.
      item({ name: "Cadeiras do acervo local", quantity: 180 }),
    ],
    fotos: [
      { _id: "f1", url: "https://x/f1.jpg", category: "antes", projectScope: "incluso", ambiente: "Altar", caption: "Arco aprovado — R$ 1.200" },
      { _id: "f2", url: "https://x/f2.jpg", category: "antes", projectScope: "referencia", caption: "inspiração" },
      { _id: "f3", url: "https://x/f3.jpg", category: "antes", visibility: "interno", caption: "fornecedor mandou cor errada" },
      { _id: "f4", url: "https://x/f4.jpg", category: "evento", caption: "foto do evento passado" },
      { _id: "f5", url: "https://x/f5.jpg", category: "antes", projectScope: "nao_incluso", caption: "lounge recusado" },
    ],
    planta: { url: "https://x/planta.png", origem: "planta" },
    acervo: [{ nome: "Castiçal de vidro", quantidade: 30, saiu: 30, voltou: 28, emManutencao: 2 }],
    equipe: [{ nome: "Bruna", funcao: "Florista", horario: "07h" }],
    checklist: [{ name: "Separar extensões", quantity: 4 }],
    convidados: "180",
    responsavel: "Camila",
    responsavelTelefone: "(11) 90000-0001",
    ...extra,
  };
}

/**
 * O texto que o PDF realmente ESCREVE na página (jsPDF sem compressão): só os
 * literais dos operadores `Tj`. O arquivo cru também tem coordenadas e
 * deslocamentos ("28.35 Td", "4321 0 R"), e procurar "350" nele acharia
 * número de posição, não valor.
 */
function textoDoPdf(doc: ReturnType<typeof desenharCaderno>): string {
  const cru = doc.output();
  const literais = cru.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [];
  return literais
    .map((l) => l.replace(/\)\s*Tj$/, "").slice(1).replace(/\\([()\\])/g, "$1"))
    .join("\n");
}

const ctx = (imagens: ImagensDoCaderno = new Map()) => ({
  identidade: resolveIdentidade({ studioName: "Ateliê Flor de Sal", brandColor: "#2A211A", phone: "(11) 90000-0002" }),
  logoDataUrl: null,
  imagens,
  geradoEm: new Date(2026, 9, 13),
});

// 1×1 JPEG válido — o suficiente para o jsPDF ler o cabeçalho e desenhar.
const JPEG_1PX =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const VALORES_PROIBIDOS_NA_EQUIPE = ["R$", "2800", "2.800", "2980", "2.980", "4321", "4.321", "9.999", "50.000", "10.000", "350", "1.200", "500"];

describe("exatamente duas ações de geração", () => {
  it("o menu tem Equipe e Cliente — e mais nada", () => {
    expect(AUDIENCIAS.map((a) => a.valor).sort()).toEqual(["cliente", "equipe"]);
    expect(AUDIENCIAS.some((a) => /interno/i.test(a.rotulo))).toBe(false);
  });

  it("casamento fala com os noivos; os outros eventos, com o cliente", () => {
    expect(rotuloDaVersao("cliente", "wedding")).toBe("Para os noivos");
    expect(rotuloDaVersao("cliente", "corporate")).toBe("Para o cliente");
    expect(rotuloDaVersao("cliente", undefined)).toBe("Para o cliente");
    expect(rotuloDaVersao("equipe", "wedding")).toBe("Para a equipe");
    expect(montarCaderno(fontes(), "cliente").selo).toBe("Para os noivos");
    const corporativo = fontes({ evento: { ...fontes().evento, type: "corporate" } });
    expect(montarCaderno(corporativo, "cliente").selo).toBe("Para o cliente");
  });

  it("o antigo \"interno\" que ainda esteja salvo em algum lugar cai na equipe, que não tem valor", () => {
    expect(opcaoDaAudiencia("interno").valor).toBe("equipe");
  });

  it("a tela de Briefing oferece só as opções de AUDIENCIAS, e abre a prévia", () => {
    const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");
    expect(tela).toContain("AUDIENCIAS.map((a) =>");
    expect(tela).toContain("setCadernoAberto(a.valor)");
    expect(tela).not.toMatch(/handleExport\("interno"\)|valor:\s*"interno"/);
  });
});

describe("a equipe nunca recebe dinheiro — nos dados, na prévia e no PDF", () => {
  const equipe = montarCaderno(fontes(), "equipe");
  const json = JSON.stringify(equipe);
  const pdf = textoDoPdf(desenharCaderno(equipe, ctx()));

  it.each(VALORES_PROIBIDOS_NA_EQUIPE)("o caderno montado não contém %s", (v) => {
    expect(json).not.toContain(v);
  });

  it.each(VALORES_PROIBIDOS_NA_EQUIPE)("o PDF não contém %s", (v) => {
    expect(pdf).not.toContain(v);
  });

  it("nem as palavras que denunciam dinheiro no texto livre", () => {
    for (const palavra of ["valor de", "pagar", "Custo", "Taxa de limpeza", "Saldo"]) {
      expect(json).not.toContain(palavra);
      expect(pdf).not.toContain(palavra);
    }
  });

  it("o opcional entra como \"não levar sem confirmação\", sem preço", () => {
    expect(equipe.atencao.naoLevarSemConfirmar).toEqual(["Estrutura para o bar", "Bolo cenográfico"]);
    expect(equipe.opcionais.every((o) => o.valor === undefined)).toBe(true);
  });

  it("o resto da nota sobrevive: só sai a frase do dinheiro", () => {
    expect(equipe.informacoesDoLocal.find((l) => l.rotulo === "Regras do espaço")?.valor).toBe(
      "Montagem só após as 8h.",
    );
    expect(equipe.trechosOmitidos).toBeGreaterThan(0);
  });
});

describe("o cliente vê o projeto, nunca custo nem margem", () => {
  it("sem pedir valores, nenhum R$ sai — nem do opcional", () => {
    const c = montarCaderno(fontes(), "cliente");
    const json = JSON.stringify(c);
    expect(json).not.toContain("R$");
    expect(json).not.toContain("4.321");
    expect(c.opcionais.map((o) => o.nome)).toEqual(["Estrutura para o bar", "Bolo cenográfico"]);
    expect(textoDoPdf(desenharCaderno(c, ctx()))).not.toContain("R$");
  });

  it("com \"incluir valores\", só o valor ESTRUTURADO do opcional entra", () => {
    const c = montarCaderno(fontes(), "cliente", { incluirValores: true });
    expect(c.opcionais.find((o) => o.nome === "Estrutura para o bar")?.valor).toMatch(/R\$\s?4\.321/);
    expect(c.opcionais.find((o) => o.nome === "Bolo cenográfico")?.valor).toBe("Cortesia");
    // O valor solto no texto do contrato continua fora: texto livre não é fonte de preço.
    const semOpcionais = JSON.stringify({ ...c, opcionais: [] });
    expect(semOpcionais).not.toContain("R$");
    expect(semOpcionais).not.toContain("2800");
  });

  it("a equipe ignora \"incluir valores\" mesmo se alguém passar", () => {
    const e = montarCaderno(fontes(), "equipe", { incluirValores: true });
    expect(JSON.stringify(e)).not.toContain("R$");
  });

  it("observação, fornecedor e campos internos não chegam ao cliente", () => {
    const json = JSON.stringify(montarCaderno(fontes(), "cliente", { incluirValores: true }));
    expect(json).not.toContain("Levar 2 a mais");
    expect(json).not.toContain("Locadora Sol");
    expect(json).not.toContain("Apólice");
    expect(json).not.toContain("9.999");
    expect(json).not.toContain("Renata");
    expect(json).not.toContain("Castiçal");
  });

  it("o que ficou de fora do contrato não reabre a negociação no papel do cliente", () => {
    const c = montarCaderno(fontes(), "cliente");
    expect(JSON.stringify(c)).not.toContain("Sousplats");
    expect(c.atencao.naoIncluso).toEqual([]);
  });
});

describe("cada item no seu lugar", () => {
  const equipe = montarCaderno(fontes(), "equipe");
  const cliente = montarCaderno(fontes(), "cliente");
  const nomes = (gs: { linhas: { nome: string }[] }[]) => gs.flatMap((g) => g.linhas.map((l) => l.nome));

  it("o opcional não vai para o caminhão nem para o \"incluso\"", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "opcional" })).toBe(false);
    expect(nomes(equipe.carga)).not.toContain("Estrutura para o bar");
    expect(nomes(cliente.incluido)).not.toContain("Estrutura para o bar");
  });

  it("item interno não sai em nenhum dos dois; o da equipe só na equipe", () => {
    expect(nomes(equipe.carga)).not.toContain("Brinde da equipe (interno)");
    expect(nomes(cliente.incluido)).not.toContain("Brinde da equipe (interno)");
    expect(nomes(equipe.carga)).toContain("Gerador de reserva");
    expect(nomes(cliente.incluido)).not.toContain("Gerador de reserva");
  });

  it("referência visual não é montada, e a equipe é avisada de quantas ficaram de fora", () => {
    expect(nomes(equipe.carga)).not.toContain("Painel inspiração Pinterest");
    expect(equipe.foraDaMontagem).toBe(1);
    expect(textoDoPdf(desenharCaderno(equipe, ctx()))).toContain("1 item n");
  });

  it("não incluso vai para a equipe como \"não levar\"", () => {
    expect(equipe.atencao.naoIncluso).toEqual(["Sousplats"]);
  });

  it("foto interna, de execução ou fora do escopo não entra em nenhum dos dois", () => {
    for (const c of [equipe, cliente]) {
      const urls = urlsDoCaderno(c);
      expect(urls).not.toContain("https://x/f3.jpg");
      expect(urls).not.toContain("https://x/f4.jpg");
      expect(urls).not.toContain("https://x/f5.jpg");
    }
  });

  it("a legenda com valor perde o valor; a foto continua", () => {
    const todas = [...cliente.referencias, ...cliente.fichas.flatMap((f) => f.imagens)];
    const arco = todas.find((i) => i.url === "https://x/f1.jpg");
    expect(arco).toBeDefined();
    expect(arco?.legenda).toBe("Arco aprovado");
  });
});

describe("nenhuma quantidade duplicada", () => {
  const equipe = montarCaderno(fontes(), "equipe");
  const linhas = equipe.carga.flatMap((g) => g.linhas);

  it("item cadastrado e linha do contrato com o mesmo nome: vale o cadastrado, uma vez", () => {
    const cadeiras = linhas.filter((l) => l.nome === "Cadeiras do acervo local");
    expect(cadeiras).toHaveLength(1);
    expect(cadeiras[0].quantidade).toBe("180");
    expect(JSON.stringify(equipe)).not.toContain("380");
  });

  it("o mesmo nome repetido no texto não é somado", () => {
    const lido = lerItensDoTexto("mobiliário: Cadeiras (x200); mobiliário: Cadeiras (x200); flores: Folhagens");
    expect(lido.itens.filter((i) => i.nome === "Cadeiras")).toHaveLength(1);
    expect(lido.itens[0].quantidade).toBe(200);
    expect(lido.repetidos).toEqual(["Cadeiras"]);
  });

  it("as peças do acervo ficam num bloco próprio, fora da lista de itens", () => {
    expect(linhas.some((l) => l.nome.includes("Castiçal"))).toBe(false);
    expect(equipe.pecasDoAcervo).toEqual([{ nome: "Castiçal de vidro", reservado: "30", saiu: 30, voltou: 28 }]);
  });

  it("a ficha por ambiente não repete a quantidade que já está na tabela", () => {
    for (const c of [equipe, montarCaderno(fontes(), "cliente")]) {
      for (const f of c.fichas) for (const it of f.itens) expect(it.quantidade).toBeUndefined();
    }
  });

  it("todo item do documento aparece com quantidade em um lugar só", () => {
    const cliente = montarCaderno(fontes(), "cliente");
    const comQuantidade = cliente.incluido.flatMap((g) => g.linhas).filter((l) => l.quantidade);
    const nomesQ = comQuantidade.map((l) => l.nome);
    expect(new Set(nomesQ).size).toBe(nomesQ.length);
  });
});

describe("gerar não marca nada", () => {
  it("as caixas saem vazias e a montagem não lê nem grava situação", () => {
    for (const arquivo of ["src/lib/caderno/montar-caderno.ts", "src/lib/generate-assembly-pdf.ts"]) {
      const codigo = readFileSync(arquivo, "utf-8");
      expect(codigo).not.toContain("operationalStatus");
      expect(codigo).not.toMatch(/useMutation|api\.\w+\.(update|registrar|marcar)/);
    }
  });

  it("montar e desenhar não alteram as fontes", () => {
    const f = fontes();
    const antes = JSON.stringify(f);
    desenharCaderno(montarCaderno(f, "equipe"), ctx());
    desenharCaderno(montarCaderno(f, "cliente", { incluirValores: true }), ctx());
    expect(JSON.stringify(f)).toBe(antes);
  });

  it("checkOnAssembly continua sendo só a caixinha de conferência", () => {
    const f = fontes({ itens: [item({ name: "Vasos", quantity: 3, checkOnAssembly: true })] });
    expect(montarCaderno(f, "equipe").carga[0].linhas[0].conferir).toBe(true);
    expect(readFileSync("src/lib/caderno/montar-caderno.ts", "utf-8")).toContain("i.checkOnAssembly");
  });
});

describe("evento antigo e alteração na origem", () => {
  it("evento só com texto no briefing ainda gera caderno, agrupado por categoria", () => {
    const antigo = fontes({ itens: [], fotos: [], planta: null, acervo: [], equipe: [], checklist: [] });
    const c = montarCaderno(antigo, "equipe");
    const titulos = c.carga.map((g) => g.titulo);
    expect(titulos).toEqual(["Flores", "Iluminação", "Mobiliário", "Decoração"]);
    expect(c.carga.every((g) => g.origem === "do briefing")).toBe(true);
    expect(c.carga.find((g) => g.titulo === "Mobiliário")?.linhas.find((l) => l.nome === "Cadeiras para a cerimônia")?.quantidade).toBe("220");
    expect(c.avisos.some((a) => a.onde === "briefing")).toBe(true);
    expect(() => desenharCaderno(c, ctx())).not.toThrow();
  });

  it("texto que não é lista não é descartado: vira bloco, sem o dinheiro", () => {
    const f = fontes({
      itens: [],
      briefing: { furnitureNotes: "Cadeiras douradas, as prateadas ficam de reserva. Aluguel pago à vista." },
    });
    const c = montarCaderno(f, "equipe");
    const bloco = c.carga.find((g) => g.titulo === "Anotações do briefing");
    expect(bloco?.linhas[0].nome).toBe("Cadeiras douradas, as prateadas ficam de reserva.");
  });

  it("evento sem nada não quebra e diz o que falta", () => {
    const vazio: FontesDoCaderno = {
      evento: { name: "Bodas", type: "other", date: "" },
      itens: [],
      fotos: [],
    };
    for (const v of ["cliente", "equipe"] as const) {
      const c = montarCaderno(vazio, v);
      expect(c.avisos.length).toBeGreaterThan(0);
      expect(() => desenharCaderno(c, ctx())).not.toThrow();
    }
  });

  it("mudou a quantidade no item, o próximo caderno sai com a nova", () => {
    const um = montarCaderno(fontes({ itens: [item({ name: "Toalhas", quantity: 27 })] }), "equipe");
    const dois = montarCaderno(fontes({ itens: [item({ name: "Toalhas", quantity: 30 })] }), "equipe");
    expect(um.carga[0].linhas.find((l) => l.nome === "Toalhas")?.quantidade).toBe("27");
    expect(dois.carga[0].linhas.find((l) => l.nome === "Toalhas")?.quantidade).toBe("30");
  });

  it("mudou a data do evento, o cabeçalho muda", () => {
    const c = montarCaderno(fontes({ evento: { ...fontes().evento, date: "2026-11-21" } }), "equipe");
    expect(c.resumo[0].valor).toBe("21/11/2026 · Sábado");
  });
});

describe("o PDF: páginas, imagens ausentes, texto longo, sem botão de tela", () => {
  it("imagem que não carregou some sem quadro vazio e sem \"Adicionar foto\"", () => {
    const c = montarCaderno(fontes(), "cliente");
    const imagens = new Map(urlsDoCaderno(c).map((u) => [u, null]));
    const pdf = textoDoPdf(desenharCaderno(c, ctx(imagens)));
    expect(pdf).not.toMatch(/Adicionar foto|\+ Ficha|clique/i);
  });

  it("com imagem, o papel diz se é CONTRATADO ou REFERÊNCIA VISUAL", () => {
    const f = fontes({
      itens: [
        item({ name: "Arco", ambiente: "Altar", contractedPhotoUrl: "https://x/c.jpg", referencePhotoUrl: "https://x/r.jpg" }),
        item({ name: "Lustre", ambiente: "Altar", referencePhotoUrl: "https://x/r2.jpg" }),
      ],
    });
    const c = montarCaderno(f, "equipe");
    const altar = c.fichas.find((x) => x.titulo === "Altar")!;
    expect(altar.itens.find((i) => i.nome === "Arco")).toMatchObject({ fotoUrl: "https://x/c.jpg", ehReferencia: false });
    expect(altar.itens.find((i) => i.nome === "Lustre")).toMatchObject({ fotoUrl: "https://x/r2.jpg", ehReferencia: true });
    const imagens = new Map(urlsDoCaderno(c).map((u) => [u, { dataUrl: JPEG_1PX, w: 1, h: 1 }]));
    const pdf = textoDoPdf(desenharCaderno(c, ctx(imagens)));
    expect(pdf).toContain("CONTRATADO");
    expect(pdf).toContain("REFER");
  });

  it("muitos itens e nome enorme: várias páginas, todas numeradas", () => {
    const muitos = Array.from({ length: 140 }, (_, i) =>
      item({ name: `Item ${i} ${"com um nome bem comprido ".repeat(i % 7 === 0 ? 8 : 1)}`, quantity: i + 1, ambiente: `Ambiente ${i % 9}` }),
    );
    const c = montarCaderno(fontes({ itens: muitos }), "equipe");
    const doc = desenharCaderno(c, ctx());
    const total = doc.getNumberOfPages();
    expect(total).toBeGreaterThan(3);
    const pdf = textoDoPdf(doc);
    expect(pdf).toContain(`Caderno da equipe · P`);
    expect(pdf).toContain(`gina ${total} de ${total}`);
  });

  it("a marca é a da empresa: nome e cor de Configurações, ALTAR só no rodapé", () => {
    const pdf = textoDoPdf(desenharCaderno(montarCaderno(fontes(), "cliente"), ctx()));
    expect(pdf).toContain("Ateli");
    expect(pdf).toContain("Gerado por ALTAR");
    // Nada do pacote de referência vaza para outra conta.
    expect(pdf).not.toContain("Matheus Admin");
    expect(pdf).not.toContain("casandonointeriorsp");
  });

  it("o selo do PDF é o mesmo do menu", () => {
    const pdf = textoDoPdf(desenharCaderno(montarCaderno(fontes(), "cliente"), ctx()));
    expect(pdf).toContain("PARA OS NOIVOS");
    expect(pdf).toContain("Caderno dos noivos");
  });
});

describe("texto livre sem dinheiro", () => {
  it.each([
    ["no valor de 2800", true],
    ["R$ 2.800,00", true],
    ["2800 reais", true],
    ["O saldo será pago na véspera", true],
    ["entrada de R$ 5.000", true],
    ["custou 2,8k", true],
    ["Arranjos com flores reais e permanentes", false],
    ["Arranjo na entrada principal", false],
    ["1.200 pétalas de rosa", false],
    ["Montagem às 8h do dia 17/10", false],
  ])("%s → fala de dinheiro? %s", (t, esperado) => {
    expect(falaDeDinheiro(t)).toBe(esperado);
  });

  it("parágrafo perde só a frase do dinheiro", () => {
    const r = paragrafoSemValores(NOTAS_DO_CONTRATO);
    expect(r.texto).toContain("As flores nobres serão as disponíveis na época.");
    expect(r.texto).not.toContain("2800");
    expect(r.omitidos).toBe(1);
  });

  it("linha: tira o trecho de valor; se ainda fala de dinheiro, sai inteira", () => {
    expect(linhaSemValores("Bolo cenográfico — R$ 300").texto).toBe("Bolo cenográfico");
    expect(linhaSemValores("Definir o valor do bar").texto).toBeUndefined();
  });

  it("nome de item nunca some, só perde o preço", () => {
    expect(nomeSemValores("Lounge adicional R$ 2.980").texto).toBe("Lounge adicional");
  });
});

describe("leitura do texto do contrato", () => {
  it("lista de ambientes vira chips; parágrafo de atmosfera não", () => {
    expect(lerAmbientesDoTexto("Cerimônia, recepção, Welcome Drink, altar e lounge")).toEqual([
      "Cerimônia",
      "Recepção",
      "Welcome Drink",
      "Altar",
      "Lounge",
    ]);
    expect(lerAmbientesDoTexto("Um fim de tarde romântico, com luz baixa e muitas velas pelo jardim")).toBeNull();
  });

  it("item sem o formato não é descartado", () => {
    const r = lerItensDoTexto("mobiliário: Aparador (x1); Flores da estação; decoração: Velas (x10)");
    expect(r.itens.map((i) => i.nome)).toEqual(["Aparador", "Flores da estação", "Velas"]);
  });
});

describe("de onde vem cada fonte", () => {
  it("planta pronta vence; sem ela, o croqui em imagem; croqui em PDF não", () => {
    expect(plantaDoCaderno([{ status: "done", outputUrl: "p.png", sketchUrl: "c.jpg" }])).toEqual({ url: "p.png", origem: "planta" });
    expect(plantaDoCaderno([{ status: "failed", sketchUrl: "c.jpg", originalSketchFilename: "c.jpg" }])).toEqual({ url: "c.jpg", origem: "croqui" });
    expect(plantaDoCaderno([{ status: "failed", sketchUrl: "c.pdf", originalSketchFilename: "croqui.PDF" }])).toBeNull();
    expect(plantaDoCaderno(undefined)).toBeNull();
  });

  it("reserva de peça excluída do acervo não vira linha sem nome", () => {
    const f = fontesDoCaderno({
      evento: { name: "E", type: "other", date: "2026-10-20" },
      acervo: { reservas: [{ quantidade: 3, item: null }, { quantidade: 2, item: { nome: "Vaso" } }] },
      equipe: [{ member: null }, { scheduledTime: "07h", member: { name: "Ana", role: "Montadora" } }],
    });
    expect(f.acervo).toEqual([{ nome: "Vaso", quantidade: 2, unidade: undefined, saiu: undefined, voltou: undefined, emManutencao: undefined, emLimpeza: undefined, indisponivel: undefined }]);
    expect(f.equipe).toEqual([{ nome: "Ana", funcao: "Montadora", horario: "07h" }]);
  });
});
