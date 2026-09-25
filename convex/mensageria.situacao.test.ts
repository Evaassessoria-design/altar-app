import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  recadoSobreEnvio,
  situacaoDoCanal,
  type FatosDoCanal,
} from "./lib/channels/situacao";

// ═════════════════════════════════════════════════════════════════════════════
// EM QUE PÉ ESTÁ CADA CANAL
//
// Estes testes existem por causa de um erro que um booleano torna inevitável:
// `configurado ✓` aparece igual para "tem credencial e o portão está fechado"
// e para "manda mensagem de verdade". Alguém lê o mesmo tique nos dois e
// conclui que o WhatsApp funciona.
//
// Na noite da live, isso vira trinta mensagens que ninguém mandou e ninguém
// recebeu — e o erro só aparece quando alguém reclama de não ter sido avisada.
// ═════════════════════════════════════════════════════════════════════════════

const fatos = (over: Partial<FatosDoCanal> = {}): FatosDoCanal => ({
  canal: "whatsapp",
  temAdaptador: true,
  credenciais: true,
  envioHabilitado: false,
  ...over,
});

describe("os cinco estados são distinguíveis", () => {
  it("sem adaptador: não configurado, e não recebe nem envia", () => {
    const r = situacaoDoCanal(fatos({ temAdaptador: false, credenciais: false }));
    expect(r.situacao).toBe("nao_configurado");
    expect(r.recebe).toBe(false);
    expect(r.envia).toBe(false);
  });

  it("sem credencial: não configurado, e a porta de ENTRADA também fica fechada", () => {
    // Sem credencial não há como validar a assinatura de quem chega, e aceitar
    // sem validar é aceitar qualquer um.
    const r = situacaoDoCanal(fatos({ credenciais: false }));
    expect(r.situacao).toBe("nao_configurado");
    expect(r.recebe, "aceitar sem poder validar é aceitar qualquer um").toBe(false);
  });

  it("com credencial e portão fechado: RECEBE e não envia", () => {
    // É o estado real do ALTAR hoje, e o mais importante de não confundir com
    // "funcionando".
    const r = situacaoDoCanal(fatos({ credenciais: true, envioHabilitado: false }));
    expect(r.situacao).toBe("configurado");
    expect(r.recebe).toBe(true);
    expect(r.envia).toBe(false);
    expect(r.rotulo).toMatch(/só recebe/i);
  });

  it("portão aberto e nada entregue ainda: homologando, nunca ativo", () => {
    const r = situacaoDoCanal(fatos({ envioHabilitado: true, entregasComSucesso: 0 }));
    expect(r.situacao).toBe("homologando");
    expect(r.proximoPasso).toMatch(/teste/i);
  });

  it("portão aberto e entrega NÃO MEDIDA também é homologando", () => {
    // `undefined` não é zero. Zero é "tentamos e nunca deu certo"; ausente é
    // "ninguém contou". Nenhum dos dois é "ativo" — a tela não afirma o que
    // não sabe, inclusive sobre a própria infraestrutura.
    const r = situacaoDoCanal(fatos({ envioHabilitado: true }));
    expect(r.situacao).toBe("homologando");
    expect(r.detalhe).toMatch(/não há medição/i);
  });

  it("com entrega bem-sucedida: ativo, com o número na frase", () => {
    const r = situacaoDoCanal(
      fatos({ envioHabilitado: true, entregasComSucesso: 12, ultimaEntrega: 1000 }),
    );
    expect(r.situacao).toBe("ativo");
    expect(r.detalhe).toContain("12");
    expect(r.proximoPasso, "ativo não tem próximo passo").toBeUndefined();
  });
});

describe("a falha recente manda no rótulo", () => {
  it("última tentativa quebrada NÃO é 'ativo'", () => {
    // Dizer "ativo" com a última tentativa quebrada é a informação mais cara
    // de todas, porque é a que faz ninguém ir olhar.
    const r = situacaoDoCanal(
      fatos({
        envioHabilitado: true,
        entregasComSucesso: 40,
        ultimaEntrega: 100,
        ultimaFalha: { quando: 200, motivo: "Canal recusou (401)." },
      }),
    );
    expect(r.situacao).toBe("erro");
    expect(r.envia, "com erro, não se promete envio").toBe(false);
    expect(r.detalhe).toContain("401");
  });

  it("falha ANTIGA, com entrega depois, volta a ser ativo", () => {
    const r = situacaoDoCanal(
      fatos({
        envioHabilitado: true,
        entregasComSucesso: 40,
        ultimaEntrega: 300,
        ultimaFalha: { quando: 200, motivo: "erro antigo" },
      }),
    );
    expect(r.situacao).toBe("ativo");
  });

  it("falha com o portão FECHADO não vira 'erro'", () => {
    // O portão fechado é a causa; chamar isso de erro mandaria alguém procurar
    // defeito numa política deliberada.
    const r = situacaoDoCanal(
      fatos({ envioHabilitado: false, ultimaFalha: { quando: 5, motivo: "qualquer coisa" } }),
    );
    expect(r.situacao).toBe("configurado");
  });

  it("falha sem credencial também não vira 'erro'", () => {
    const r = situacaoDoCanal(
      fatos({ credenciais: false, ultimaFalha: { quando: 5, motivo: "x" } }),
    );
    expect(r.situacao).toBe("nao_configurado");
  });
});

describe("o recado para quem pergunta se o ALTAR manda WhatsApp", () => {
  it("quando nada envia, a frase diz exatamente isso", () => {
    const leituras = [
      situacaoDoCanal(fatos({ canal: "whatsapp" })),
      situacaoDoCanal(fatos({ canal: "email", credenciais: false })),
    ];
    const recado = recadoSobreEnvio(leituras);
    expect(recado).toMatch(/não envia mensagem para ninguém/i);
    expect(recado).toMatch(/quem envia é você/i);
  });

  it("a frase nunca promete prazo", () => {
    // "Em breve" sem data é o que faz alguém assinar esperando algo que não
    // existe.
    const recado = recadoSobreEnvio([situacaoDoCanal(fatos())]);
    for (const promessa of ["em breve", "logo", "próxima versão", "estamos trabalhando"]) {
      expect(recado.toLowerCase()).not.toContain(promessa);
    }
  });
});

describe("a consulta não fala com ninguém", () => {
  it("nem a regra nem a consulta fazem chamada externa", () => {
    // "Testar a conexão" a partir de uma query seria uma chamada ao provedor
    // disparada por qualquer abertura de tela.
    for (const arquivo of ["convex/lib/channels/situacao.ts", "convex/mensageria.ts"]) {
      const codigo = readFileSync(arquivo, "utf-8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(codigo, `${arquivo} aprendeu a fazer fetch`).not.toContain("fetch(");
      expect(codigo, `${arquivo} aprendeu a agendar`).not.toContain("scheduler");
    }
  });
});
