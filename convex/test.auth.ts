import type { TestConvex } from "convex-test";
import type schema from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// SESSÃO AUTENTICADA NOS TESTES
//
// `requireUser` (convex/lib/identity.ts) resolve a identidade pelo componente
// Better Auth, que roda DENTRO do Convex. O convex-test não registra esse
// componente, então toda função protegida — a Central inteira, o Painel Admin —
// ficava fora do alcance dos testes de banco. Era por isso que `admin.guard`
// testava a FIAÇÃO por leitura de código em vez de exercitar o caminho real.
//
// Este módulo substitui SÓ a tradução "sessão → usuário do Better Auth". Tudo
// o mais continua real: o índice `by_better_auth_id`, `requireUser`,
// `requireAdmin` e cada regra de posse são exercitados como em produção. Em
// particular, quem não tem `role: "admin"` continua sendo barrado de verdade —
// se alguém afrouxar a guarda, o teste quebra.
//
// A substituição em si (`vi.mock("./auth", ...)`) é declarada no TOPO de cada
// arquivo de teste, e não aqui: `vi.mock` é içado para antes dos imports, e
// escondê-lo atrás de uma função faria a ordem real de execução divergir do que
// o arquivo aparenta. Este módulo fica só com as sessões.
// ─────────────────────────────────────────────────────────────────────────────

type Teste = TestConvex<typeof schema>;

/** Uma pessoa logada, com o vínculo real em `users.betterAuthId`. */
export async function autenticarComo(
  t: Teste,
  usuario: { nome: string; email: string; role: "admin" | "user"; subject?: string },
) {
  const subject = usuario.subject ?? `auth|${usuario.email}`;

  await t.run(async (ctx) => {
    const existente = await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
      .unique();
    if (existente) return existente._id;

    return ctx.db.insert("users", {
      name: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      subscriptionStatus: "active",
      betterAuthId: subject,
    });
  });

  return t.withIdentity({
    subject,
    tokenIdentifier: subject,
    email: usuario.email,
    name: usuario.nome,
  });
}

/** Atalho para quem opera o SaaS. */
export function autenticarComoAdmin(t: Teste) {
  return autenticarComo(t, {
    nome: "Matheus",
    email: "matheus@altar.example",
    role: "admin",
  });
}

/** Atalho para uma cliente do ALTAR — nunca deve alcançar a Central. */
export function autenticarComoDecoradora(t: Teste) {
  return autenticarComo(t, {
    nome: "Decoradora",
    email: "decoradora@example.com",
    role: "user",
  });
}
