import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { deleteTeamMemberCascade } from "./lib/cascade";
import { resolverResponsavel, responsavelDoEvento } from "./lib/responsavel";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — RESPONSABILIDADE UNIFICADA sobre banco real.
//
// lib/responsavel.test.ts cobre as REGRAS. Aqui está o que só o banco prova:
// excluir um membro da equipe não pode deixar escala fantasma, não pode fazer
// o responsável sumir dos registros, e não pode encostar em outra empresa.
// ─────────────────────────────────────────────────────────────────────────────

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona", email: "dona@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra", email: "outra@ex.com", role: "user", subscriptionStatus: "active",
    });

    const camila = await ctx.db.insert("teamMembers", {
      userId: donaId, name: "Camila", role: "Coordenação",
    });
    const joao = await ctx.db.insert("teamMembers", {
      userId: donaId, name: "João", role: "Montagem",
    });
    const daOutra = await ctx.db.insert("teamMembers", {
      userId: outraId, name: "Camila da outra empresa", role: "Coordenação",
    });

    const eventoId = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
      responsibleId: camila,
    });
    const outroEventoId = await ctx.db.insert("events", {
      userId: donaId, name: "Sem responsável", type: "birthday", date: "2026-11-11",
      location: "Casa", clientName: "Cliente", status: "planning",
    });

    await ctx.db.insert("eventTeam", { userId: donaId, eventId: eventoId, teamMemberId: camila });
    await ctx.db.insert("eventTeam", { userId: donaId, eventId: eventoId, teamMemberId: joao });
    await ctx.db.insert("eventTeam", {
      userId: donaId, eventId: outroEventoId, teamMemberId: camila,
    });

    const leadId = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Noiva", stage: "meeting", order: 0, responsibleId: camila,
    });
    const compraId = await ctx.db.insert("purchaseItems", {
      userId: donaId, eventId: eventoId, name: "Rosas", isPurchased: false, order: 0,
      responsibleId: camila,
    });
    const compraComNota = await ctx.db.insert("purchaseItems", {
      userId: donaId, eventId: eventoId, name: "Velas", isPurchased: false, order: 1,
      responsibleId: camila, responsible: "Camila — só a compra, não a montagem",
    });

    return { donaId, outraId, camila, joao, daOutra, eventoId, outroEventoId, leadId, compraId, compraComNota };
  });
  return { t, ...ids };
}

describe("excluir um membro da equipe", () => {
  it("apaga TODAS as escalas dele, em todos os eventos", async () => {
    const { t, camila, joao } = await cenario();
    const r = await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    expect(r.escalas).toBe(2);
    const restantes = await t.run(async (ctx) => ctx.db.query("eventTeam").collect());
    expect(restantes).toHaveLength(1);
    expect(restantes[0].teamMemberId).toBe(joao);
  });

  it("a saúde do evento para de contar escala fantasma", async () => {
    // O bug: `listEventTeam` escondia o membro nulo, mas a saúde contava a
    // LINHA de eventTeam. O evento parecia coberto sem ninguém escalado.
    const { t, camila, joao, outroEventoId } = await cenario();
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, joao));
    const escalas = await t.run(async (ctx) =>
      ctx.db.query("eventTeam").withIndex("by_event", (q) => q.eq("eventId", outroEventoId)).collect(),
    );
    expect(escalas).toHaveLength(0);
  });

  it("preserva o NOME como anotação em evento, lead e compra", async () => {
    const { t, camila, eventoId, leadId, compraId } = await cenario();
    const r = await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    expect(r.vinculos).toBe(4); // evento, lead e as duas compras

    const [evento, lead, compra] = await t.run(async (ctx) => [
      await ctx.db.get(eventoId),
      await ctx.db.get(leadId),
      await ctx.db.get(compraId),
    ]);
    for (const registro of [evento, lead, compra]) {
      expect(registro!.responsibleId).toBeUndefined();
      expect(registro!.responsible).toBe("Camila");
      expect(resolverResponsavel(registro!, [])).toEqual({ nome: "Camila", origem: "anotacao" });
    }
  });

  it("NÃO sobrescreve anotação que já dizia mais que o nome", async () => {
    const { t, camila, compraComNota } = await cenario();
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    const compra = await t.run(async (ctx) => ctx.db.get(compraComNota));
    expect(compra!.responsible).toBe("Camila — só a compra, não a montagem");
    expect(compra!.responsibleId).toBeUndefined();
  });

  it("não encosta em registro de OUTRO membro", async () => {
    const { t, camila, joao } = await cenario();
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    expect(await t.run(async (ctx) => ctx.db.get(joao))).not.toBeNull();
  });

  it("não encosta na equipe de OUTRA empresa", async () => {
    const { t, camila, daOutra } = await cenario();
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    expect(await t.run(async (ctx) => ctx.db.get(daOutra))).not.toBeNull();
  });

  it("excluir duas vezes não quebra", async () => {
    const { t, camila } = await cenario();
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    const segunda = await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));
    expect(segunda).toEqual({ escalas: 0, vinculos: 0 });
  });
});

