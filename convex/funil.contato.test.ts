import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { estaParado, resumirFollowUp, semProximaAcao } from "./lib/leadFollowUp";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — REGISTRAR CONTATO
//
// `lastInteraction` existia no schema e a regra de follow-up sempre a
// respeitou, mas NENHUMA tela a gravava: o campo ficava vazio para sempre, a
// regra caía no `_creationTime`, e um lead que recebeu mensagem hoje de manhã
// continuava listado como parado. `registrarContato` fecha essa lacuna.
//
// A mutation exige sessão (Better Auth não roda no convex-test), então a
// mecânica é espelhada fielmente sobre o banco real e o bloco final amarra o
// espelho à fonte de verdade.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE = readFileSync("convex/funil.ts", "utf-8");
const CORPO = (() => {
  const i = FONTE.indexOf("export const registrarContato");
  return FONTE.slice(i, FONTE.indexOf("\nexport ", i + 1));
})();

const HOJE = "2026-09-02";
const emDias = (n: number) =>
  new Date(Date.parse(`${HOJE}T12:00:00Z`) + n * 86_400_000).toISOString();

/** Espelho fiel de `registrarContato`, com o usuário injetado. */
async function registrarEspelho(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"leads">,
  agora = new Date(),
) {
  const lead = await ctx.db.get(id);
  if (!lead || lead.userId !== userId) throw new Error("NOT_FOUND");
  const lastInteraction = agora.toISOString();
  await ctx.db.patch(id, comCarimbo({ lastInteraction }, agora));
  return { lastInteraction };
}

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona", email: "dona@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra", email: "outra@ex.com", role: "user", subscriptionStatus: "active",
    });
    // Parado: em `contact` o prazo é 2 dias, e faz 10 que ninguém fala com ela.
    const paradoId = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Noiva esquecida", stage: "contact", order: 0,
      lastInteraction: emDias(-10), nextAction: "Enviar proposta",
      notes: "Prefere tons neutros", budget: 25000,
    });
    const semAcaoId = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Sem próximo passo", stage: "meeting", order: 1,
      lastInteraction: emDias(-1),
    });
    const fechadoId = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Fechado", stage: "contracted", order: 2,
      lastInteraction: emDias(-90),
    });
    const perdidoId = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Perdido", stage: "discarded", order: 3,
      lastInteraction: emDias(-90),
    });
    return { donaId, outraId, paradoId, semAcaoId, fechadoId, perdidoId };
  });
  return { t, ...ids };
}

const paraRegra = (l: {
  _id: string; clientName: string; stage: string;
  nextAction?: string; lastInteraction?: string; _creationTime: number;
}) => l;

describe("registrar contato grava a conversa", () => {
  it("grava `lastInteraction` com o instante, não só a data", async () => {
    const { t, donaId, paradoId } = await cenario();
    const agora = new Date("2026-09-02T17:32:10.000Z");
    const r = await t.run(async (ctx) => registrarEspelho(ctx, donaId, paradoId, agora));
    expect(r.lastInteraction).toBe("2026-09-02T17:32:10.000Z");
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(lead!.lastInteraction).toBe("2026-09-02T17:32:10.000Z");
    // DATETIME, não data: a hora tem de estar lá.
    expect(lead!.lastInteraction).toContain("T");
  });

  it("carimba `updatedAt` junto — é o padrão do projeto", async () => {
    const { t, donaId, paradoId } = await cenario();
    const agora = new Date("2026-09-02T17:32:10.000Z");
    await t.run(async (ctx) => registrarEspelho(ctx, donaId, paradoId, agora));
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(lead!.updatedAt).toBe("2026-09-02T17:32:10.000Z");
  });

  it("NÃO muda estágio, `nextAction`, nem nada mais", async () => {
    const { t, donaId, paradoId } = await cenario();
    const antes = await t.run(async (ctx) => ctx.db.get(paradoId));
    await t.run(async (ctx) => registrarEspelho(ctx, donaId, paradoId));
    const depois = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(depois).toMatchObject({
      stage: antes!.stage,
      nextAction: antes!.nextAction,
      clientName: antes!.clientName,
      order: antes!.order,
      notes: antes!.notes,
    });
    // E nenhuma nota foi inventada para "documentar" a conversa.
    expect(depois!.notes).toBe(antes!.notes);
  });

  it("registrar duas vezes fica com o MAIS RECENTE", async () => {
    const { t, donaId, paradoId } = await cenario();
    await t.run(async (ctx) => registrarEspelho(ctx, donaId, paradoId, new Date("2026-09-02T09:00:00.000Z")));
    await t.run(async (ctx) => registrarEspelho(ctx, donaId, paradoId, new Date("2026-09-02T16:45:00.000Z")));
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(lead!.lastInteraction).toBe("2026-09-02T16:45:00.000Z");
  });

  it("OUTRA decoradora não registra contato em lead alheio", async () => {
    const { t, outraId, paradoId } = await cenario();
    await expect(t.run(async (ctx) => registrarEspelho(ctx, outraId, paradoId))).rejects.toThrow();
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(lead!.lastInteraction).toBe(emDias(-10)); // intocado
  });
});

