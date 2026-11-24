import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  linkDeWhatsapp,
  primeiroNome,
  textoDaParcela,
  textoDaPendencia,
} from "./whatsapp";

// ═════════════════════════════════════════════════════════════════════════════
// O ATALHO QUE ABRE A CONVERSA CERTA
//
// O defeito que motivou o módulo: `wa.me/55${telefone.replace(/\D/g, "")}`
// estava copiado em quatro telas, e quem salvou o telefone como
// "+55 11 99999-9999" virava `5555119999999999`. O atalho abria o WhatsApp num
// número que não existe, sem erro e sem aviso.
//
// O que estes testes protegem:
//
//  · número que já tem DDI não ganha um segundo;
//  · DDD 55 (Santa Maria) continua ganhando o DDI — é tamanho, não prefixo;
//  · número curto demais não vira link (botão nenhum é melhor que botão quebrado);
//  · o texto vai codificado, e sem nome a saudação não diz "undefined";
//  · sem prazo a mensagem não inventa urgência.
// ═════════════════════════════════════════════════════════════════════════════

describe("linkDeWhatsapp", () => {
  it("telefone brasileiro comum ganha o DDI", () => {
    expect(linkDeWhatsapp("(11) 99999-8888")).toBe("https://wa.me/5511999998888");
    expect(linkDeWhatsapp("11999998888")).toBe("https://wa.me/5511999998888");
  });

  it("telefone que JÁ veio com DDI não ganha outro — era o defeito", () => {
    expect(linkDeWhatsapp("+55 11 99999-8888")).toBe("https://wa.me/5511999998888");
    expect(linkDeWhatsapp("5511999998888")).toBe("https://wa.me/5511999998888");
    // Fixo com DDI: 12 dígitos.
    expect(linkDeWhatsapp("+55 11 3333-4444")).toBe("https://wa.me/551133334444");
  });

  it("DDD 55 não é DDI: Santa Maria continua precisando do 55 na frente", () => {
    // 11 dígitos começando com 55 é DDD 55 + celular — e sem DDI o link abre
    // um número de outro país.
    expect(linkDeWhatsapp("(55) 99999-8888")).toBe("https://wa.me/5555999998888");
  });

  it("número curto demais, vazio ou ausente não vira link", () => {
    expect(linkDeWhatsapp("99999-8888")).toBeNull(); // sem DDD
    expect(linkDeWhatsapp("")).toBeNull();
    expect(linkDeWhatsapp(undefined)).toBeNull();
    expect(linkDeWhatsapp(null)).toBeNull();
    // Texto sem dígito nenhum: "a confirmar" no lugar do telefone.
    expect(linkDeWhatsapp("a confirmar")).toBeNull();
  });

  it("o texto vai codificado, e texto em branco não deixa `?text=` vazio", () => {
    const url = linkDeWhatsapp("11999998888", "Oi Marina! Tudo bem?");
    expect(url).toBe("https://wa.me/5511999998888?text=Oi%20Marina!%20Tudo%20bem%3F");
    expect(linkDeWhatsapp("11999998888", "   ")).toBe("https://wa.me/5511999998888");
  });
});

describe("primeiroNome", () => {
  it("usa só o primeiro, e aguenta ausência", () => {
    expect(primeiroNome("Marina Silva Costa")).toBe("Marina");
    expect(primeiroNome("  Marina  ")).toBe("Marina");
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome(undefined)).toBe("");
  });
});

describe("a mensagem da pendência", () => {
  it("diz o combinado e o prazo", () => {
    const t = textoDaPendencia({
      cliente: "Marina Silva",
      evento: "Casamento Marina e João",
      texto: "mandar a lista de convidados",
      prazo: "28/11",
    });
    expect(t).toContain("Oi Marina!");
    expect(t).toContain("mandar a lista de convidados");
    expect(t).toContain("até 28/11");
  });

  it("SEM prazo não inventa urgência", () => {
    const t = textoDaPendencia({
      cliente: "Marina",
      evento: "Casamento",
      texto: "escolher o bolo",
    });
    expect(t).not.toContain("até");
    expect(t).not.toMatch(/urgente|quanto antes|hoje/i);
  });

  it("sem nome da cliente a saudação continua inteira", () => {
    const t = textoDaPendencia({ cliente: "", evento: "Casamento", texto: "x" });
    expect(t.startsWith("Oi! ")).toBe(true);
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("Oi !");
  });
});

