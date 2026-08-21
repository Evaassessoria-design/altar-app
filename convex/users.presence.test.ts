import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// `users.touchLastSeen` — a mutation que registra presença.
//
// A REGRA (quando gravar) está provada exaustivamente em lib/presence.test.ts.
// Aqui garantimos duas coisas sobre a mutation em si:
//
//  1. o caminho sem sessão, executado de verdade — não grava e não lança;
//  2. que ela continua ligada à regra e continua tocando SÓ em `lastSeenAt`.
//
// O caminho autenticado depende de uma sessão Better Auth, que não existe no
// convex-test (o componente não é registrado). Por isso a segunda garantia é
// estrutural, lida no código-fonte — mesma abordagem de admin.guard.test.ts.
// Preferimos isso a reimplementar o corpo da mutation dentro do teste, que
// passaria mesmo se a mutation real quebrasse.
// ─────────────────────────────────────────────────────────────────────────────

describe("touchLastSeen — sem sessão", () => {
  it("não grava e não lança", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.touchLastSeen, {})).resolves.toBe(false);
  });

  it("não cria nenhum usuário por acidente", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.users.touchLastSeen, {});
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(0);
  });

  it("não altera um cadastro existente", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Usuária",
        email: "usuaria@exemplo.com",
        role: "user",
        subscriptionStatus: "trial",
      }),
    );

    await t.mutation(api.users.touchLastSeen, {});

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.lastSeenAt).toBeUndefined();
  });
});

describe("touchLastSeen — continua barata e isolada", () => {
  const source = readFileSync(join(__dirname, "users.ts"), "utf8");
  const start = source.indexOf("export const touchLastSeen");
  const block = source.slice(start, source.indexOf("export const", start + 1));

  it("existe", () => {
    expect(start, "touchLastSeen sumiu de convex/users.ts").toBeGreaterThan(-1);
  });

  it("decide gravar pela regra compartilhada, não por conta própria", () => {
    expect(block).toContain("shouldRecordLastSeen");
  });

  it("sai antes de gravar quando a janela ainda não fechou", () => {
    // Sem esta saída antecipada, seria uma gravação por clique — exatamente o
    // que o requisito proíbe.
    expect(block).toMatch(/if \(!shouldRecordLastSeen\([^)]*\)\) return false;/);
  });

  it("grava SOMENTE lastSeenAt", () => {
    const patches = block.match(/ctx\.db\.patch\([^)]*\{[^}]*\}/g) ?? [];
    expect(patches).toHaveLength(1);
    expect(patches[0]).toContain("lastSeenAt");
    // Presença não pode encostar em cobrança, papel ou tipo de acesso.
    for (const campo of ["subscriptionStatus", "role", "accessType", "trialEndDate"]) {
      expect(patches[0], `touchLastSeen não pode escrever ${campo}`).not.toContain(campo);
    }
  });
});
