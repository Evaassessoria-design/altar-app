import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { diasEntre, montarAtencao } from "./lib/attention";
import { effectivePurchaseStatus, isOverdue, isPendingStatus } from "./lib/purchaseStatus";
import { resumirFornecedores } from "./lib/eventSummary";

// lib/attention.test.ts cobre as REGRAS. Aqui exercitamos a LEITURA sobre banco
// real: as tabelas certas, o evento certo, e nenhuma mistura entre eventos.

const HOJE = "2026-09-01";
const emDias = (n: number) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "d@exemplo.com.br", role: "user", subscriptionStatus: "active",
    });
    const perto = await ctx.db.insert("events", {
      userId, name: "Marina & Gabriel", date: emDias(5), location: "Fazenda",
      clientName: "Marina", type: "wedding", status: "confirmed",
    });
    const longe = await ctx.db.insert("events", {
      userId, name: "Casamento distante", date: emDias(240), location: "Sitio",
      clientName: "Outro", type: "wedding", status: "planning",
    });
    // Evento perto: 2 compras pendentes + 1 fornecedor sem confirmar
    await ctx.db.insert("purchaseItems", { userId, eventId: perto, name: "Rosas", isPurchased: false, order: 0 });
    await ctx.db.insert("purchaseItems", { userId, eventId: perto, name: "Fita", isPurchased: false, order: 1 });
    await ctx.db.insert("eventSuppliers", { userId, eventId: perto, category: "flores", companyName: "Flores Bela", status: "cotacao" });
    await ctx.db.insert("eventTeam", {
      userId, eventId: perto,
      teamMemberId: await ctx.db.insert("teamMembers", { userId, name: "Camila", role: "Coordenação" }),
      scheduledTime: "07:00",
    });
    // Evento longe: 3 compras pendentes (nao deve gerar atencao) e 1 ATRASADA
    await ctx.db.insert("purchaseItems", { userId, eventId: longe, name: "Vaso", isPurchased: false, order: 0 });
    await ctx.db.insert("purchaseItems", { userId, eventId: longe, name: "Tecido", isPurchased: false, order: 1 });
    await ctx.db.insert("purchaseItems", {
      userId, eventId: longe, name: "Estrutura", isPurchased: false, order: 2,
      status: "cotacao", dueDate: emDias(-10),
    });
    return { userId, perto, longe };
  });
  return { t, ...ids };
}

/** Mesma leitura da query, sem depender de autenticação. */
async function painel(t: Awaited<ReturnType<typeof cenario>>["t"], userId: string) {
  return t.run(async (ctx) => {
    const eventos = (await ctx.db.query("events").collect()).filter(
      (e) => e.userId === userId && e.status !== "cancelled" && e.status !== "completed" && e.date >= HOJE,
    );
    const entradas = await Promise.all(
      eventos.map(async (e) => {
        const checklist = (await ctx.db.query("checklistItems").collect()).filter((i) => i.eventId === e._id);
        const compras = (await ctx.db.query("purchaseItems").collect()).filter((i) => i.eventId === e._id);
        const fornecedores = (await ctx.db.query("eventSuppliers").collect()).filter((i) => i.eventId === e._id);
        const equipe = (await ctx.db.query("eventTeam").collect()).filter((i) => i.eventId === e._id);
        return {
          eventId: e._id as string,
          nome: e.name,
          data: e.date,
          diasAte: diasEntre(HOJE, e.date),
          checklistPendentes: checklist.filter((i) => i.phase === "pre" && !i.isChecked).length,
          comprasPendentes: compras.filter((i) => isPendingStatus(effectivePurchaseStatus(i))).length,
          comprasAtrasadas: compras.filter((i) => isOverdue(i, HOJE)).length,
          fornecedoresAguardando: resumirFornecedores(fornecedores).aguardando,
          equipeEscalada: equipe.length,
          acoesDeFornecedor: fornecedores
            .filter((f) => f.nextAction?.trim())
            .map((f) => ({ fornecedor: f.companyName, texto: f.nextAction!.trim() })),
        };
      }),
    );
    return montarAtencao(entradas);
  });
}

describe("painel de atencao sobre banco real", () => {
  it("mostra o evento proximo com os motivos certos", async () => {
    const { t, userId, perto } = await cenario();
    const p = await painel(t, userId);
    const ev = p.find((e) => e.eventId === perto)!;
    expect(ev).toBeDefined();
    expect(ev.nivel).toBe("urgente");
    const textos = ev.motivos.map((m) => m.texto);
    expect(textos).toContain("2 itens de compra pendentes");
    expect(textos).toContain("1 fornecedor sem confirmação");
    // Tem equipe escalada — nao pode aparecer como faltando gente.
    expect(textos.join(" ")).not.toContain("Ninguém escalado");
  });

  it("evento DISTANTE so aparece pelo atraso, nao pelas pendencias normais", async () => {
    const { t, userId, longe } = await cenario();
    const p = await painel(t, userId);
    const ev = p.find((e) => e.eventId === longe)!;
    expect(ev).toBeDefined();
    expect(ev.motivos.map((m) => m.texto)).toEqual(["1 compra atrasada"]);
  });

  it("nao mistura contagens entre eventos", async () => {
    const { t, userId, perto } = await cenario();
    const p = await painel(t, userId);
    const ev = p.find((e) => e.eventId === perto)!;
    // O evento longe tem 3 compras pendentes; nao podem vazar para o perto.
    expect(ev.motivos.map((m) => m.texto)).toContain("2 itens de compra pendentes");
  });

  it("cada motivo leva a uma tela existente", async () => {
    const { t, userId } = await cenario();
    const p = await painel(t, userId);
    const rotas = readFileSync("src/App.tsx", "utf-8");
    for (const ev of p) {
      for (const m of ev.motivos) {
        // Destino absoluto e resolvivel: ou e rota fixa, ou e sob /eventos/:id.
        const fixa = m.destino.startsWith("/eventos/") || rotas.includes(`path="${m.destino}"`);
        expect(fixa, `destino "${m.destino}" nao corresponde a nenhuma rota`).toBe(true);
      }
    }
  });

  it("a query e somente leitura e exige usuario", () => {
    const fonte = readFileSync("convex/dashboard.ts", "utf-8");
    const i = fonte.indexOf("export const getAttentionBoard =");
    const corpo = fonte.slice(i);
    expect(corpo).toContain("requireUser");
    expect(corpo).toContain('withIndex("by_user"');
    expect(corpo).not.toMatch(/ctx\.db\.(insert|patch|delete)/);
  });
});
