import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexError } from "convex/values";
import { assertDemoFlag, isDemoEnvFlagSet } from "./lib/demoGuard";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — a redefinição de senha do demo NÃO pode rodar fora do demo.
//
// `resetDemoPassword` contorna a validação do token de e-mail do Better Auth,
// porque o endereço do demo é fictício e o e-mail nunca chega. Esse atalho só
// é aceitável porque o ambiente é travado. Se a trava afrouxar, o atalho vira
// uma forma de trocar a senha de qualquer conta — inclusive em produção.
//
// A `action` em si não roda sob convex-test (o componente do Better Auth não
// fica registrado no ambiente de teste), então provamos duas coisas: a trava
// pura falha corretamente, e o código a aplica ANTES de qualquer outra coisa.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE = readFileSync(join(__dirname, "demoAuth.ts"), "utf8");

/**
 * O arquivo SEM as linhas de comentário.
 *
 * O cabeçalho do módulo descreve o mecanismo em prosa e cita `ctx.db` e
 * `updatePassword` para explicar o que faz e o que evita. Um guarda que lesse
 * o arquivo inteiro estaria julgando a documentação, não o código — e foi
 * exatamente o que aconteceu na primeira versão destes testes.
 */
const CODIGO = FONTE.split("\n")
  .filter((linha) => !/^\s*(\/\/|\*|\/\*)/.test(linha))
  .join("\n");

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

describe("a trava de ambiente recusa tudo que não seja o demo", () => {
  it.each([
    ["variável ausente", undefined],
    ["vazia", ""],
    ['"0"', "0"],
    ['"true"', "true"],
    ['"sim"', "sim"],
    ['" 1" com espaço', " 1"],
    ['"1 " com espaço', "1 "],
    ['"01"', "01"],
  ])("bloqueia com ALTAR_DEMO %s", (_rotulo, valor) => {
    if (valor === undefined) delete process.env.ALTAR_DEMO;
    else process.env.ALTAR_DEMO = valor;

    expect(isDemoEnvFlagSet()).toBe(false);
    expect(() => assertDemoFlag()).toThrow(ConvexError);
  });

  it('libera SOMENTE com exatamente "1"', () => {
    process.env.ALTAR_DEMO = "1";
    expect(isDemoEnvFlagSet()).toBe(true);
    expect(() => assertDemoFlag()).not.toThrow();
  });

  it("o erro diz o que fazer e avisa para nunca ligar isso em produção", () => {
    delete process.env.ALTAR_DEMO;
    try {
      assertDemoFlag();
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      const dados = (e as ConvexError<{ code: string; message: string }>).data;
      expect(dados.code).toBe("DEMO_ONLY");
      expect(dados.message).toContain("ALTAR_DEMO=1");
      expect(dados.message).toContain("NUNCA");
    }
  });
});

describe("a ação aplica a trava antes de qualquer coisa", () => {
  it("a primeira instrução do handler é a trava de ambiente", () => {
    const corpo = CODIGO.slice(CODIGO.indexOf("handler: async ("));
    const trava = corpo.indexOf("assertDemoFlag()");
    expect(trava).toBeGreaterThan(-1);

    // Nada pode acontecer antes: nem leitura, nem construção do Better Auth.
    for (const antes of ["ctx.runQuery", "createAuth(", "internalAdapter", "password.hash"]) {
      const pos = corpo.indexOf(antes);
      expect(pos, `"${antes}" aparece antes da trava de ambiente`).toBeGreaterThan(trava);
    }
  });

  it("aplica também a segunda camada, de sinais de produção", () => {
    expect(CODIGO).toContain("internal.demo.checkEnvironment");
    const camada2 = CODIGO.indexOf("internal.demo.checkEnvironment");
    const escrita = CODIGO.indexOf("updatePassword");
    expect(camada2).toBeLessThan(escrita);
  });

  it("é internalAction — inalcançável pelo navegador", () => {
    expect(FONTE).toContain("internalAction({");
    expect(CODIGO).not.toContain("= action({");
    expect(CODIGO).not.toMatch(/\bmutation\(\{/);
  });
});

describe("usa o mecanismo oficial do Better Auth", () => {
  it("hash pelo próprio Better Auth — nunca senha em texto puro", () => {
    expect(FONTE).toContain("context.password.hash(senha)");
    expect(FONTE).toContain("context.internalAdapter.updatePassword(user.id, hash)");
  });

  it("não escreve direto em tabela de autenticação", () => {
    // As tabelas do componente não são alcançáveis por `ctx.db`, e tentar
    // contornar isso seria reimplementar o contrato interno do Better Auth.
    expect(CODIGO).not.toContain("ctx.db");
    expect(CODIGO).not.toContain('"account"');
  });

  it("honra revokeSessionsOnPasswordReset, como o endpoint oficial", () => {
    expect(FONTE).toContain("revokeSessionsOnPasswordReset");
    expect(FONTE).toContain("deleteUserSessions");
  });
});

describe("o que a ação NÃO faz", () => {
  it.each([
    ["criar usuário", /createUser|internalAdapter\.create(?!Account)/],
    ["criar conta de login", /createAccount/],
    ["apagar dado de negócio", /\.delete\(|deleteMany|db\.delete/],
    ["mexer em evento", /events|eventId/],
    ["mudar id", /userId:\s|\.id\s*=/],
  ])("não %s", (_rotulo, padrao) => {
    expect(CODIGO).not.toMatch(padrao);
  });

  it("nunca devolve a senha nem o hash", () => {
    const retorno = CODIGO.slice(CODIGO.indexOf("return { ok: true"));
    expect(retorno).not.toContain("hash");
    expect(retorno).not.toContain("senha");
    expect(retorno).not.toContain("password");
  });

  it("exige que a conta JÁ tenha login por senha", () => {
    // Criar um account "credential" onde não havia seria fabricar uma forma
    // de acesso que a conta nunca teve.
    expect(FONTE).toContain('c.providerId === "credential"');
    expect(FONTE).toContain("Nada foi alterado.");
  });
});

describe("a consulta de conferência é somente leitura", () => {
  const DEMO = readFileSync(join(__dirname, "demo.ts"), "utf8");
  const bloco = DEMO.slice(
    DEMO.indexOf("export const contaDoDemo"),
    DEMO.indexOf("export const seed"),
  );

  it("é internalQuery e passa pela trava do demo", () => {
    expect(bloco).toContain("internalQuery({");
    expect(bloco).toContain("assertDemoEnvironment(ctx)");
  });

  it("não escreve nada", () => {
    for (const escrita of ["db.insert", "db.patch", "db.replace", "db.delete"]) {
      expect(bloco).not.toContain(escrita);
    }
  });
});
