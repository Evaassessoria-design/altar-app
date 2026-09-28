import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mensagemDeErroDeAutenticacao } from "./erro-de-autenticacao.ts";
import { mensagemSeguraDoErro } from "./mensagem-segura.ts";

describe("erro de autenticação chega em português", () => {
  it("traduz pelo código do Better Auth", () => {
    expect(mensagemDeErroDeAutenticacao({ code: "INVALID_EMAIL_OR_PASSWORD" }, "entrar"))
      .toBe("E-mail ou senha inválidos.");
    expect(mensagemDeErroDeAutenticacao({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }, "cadastrar"))
      .toMatch(/Já existe uma conta/);
  });

  it("código desconhecido cai na frase do contexto — nunca no texto cru", () => {
    for (const erro of [{ code: "ALGO_NOVO" }, {}, null, undefined]) {
      expect(mensagemDeErroDeAutenticacao(erro, "entrar")).toBe(
        "Não foi possível entrar. Confira e-mail e senha.",
      );
    }
  });

  it("excesso de tentativas é dito como tal", () => {
    expect(mensagemDeErroDeAutenticacao({ status: 429 }, "entrar")).toMatch(/Muitas tentativas/);
  });

  it("na troca de senha, 'senha incorreta' diz qual: a atual", () => {
    expect(mensagemDeErroDeAutenticacao({ code: "INVALID_PASSWORD" }, "trocar_senha"))
      .toBe("A senha atual não confere.");
  });

  it("nenhuma tela de autenticação volta a mostrar error.message", () => {
    for (const arquivo of [
      "src/pages/auth/Login.tsx",
      "src/pages/auth/ResetPassword.tsx",
      "src/pages/app/configuracoes/page.tsx",
      "src/components/ui/signin.tsx",
    ]) {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte, arquivo).not.toMatch(/toast\.error\(error\.message/);
    }
  });
});

describe("a tela de erro só mostra o que o ALTAR escreveu", () => {
  it("ConvexError nosso (código + mensagem) atravessa", () => {
    expect(
      mensagemSeguraDoErro({ data: { code: "NOT_FOUND", message: "Evento não encontrado" } }),
    ).toBe("Evento não encontrado");
  });

  it.each([
    new TypeError("Cannot read properties of undefined (reading 'map')"),
    new Error("[CONVEX Q(dashboard:getAttentionBoard)] [Request ID: abc] Server Error"),
    { data: "Server Error" },
    { data: { message: "sem código não é nosso" } },
    { data: { code: "X", message: "x".repeat(400) } },
    null,
    "texto solto",
  ])("%o NÃO vai para a tela", (erro) => {
    expect(mensagemSeguraDoErro(erro)).toBeNull();
  });
});