describe("editar o lead NÃO é registrar contato", () => {
  it("`updateLead` sem o campo preserva o último contato", async () => {
    const { t, paradoId } = await cenario();
    // Espelho de updateLead editando nome, orçamento e observação.
    await t.run(async (ctx) =>
      ctx.db.patch(paradoId, comCarimbo({ clientName: "Noiva Silva", budget: 30000, notes: "oi" })),
    );
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(lead!.lastInteraction).toBe(emDias(-10));
  });

  it("e o lead CONTINUA parado depois da edição", async () => {
    const { t, paradoId } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(paradoId, comCarimbo({ clientName: "Noiva Silva" })));
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(estaParado(paraRegra(lead as never), HOJE)).toBe(true);
  });
});

describe("o follow-up responde ao contato registrado", () => {
  it("lead parado deixa de estar parado", async () => {
    const { t, donaId, paradoId } = await cenario();
    const antes = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(estaParado(paraRegra(antes as never), HOJE)).toBe(true);

    await t.run(async (ctx) =>
      registrarEspelho(ctx, donaId, paradoId, new Date(`${HOJE}T17:00:00.000Z`)),
    );
    const depois = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(estaParado(paraRegra(depois as never), HOJE)).toBe(false);
  });

  it("mas continua SEM PRÓXIMA AÇÃO se não tiver — são perguntas diferentes", async () => {
    const { t, donaId, semAcaoId } = await cenario();
    await t.run(async (ctx) =>
      registrarEspelho(ctx, donaId, semAcaoId, new Date(`${HOJE}T17:00:00.000Z`)),
    );
    const lead = await t.run(async (ctx) => ctx.db.get(semAcaoId));
    expect(semProximaAcao(paraRegra(lead as never))).toBe(true);
  });

  it("o total do painel cai em um quando o parado é atendido", async () => {
    const { t, donaId, paradoId } = await cenario();
    const ler = async () =>
      t.run(async (ctx) => {
        const leads = await ctx.db
          .query("leads")
          .withIndex("by_user", (q) => q.eq("userId", donaId))
          .collect();
        return resumirFollowUp(leads.map((l) => paraRegra(l as never)), HOJE);
      });

    const antes = await ler();
    expect(antes.parados.map((l) => l._id)).toContain(paradoId);

    await t.run(async (ctx) =>
      registrarEspelho(ctx, donaId, paradoId, new Date(`${HOJE}T17:00:00.000Z`)),
    );
    const depois = await ler();
    expect(depois.parados.map((l) => l._id)).not.toContain(paradoId);
  });

  it("FECHADO e PERDIDO continuam fora dos alertas, com ou sem contato", async () => {
    const { t, donaId, fechadoId, perdidoId } = await cenario();
    for (const id of [fechadoId, perdidoId]) {
      const lead = await t.run(async (ctx) => ctx.db.get(id));
      expect(estaParado(paraRegra(lead as never), HOJE)).toBe(false);
      expect(semProximaAcao(paraRegra(lead as never))).toBe(false);
    }
    // Mesmo registrando contato neles, seguem fora — estado final é final.
    await t.run(async (ctx) => registrarEspelho(ctx, donaId, fechadoId));
    const fechado = await t.run(async (ctx) => ctx.db.get(fechadoId));
    expect(estaParado(paraRegra(fechado as never), HOJE)).toBe(false);
  });
});

