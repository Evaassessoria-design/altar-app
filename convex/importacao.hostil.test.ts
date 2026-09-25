import { describe, expect, it } from "vitest";
import {
  analisar,
  detectarSeparador,
  dividirLinha,
  lerArquivo,
  resumir,
} from "./lib/importacaoDeLeads";

// ═════════════════════════════════════════════════════════════════════════════
// O ARQUIVO QUE CHEGA NA NOITE DA LIVE
//
// O importador vai receber o que a plataforma de transmissão exportar, o que
// alguém montou no Excel e o que veio colado de um direct. Nenhum desses é
// "CSV bem formado".
//
// Estes testes são a lista do que já quebrou importador em outros produtos:
// BOM do Excel, ponto e vírgula, aspas, acento, telefone de seis formatos,
// e-mail em maiúscula, linha em branco no meio, coluna a menos.
// ═════════════════════════════════════════════════════════════════════════════

const vazio = { emails: new Set<string>(), telefones: new Set<string>() };

describe("o que o Excel produz de verdade", () => {
  it("BOM no começo do arquivo não esconde a coluna de nome", () => {
    // O Excel salva UTF-8 COM BOM. Sem tratar, o primeiro cabeçalho vira
    // o BOM grudado no primeiro cabeçalho, que deixa de casar com "nome", e
    // coluna de nome" para um arquivo perfeito. É o defeito que mais
    // provavelmente apareceria na noite da live.
    const r = lerArquivo("﻿nome;email\nMarina;m@ex.com");
    expect(r.erro, "o BOM escondeu o cabeçalho").toBeUndefined();
    expect(r.linhas[0].name).toBe("Marina");
  });

  it("CRLF do Windows não deixa `\\r` grudado no último campo", () => {
    const r = lerArquivo("nome;email\r\nMarina;m@ex.com\r\n");
    expect(r.linhas[0].email).toBe("m@ex.com");
  });

  it("linha em branco no meio do arquivo é ignorada, não vira registro", () => {
    const r = lerArquivo("nome;email\nMarina;m@ex.com\n\n\nJoana;j@ex.com");
    expect(r.linhas).toHaveLength(2);
  });

  it("linha com MENOS colunas que o cabeçalho não quebra", () => {
    const r = lerArquivo("nome;email;cidade\nMarina;m@ex.com");
    expect(r.linhas[0].name).toBe("Marina");
    expect(r.linhas[0].cidade).toBeUndefined();
  });

  it("linha com MAIS colunas que o cabeçalho ignora o excedente", () => {
    const r = lerArquivo("nome;email\nMarina;m@ex.com;sobra;mais sobra");
    expect(r.linhas[0].email).toBe("m@ex.com");
  });

  it("acento no cabeçalho e no conteúdo atravessa intacto", () => {
    const r = lerArquivo("Nome;Cidade;Segmento\nJoão Gonçalves;São Paulo;Casamento");
    expect(r.linhas[0].name).toBe("João Gonçalves");
    expect(r.linhas[0].cidade).toBe("São Paulo");
  });
});

describe("separadores e aspas", () => {
  it("CSV internacional com vírgula", () => {
    const r = lerArquivo("name,email,city\nMarina,m@ex.com,London");
    expect(r.erro).toBeUndefined();
    expect(r.linhas[0]).toMatchObject({ name: "Marina", email: "m@ex.com", cidade: "London" });
  });

  it("um campo com vírgula dentro de aspas não vira duas colunas", () => {
    const r = lerArquivo('nome,email\n"Silva, Maria",m@ex.com');
    expect(r.linhas[0].name).toBe("Silva, Maria");
    expect(r.linhas[0].email).toBe("m@ex.com");
  });

  it("aspas escapadas viram uma aspa só", () => {
    expect(dividirLinha('"a""b";c', ";")).toEqual(['a"b', "c"]);
  });

  it("uma linha sem separador nenhum é uma coluna só", () => {
    expect(detectarSeparador("nome")).toBe(";");
    expect(dividirLinha("Marina", ";")).toEqual(["Marina"]);
  });
});