describe("a mensagem da parcela", () => {
  it("cobra o valor que chegou pronto, e pede o comprovante", () => {
    const t = textoDaParcela({
      cliente: "Marina Silva",
      evento: "Casamento Marina e João",
      descricao: "2ª parcela",
      valor: "R$ 1.500,00",
      vencimento: "20/11/2026",
    });
    expect(t).toContain("Oi Marina!");
    expect(t).toContain("R$ 1.500,00");
    expect(t).toContain("20/11/2026");
    expect(t).toContain("comprovante");
  });

  it("o módulo não formata dinheiro nem data por conta própria", () => {
    // A segunda verdade sobre dinheiro é a pior de todas: valor e vencimento
    // chegam prontos de quem conhece o centavo e o fuso.
    const fonte = readFileSync("src/lib/whatsapp.ts", "utf-8");
    expect(fonte).not.toContain("toLocaleString");
    expect(fonte).not.toContain("toFixed");
    expect(fonte).not.toContain("new Date(");
  });
});

describe("o atalho não é envio", () => {
  it("nenhuma função daqui chama a rede", () => {
    const fonte = readFileSync("src/lib/whatsapp.ts", "utf-8");
    expect(fonte).not.toContain("fetch(");
    expect(fonte).not.toContain("XMLHttpRequest");
  });

  it("nenhuma tela do aplicativo monta `wa.me` com 55 na mão", () => {
    // A cópia é o defeito: quem escrever `wa.me/55${...}` de novo repete o
    // bug do telefone com DDI. A Central e o painel admin têm regra própria
    // (valor do canal já internacional) e ficam de fora desta trava.
    const EXCECOES = ["admin", "campanha", "central"];
    const telas: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const caminho = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (!EXCECOES.includes(e.name)) varrer(caminho);
        } else if (e.name.endsWith(".tsx")) {
          telas.push(caminho);
        }
      }
    };
    varrer("src/pages");
    varrer("src/components");

    // Sem comentários: as telas migradas EXPLICAM em prosa o padrão que
    // deixaram de usar, e a prosa cita o padrão. É a sexta vez que uma trava
    // de leitura de fonte deste repositório tropeça no próprio comentário —
    // mesma correção de `arquitetura-sem-paralelos` e de `agenda`.
    const semComentarios = (fonte: string) =>
      fonte
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");

    const culpadas = telas.filter((t) =>
      /wa\.me\/(55)?\$\{/.test(semComentarios(readFileSync(t, "utf-8"))),
    );
    expect(
      culpadas.length === 0
        ? "nenhuma"
        : `monta wa.me à mão em vez de usar linkDeWhatsapp: ${culpadas.join(", ")}`,
    ).toBe("nenhuma");
  });
});

describe("onde a cobrança aparece nas telas", () => {
  const semComentarios = (fonte: string) =>
    fonte
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  const painel = semComentarios(readFileSync("src/pages/app/dashboard/page.tsx", "utf-8"));
  const parcelas = semComentarios(
    readFileSync("src/pages/app/events/[id]/_components/pagamentos-da-cliente.tsx", "utf-8"),
  );

  it("o painel só oferece o atalho quando há link — e diz para QUEM está mandando", () => {
    // `linkDeWhatsapp` devolve `null` sem telefone utilizável, e a linha testa
    // isso antes de desenhar: `{cobrar && ...}`.
    expect(painel).toContain("const cobrar = linkDeWhatsapp(");
    expect(painel).toContain("{cobrar && (");
    // O rótulo nomeia a destinatária: a pendência pode ser do florista, e um
    // botão anônimo faria ela mandar a cobrança para a pessoa errada.
    expect(painel).toContain("Cobrar ${primeiroNome(p.clienteNome)} no WhatsApp");
  });

  it("a linha do painel não é um link dentro de outro", () => {
    // Link dentro de link não é HTML válido, e no celular o toque acerta o
    // errado. O `a` do WhatsApp é IRMÃO do `Link` da reunião.
    const bloco = painel.slice(painel.indexOf("stats.pendenciasDeReuniao.map"));
    const linha = bloco.slice(0, bloco.indexOf("</div>"));
    expect(linha).not.toMatch(/<Link[\s\S]*<a\s/);
  });

  it("a parcela cobra o SALDO, e só quando está atrasada", () => {
    // As duas regras de dinheiro desta tela, juntas numa linha de teste:
    // atraso decide se o botão existe, e o saldo decide quanto ele cobra.
    expect(parcelas).toContain("{atrasada && cliente && (() => {");
    expect(parcelas).toContain("valor: reais(saldo)");
    // O valor cheio da parcela NÃO entra na mensagem.
    const bloco = parcelas.slice(parcelas.indexOf("textoDaParcela({"));
    expect(bloco.slice(0, bloco.indexOf("})"))).not.toContain("p.amount");
  });

  it("nenhuma das duas telas ganhou chamada de rede para cobrar", () => {
    // O atalho abre o WhatsApp DELA. Envio automático continua sendo
    // exclusividade de `communicationsOutbox`, que está fechado.
    for (const fonte of [painel, parcelas]) {
      expect(fonte).not.toContain("communicationsOutbox");
      expect(fonte).not.toContain("fetch(");
    }
  });
});