describe("fuso: o instante gravado não desliza de dia", () => {
  it("contato às 22h no Brasil conta como HOJE na regra", async () => {
    // 22h de Brasília é 01h UTC do dia seguinte. A regra corta em 10
    // caracteres, então o valor cairia no dia seguinte — e `diasEntre` daria
    // -1, que `diasSemContato` trava em 0. Nunca vira "parado".
    const { t, donaId, paradoId } = await cenario();
    await t.run(async (ctx) =>
      registrarEspelho(ctx, donaId, paradoId, new Date("2026-09-03T01:00:00.000Z")),
    );
    const lead = await t.run(async (ctx) => ctx.db.get(paradoId));
    expect(estaParado(paraRegra(lead as never), HOJE)).toBe(false);
  });

  it("registro ANTIGO só com data continua válido para a regra", async () => {
    const { t } = await cenario();
    const antigoId = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").first())!;
      return ctx.db.insert("leads", {
        userId: user._id, clientName: "Legado", stage: "contact", order: 9,
        lastInteraction: "2026-09-01", // sem hora, como vinha antes
      });
    });
    const lead = await t.run(async (ctx) => ctx.db.get(antigoId));
    expect(estaParado(paraRegra(lead as never), HOJE)).toBe(false); // 1 dia < prazo 2
  });
});

describe("a fonte faz o que o espelho reproduz", () => {
  it("exige sessão e confere o dono", () => {
    expect(CORPO).toContain("requireUser");
    expect(CORPO).toContain("lead.userId !== user._id");
  });

  it("grava um INSTANTE, não uma data", () => {
    expect(CORPO).toContain("new Date().toISOString()");
    expect(CORPO).not.toMatch(/slice\(0,\s*10\)/);
  });

  it("carimba e mexe em UM campo só", () => {
    expect(CORPO).toContain("comCarimbo({ lastInteraction })");
    for (const campo of ["stage:", "nextAction:", "notes:", "convertedEventId:", "order:"]) {
      expect(CORPO, `registrarContato não pode tocar em ${campo}`).not.toContain(campo);
    }
  });

  it("o formulário do funil continua sem `lastInteraction`", () => {
    // A gravação tem de ser EXPLÍCITA. Se o campo voltasse ao formulário,
    // editar um acento zeraria o relógio do follow-up.
    const tela = readFileSync("src/pages/app/funil/page.tsx", "utf-8");
    const i = tela.indexOf("const leadSchema = z.object({");
    expect(tela.slice(i, tela.indexOf("});", i))).not.toContain("lastInteraction");
  });

  it("a tela chama a mutation dedicada, e não `updateLead`", () => {
    const tela = readFileSync("src/pages/app/funil/page.tsx", "utf-8");
    expect(tela).toContain("api.funil.registrarContato");
    expect(tela).toContain("descreverUltimoContato");
  });

  it("o botão não aparece em estágio final", () => {
    const tela = readFileSync("src/pages/app/funil/page.tsx", "utf-8");
    const i = tela.indexOf("Registrar contato");
    const trecho = tela.slice(Math.max(0, i - 600), i);
    expect(trecho).toContain('lead.stage !== "contracted" && lead.stage !== "discarded"');
  });
});