describe("telefone nos formatos que aparecem", () => {
  const comTelefone = (t: string) =>
    analisar([{ linha: 2, name: "Marina", whatsapp: t }], vazio)[0];

  it("formatado, sem DDI, com DDI e com +55 são a MESMA pessoa", () => {
    // Todos normalizam para E.164. Se um deles escapasse, a mesma decoradora
    // entraria duas vezes na lista e receberia a mesma mensagem duas vezes.
    const jaTem = { emails: new Set<string>(), telefones: new Set(["+5511999998888"]) };
    for (const formato of [
      "(11) 99999-8888",
      "11999998888",
      "5511999998888",
      "+55 11 99999-8888",
      "+5511999998888",
    ]) {
      const s = analisar([{ linha: 2, name: "Marina", whatsapp: formato }], jaTem)[0];
      expect(s.tipo, `${formato} não foi reconhecido como já cadastrado`).toBe("duplicada");
    }
  });

  it("telefone ilegível não impede o cadastro quando há e-mail", () => {
    // O telefone é opcional. Recusar a linha inteira por causa dele perderia
    // uma decoradora por um campo que nem era obrigatório.
    const s = analisar([{ linha: 2, name: "Marina", email: "m@ex.com", whatsapp: "abc" }], vazio)[0];
    expect(s.tipo).toBe("nova");
  });

  it("mas telefone ilegível SEM e-mail não vira contato inalcançável", () => {
    expect(comTelefone("abc").tipo).toBe("nova");
  });
});

describe("e-mail", () => {
  it("maiúscula é a mesma pessoa que minúscula", () => {
    const jaTem = { emails: new Set(["marina@ex.com"]), telefones: new Set<string>() };
    const s = analisar([{ linha: 2, name: "Marina", email: "MARINA@EX.COM" }], jaTem)[0];
    expect(s.tipo).toBe("duplicada");
  });

  it("espaço em volta não cria um segundo cadastro", () => {
    const s = analisar(
      [
        { linha: 2, name: "A", email: "m@ex.com" },
        { linha: 3, name: "B", email: "  m@ex.com  " },
      ],
      vazio,
    );
    expect(s[1].tipo).toBe("duplicada");
  });
});

describe("arquivos ruins não derrubam nem mentem", () => {
  it("texto que não é CSV nenhum recusa com recado, não com exceção", () => {
    const r = lerArquivo("isto aqui é só um texto solto\nsem cabeçalho nenhum");
    expect(r.erro).toMatch(/nome/i);
    expect(r.linhas).toEqual([]);
  });

  it("só separadores não inventa linhas", () => {
    const r = lerArquivo(";;;\n;;;");
    expect(r.erro).toBeTruthy();
  });

  it("coluna desconhecida é NOMEADA, não descartada em silêncio", () => {
    // Quem exportou a planilha reconhece o nome da coluna e entende o que
    // ficou de fora. "Algumas colunas foram ignoradas" não ajuda ninguém.
    const r = lerArquivo("nome;email;score interno;tags\nMarina;m@ex.com;9;vip");
    expect(r.ignoradas).toEqual(expect.arrayContaining(["score interno", "tags"]));
  });
});

describe("volume", () => {
  const arquivoCom = (n: number) =>
    ["nome;email", ...Array.from({ length: n }, (_, i) => `Pessoa ${i};p${i}@ex.com`)].join("\n");

  it("200 registros entram inteiros", () => {
    const r = lerArquivo(arquivoCom(200));
    expect(r.linhas).toHaveLength(200);
    expect(resumir(analisar(r.linhas, vazio)).novas).toBe(200);
  });

  it("500 registros também", () => {
    const r = lerArquivo(arquivoCom(500));
    expect(r.linhas).toHaveLength(500);
  });

  it("acima do teto o arquivo é CORTADO, e o corte é declarado", () => {
    // Mil é o teto. Passar disso sem avisar faria a tela dizer "1000
    // importados" de um arquivo com 1500 — e as 500 que faltam só
    // apareceriam quando alguém reclamasse de não ter sido contactada.
    const r = lerArquivo(arquivoCom(1500));
    expect(r.linhas).toHaveLength(1000);
    expect(r.truncado, "o corte não foi declarado").toBe(true);
  });

  it("dentro do teto, nada é declarado como cortado", () => {
    expect(lerArquivo(arquivoCom(10)).truncado).toBe(false);
  });
});
