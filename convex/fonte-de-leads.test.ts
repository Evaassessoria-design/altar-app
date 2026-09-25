import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FONTES,
  fontesConfiguradas,
  fraseDaQualificacao,
  qualificar,
  recadoSobreFontes,
  resumirQualificacao,
  type BaseConhecida,
  type CandidatoALead,
} from "./lib/escritorio/fonteDeLeads";

// ═════════════════════════════════════════════════════════════════════════════
// DE ONDE VÊM LEADS NOVOS
//
// Um contrato, não uma integração. O que estes testes guardam é a honestidade
// dele: nenhuma fonte ligada, nenhuma chamada de rede, e nenhuma qualificação
// que invente fato sobre alguém.
//
// A razão de não inventar não é só legal: um contato inventado que dá errado
// queima o número de quem manda, e o número é o ativo da campanha inteira.
// ═════════════════════════════════════════════════════════════════════════════

const vazia: BaseConhecida = { emails: new Set(), telefones: new Set() };
const c = (over: Partial<CandidatoALead> = {}): CandidatoALead => ({
  nome: "Marina Alves",
  whatsapp: "(11) 99990-0042",
  ...over,
});

describe("o contrato é honesto sobre o que existe", () => {
  it("nenhuma fonte está ligada, e o recado diz isso", () => {
    expect(FONTES).toHaveLength(0);
    expect(fontesConfiguradas()).toHaveLength(0);
    const r = recadoSobreFontes();
    expect(r).toMatch(/nenhuma fonte de leads conectada/i);
    // E diz por onde as pessoas ENTRAM de verdade hoje.
    expect(r).toMatch(/landing/i);
    expect(r).toMatch(/importação|digitados/i);
  });

  it("o módulo não sabe fazer chamada de rede nenhuma", () => {
    // Um contrato que já soubesse buscar seria uma integração disfarçada.
    const codigo = readFileSync("convex/lib/escritorio/fonteDeLeads.ts", "utf-8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    for (const proibido of ["fetch(", "axios", "puppeteer", "cheerio", "ctx.", "process.env"]) {
      expect(codigo, `o contrato aprendeu a ${proibido}`).not.toContain(proibido);
    }
  });

  it("a importação de CSV NÃO é registrada como fonte", () => {
    // Ela recebe um arquivo que uma pessoa escolheu; não busca nada.
    // Registrá-la daria a impressão de que o sistema procura leads sozinho.
    expect(FONTES.map((f) => f.id)).not.toContain("csv");
  });
});

describe("qualificar", () => {
  it("aprova quem tem nome e contato utilizável", () => {
    const q = qualificar(c({ empresa: "Ateliê Alba", cidade: "São Paulo", estado: "SP" }), vazia);
    expect(q.aprovado).toBe(true);
    expect(q.whatsappE164).toBe("+5511999900042");
    expect(q.porque).toContain("Ateliê Alba");
    expect(q.porque).toContain("São Paulo/SP");
  });

  it("o PORQUÊ é fato entregue pela fonte, nunca inferência", () => {
    // Um score diria "73" e ninguém saberia o que fazer com isso. Uma frase
    // diz "faz 40 eventos por ano", e a decisão sai sozinha.
    const q = qualificar(c({ eventosPorAno: 40 }), vazia);
    expect(q.porque[0]).toBe("40 eventos por ano");

    // Sem porte informado, nada sobre porte é dito.
    const semPorte = qualificar(c(), vazia);
    expect(semPorte.porque.join(" ")).not.toMatch(/eventos por ano/);
  });

  it("recusa sem nome antes de tudo — nem abordar nem reconhecer depois", () => {
    const q = qualificar(c({ nome: "   " }), vazia);
    expect(q.aprovado).toBe(false);
    expect(q.recusa).toBe("sem_nome");
  });

  it("recusa sem contato nenhum", () => {
    const q = qualificar({ nome: "Sem Nada" }, vazia);
    expect(q.recusa).toBe("sem_contato");
  });

  it("recusa telefone ilegível quando não há e-mail", () => {
    // A pessoa entraria e ocuparia lugar na fila sem poder ser alcançada.
    const q = qualificar(c({ whatsapp: "não sei o número" }), vazia);
    expect(q.recusa).toBe("contato_ilegivel");
  });

  it("mas telefone ilegível COM e-mail passa", () => {
    const q = qualificar(c({ whatsapp: "abc", email: "marina@exemplo.com.br" }), vazia);
    expect(q.aprovado).toBe(true);
    expect(q.whatsappE164).toBeUndefined();
    expect(q.emailNormalizado).toBe("marina@exemplo.com.br");
  });

  it("duplicata por TELEFONE, mesmo em outro formato", () => {
    const base: BaseConhecida = {
      emails: new Set(),
      telefones: new Set(["+5511999900042"]),
    };
    expect(qualificar(c({ whatsapp: "+55 11 99990-0042" }), base).recusa).toBe("ja_cadastrado");
  });

  it("duplicata por E-MAIL, ignorando maiúsculas", () => {
    const base: BaseConhecida = {
      emails: new Set(["marina@exemplo.com.br"]),
      telefones: new Set(),
    };
    const q = qualificar(
      { nome: "Marina", email: "MARINA@EXEMPLO.COM.BR" },
      base,
    );
    expect(q.recusa).toBe("ja_cadastrado");
  });

  it("duplicata é o caso BOM — significa que a base já tinha a pessoa", () => {
    // Por isso ela vem por último na ordem das recusas, e por isso a frase do
    // resumo a nomeia em vez de somá-la a "ignorados".
    const base: BaseConhecida = { emails: new Set(), telefones: new Set(["+5511999900042"]) };
    const r = resumirQualificacao([qualificar(c(), base)]);
    expect(r.porRecusa.ja_cadastrado).toBe(1);
    expect(fraseDaQualificacao(r)).toMatch(/1 já cadastrados/);
  });
});

describe("o resumo nomeia cada recusa", () => {
  it('nunca diz "alguns registros foram ignorados"', () => {
    // Quem importou 200 e viu 140 entrarem precisa saber onde foram os 60 —
    // senão conclui que o importador perdeu registros.
    const r = resumirQualificacao([
      qualificar(c(), vazia),
      qualificar(c({ nome: "" }), vazia),
      qualificar({ nome: "Sem Contato" }, vazia),
      qualificar(c({ whatsapp: "xxx" }), vazia),
    ]);
    const frase = fraseDaQualificacao(r);
    expect(frase).toContain("1 de 4 podem entrar");
    expect(frase).toMatch(/1 sem nome/);
    expect(frase).toMatch(/1 sem contato/);
    expect(frase).toMatch(/1 com contato ilegível/);
    expect(frase).not.toMatch(/ignorad/i);
  });

  it("lista vazia não inventa número", () => {
    const r = resumirQualificacao([]);
    expect(r.analisados).toBe(0);
    expect(fraseDaQualificacao(r)).toMatch(/nenhum candidato/i);
  });
});
