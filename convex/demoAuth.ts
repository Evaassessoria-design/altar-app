import { v, ConvexError } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createAuth } from "./auth";
import { assertDemoFlag } from "./lib/demoGuard";

// ─────────────────────────────────────────────────────────────────────────────
// REDEFINIR A SENHA DA CONTA DE DEMONSTRAÇÃO
//
// ── ONDE A CREDENCIAL MORA ──────────────────────────────────────────────────
// NÃO está na tabela `users` deste projeto. O Better Auth roda como COMPONENTE
// do Convex (`components.betterAuth`, ver convex/convex.config.ts), com tabelas
// próprias em um espaço isolado — `ctx.db` daqui não as alcança, por
// construção. A senha vive na tabela `account` do componente, na linha de
// `providerId: "credential"`, no campo `password`, sempre como HASH.
//
// A tabela `users` daqui guarda só `betterAuthId`, o vínculo entre os dois
// lados. Por isso mexer "na mão" em tabela de autenticação é a pior ideia
// possível aqui: o formato do hash, o `providerId` e os campos de auditoria são
// contrato interno do Better Auth.
//
// ── POR QUE O FLUXO NORMAL NÃO RESOLVE ──────────────────────────────────────
// "Esqueceu sua senha?" existe e funciona (convex/auth.ts → sendResetPassword,
// via Resend). Mas ele manda um e-mail com token, e o endereço do demo é
// fictício: o e-mail nunca chega a lugar nenhum.
//
// ── O MECANISMO USADO ───────────────────────────────────────────────────────
// Exatamente o mesmo caminho interno que o Better Auth percorre no endpoint
// oficial `/reset-password` (better-auth/dist/api/routes/password.mjs):
//
//   1. `context.password.hash(novaSenha)`      → hash com o algoritmo dele
//   2. `internalAdapter.updatePassword(id, h)` → grava no account "credential"
//   3. `internalAdapter.deleteUserSessions(id)`→ honra revokeSessionsOnPasswordReset
//
// Nada é reimplementado. A única coisa que pulamos é a validação do token do
// e-mail — que é justamente o passo impossível aqui — e o preço disso é a
// trava de ambiente abaixo.
//
// ── AS TRAVAS ───────────────────────────────────────────────────────────────
//   1. `ALTAR_DEMO === "1"`, checado ANTES de qualquer leitura ou escrita.
//   2. Sinais de produção (conta com cobrança Asaas, usuários demais), pela
//      mesma verificação que o seed já usa.
//   3. `internalAction`: inalcançável pelo navegador. Só pela CLI, por quem
//      tem credencial de administrador do deployment.
//
// NÃO cria usuário, NÃO altera id, NÃO toca em evento, NÃO apaga dado de
// negócio, e NUNCA grava nem devolve a senha em texto puro.
// ─────────────────────────────────────────────────────────────────────────────

/** Mesmos limites do Better Auth (minPasswordLength / maxPasswordLength). */
const SENHA_MIN = 8;
const SENHA_MAX = 128;

export const resetDemoPassword = internalAction({
  args: { email: v.string(), newPassword: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; email: string; sessoesEncerradas: boolean }> => {
    // ── Trava 1: ambiente ────────────────────────────────────────────────────
    // Antes de tudo. Uma leitura sequer já seria uma escolha errada aqui.
    assertDemoFlag();

    // ── Trava 2: sinais de produção ──────────────────────────────────────────
    const ambiente = await ctx.runQuery(internal.demo.checkEnvironment, {});
    if (!ambiente.ok) {
      throw new ConvexError({
        code: "DEMO_ONLY",
        message: `Recusado: ${ambiente.motivo}. Nada foi alterado.`,
      });
    }

    const senha = args.newPassword;
    if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `A senha precisa ter entre ${SENHA_MIN} e ${SENHA_MAX} caracteres.`,
      });
    }

    const email = args.email.trim().toLowerCase();
    const auth = createAuth(ctx);
    const context = await auth.$context;

    const encontrado = await context.internalAdapter.findUserByEmail(email);
    if (!encontrado?.user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message:
          `Nenhuma conta com o e-mail "${email}" neste deployment. ` +
          "Confira com `npx convex run demo:contaDoDemo`. Nada foi alterado.",
      });
    }

    const { user } = encontrado;

    // Só redefinimos senha de conta que JÁ tem login por senha. Criar um
    // `account` credencial onde não havia seria fabricar uma forma de acesso
    // que a conta nunca teve — outra operação, com outro risco.
    const contas = await context.internalAdapter.findAccounts(user.id);
    const credencial = contas.find((c) => c.providerId === "credential");
    if (!credencial) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "Esta conta não tem login por e-mail e senha (nenhum account " +
          '"credential"). Nada foi alterado.',
      });
    }

    // ── A redefinição, pelo caminho oficial ──────────────────────────────────
    const hash = await context.password.hash(senha);
    await context.internalAdapter.updatePassword(user.id, hash);

    // `revokeSessionsOnPasswordReset: true` está ligado em convex/auth.ts. O
    // endpoint oficial encerra as sessões ao redefinir a senha; fazemos o
    // mesmo, para não abrir uma exceção silenciosa à política já decidida.
    // Isso não apaga nenhum dado de negócio — sessão é artefato de login.
    const revogar =
      auth.options.emailAndPassword?.revokeSessionsOnPasswordReset === true;
    if (revogar) {
      await context.internalAdapter.deleteUserSessions(user.id);
    }

    // O retorno NUNCA carrega senha nem hash.
    return { ok: true, email: user.email, sessoesEncerradas: revogar };
  },
});