describe("responsável do evento sobre banco real", () => {
  it("a escolha explícita é respeitada, com dois escalados", async () => {
    const { t, eventoId } = await cenario();
    const resposta = await t.run(async (ctx) => {
      const evento = (await ctx.db.get(eventoId))!;
      const escalas = await ctx.db
        .query("eventTeam")
        .withIndex("by_event", (q) => q.eq("eventId", eventoId))
        .collect();
      const membros = (await Promise.all(escalas.map((e) => ctx.db.get(e.teamMemberId)))).filter(
        (m): m is NonNullable<typeof m> => m !== null,
      );
      return responsavelDoEvento(evento, membros.map((m) => ({ _id: m._id, name: m.name, role: m.role })));
    });
    expect(resposta?.nome).toBe("Camila");
  });

  it("sem escolha e com DOIS escalados, o sistema não elege ninguém", async () => {
    const { t, eventoId } = await cenario();
    const resposta = await t.run(async (ctx) => {
      await ctx.db.patch(eventoId, { responsibleId: undefined });
      const evento = (await ctx.db.get(eventoId))!;
      const escalas = await ctx.db
        .query("eventTeam")
        .withIndex("by_event", (q) => q.eq("eventId", eventoId))
        .collect();
      const membros = (await Promise.all(escalas.map((e) => ctx.db.get(e.teamMemberId)))).filter(
        (m): m is NonNullable<typeof m> => m !== null,
      );
      return responsavelDoEvento(evento, membros.map((m) => ({ _id: m._id, name: m.name, role: m.role })));
    });
    expect(resposta).toBeNull();
  });
});

describe("a fonte faz o que estes testes assumem", () => {
  it("`team.deleteMember` passa pela cascata", () => {
    const fonte = readFileSync("convex/team.ts", "utf-8");
    const i = fonte.indexOf("export const deleteMember");
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
    expect(corpo).toContain("deleteTeamMemberCascade");
    expect(corpo).not.toMatch(/ctx\.db\.delete\(args\.id\)/);
  });

  it("`health` não elege mais o primeiro da lista", () => {
    const fonte = readFileSync("convex/health.ts", "utf-8");
    expect(fonte).toContain("responsavelDoEvento");
    expect(fonte).not.toMatch(/ctx\.db\.get\(team\[0\]\.teamMemberId\)/);
  });

  it("toda mutation que aceita responsibleId confere o dono do membro", () => {
    // Sem isso, um id do navegador apontaria para a equipe de outra empresa e
    // o nome de alguém de fora apareceria no evento, no lead ou na compra.
    for (const [arquivo, funcoes] of [
      ["convex/events.ts", ["update"]],
      ["convex/purchases.ts", ["addPurchase", "updatePurchase"]],
      ["convex/funil.ts", ["createLead", "updateLead"]],
    ] as const) {
      const fonte = readFileSync(arquivo, "utf-8");
      for (const fn of funcoes) {
        const i = fonte.indexOf(`export const ${fn} =`);
        expect(i, `${arquivo}: ${fn} não existe mais`).toBeGreaterThan(-1);
        const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
        expect(corpo, `${arquivo}: ${fn} aceita responsibleId sem conferir o dono`).toContain(
          "requireTeamMember",
        );
      }
    }
  });

  it("as três tabelas guardam o vínculo como id, não como texto", () => {
    const schemaFonte = readFileSync("convex/schema.ts", "utf-8");
    const ocorrencias = schemaFonte.match(/responsibleId: v\.optional\(v\.id\("teamMembers"\)\)/g);
    expect(ocorrencias).toHaveLength(3); // events, leads, purchaseItems
  });
});
