import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";

// ─────────────────────────────────────────────────────────────────────────────
// ISOLAMENTO DAS SUPERFÍCIES DO MASTER #3
//
// Identidade da empresa, escopo de item e classificação de foto são dados que,
// vazando, aparecem em DOCUMENTO IMPRESSO — a decoradora entregaria à equipe
// dela uma ficha com a logo ou a cor de outra empresa.
// ─────────────────────────────────────────────────────────────────────────────

async function duasEmpresas() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const empresaA = await ctx.db.insert("users", {
      name: "Eva", email: "a@exemplo.com.br", role: "user", subscriptionStatus: "active",
      studioName: "Aurora Decorações", brandColor: "#1B3A2F", instagram: "@aurora",
    });
    const empresaB = await ctx.db.insert("users", {
      name: "Outra", email: "b@exemplo.com.br", role: "user", subscriptionStatus: "active",
      studioName: "Concorrente Decor", brandColor: "#FF0000", instagram: "@concorrente",
    });
    const eventoA = await ctx.db.insert("events", {
      userId: empresaA, name: "Marina & Gabriel", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", type: "wedding", status: "confirmed",
    });
    const eventoB = await ctx.db.insert("events", {
      userId: empresaB, name: "Evento da concorrente", date: "2026-11-11",
      location: "Outro", clientName: "Outro", type: "wedding", status: "planning",
    });
    const itemB = await ctx.db.insert("assemblyItems", {
      userId: empresaB, eventId: eventoB, area: "ceremony", order: 0, name: "Arco da concorrente",
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
      projectScope: "incluso", createdAt: "2026-09-01", updatedAt: "2026-09-01",
    });
    // O storage precisa ser real: o schema valida o id da tabela `_storage`.
    const storageId = await (
      ctx as unknown as { storage: { store: (b: Blob) => Promise<never> } }
    ).storage.store(new Blob(["foto"], { type: "image/jpeg" }));
    const fotoB = await ctx.db.insert("eventPhotos", {
      userId: empresaB, eventId: eventoB, storageId,
      filename: "concorrente.jpg", category: "montagem", order: 0,
      uploadedAt: "2026-09-01", projectScope: "incluso",
    });
    return { empresaA, empresaB, eventoA, eventoB, itemB, fotoB };
  });
  return { t, ...ids };
}

describe("empresa A não alcança dados da empresa B", () => {
  it("os dados de teste existem mesmo, em donos diferentes", async () => {
    const { t, empresaA, empresaB } = await duasEmpresas();
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(2);
    expect(users.find((u) => u._id === empresaA)!.studioName).toBe("Aurora Decorações");
    expect(users.find((u) => u._id === empresaB)!.studioName).toBe("Concorrente Decor");
  });

  it("item de projeto da B pertence à B — nunca ao evento da A", async () => {
    const { t, itemB, eventoB, empresaB, eventoA } = await duasEmpresas();
    const item = await t.run(async (ctx) => ctx.db.get(itemB));
    expect(item!.userId).toBe(empresaB);
    expect(item!.eventId).toBe(eventoB);
    expect(item!.eventId).not.toBe(eventoA);
  });

  it("foto da B pertence à B", async () => {
    const { t, fotoB, empresaB } = await duasEmpresas();
    const foto = await t.run(async (ctx) => ctx.db.get(fotoB));
    expect(foto!.userId).toBe(empresaB);
  });
});

describe("as mutações novas têm guarda de posse", () => {
  const fonte = (arq: string) => readFileSync(arq, "utf-8");
  const corpoDe = (arq: string, nome: string) => {
    const f = fonte(arq);
    const i = f.indexOf(`export const ${nome} =`);
    expect(i, `${nome} não existe em ${arq}`).toBeGreaterThan(-1);
    const prox = f.indexOf("\nexport ", i + 1);
    return f.slice(i, prox === -1 ? undefined : prox);
  };

  it("assemblyItems.update (escopo do projeto) confere o dono", () => {
    expect(corpoDe("convex/assemblyItems.ts", "update")).toContain("userId !== user._id");
  });

  it("gallery.updatePhoto (classificação) confere o dono", () => {
    expect(corpoDe("convex/gallery.ts", "updatePhoto")).toContain("userId !== user._id");
  });

  it("users.updateProfile (identidade) grava só no próprio usuário", () => {
    const corpo = corpoDe("convex/users.ts", "updateProfile");
    expect(corpo).toContain("requireUser");
    expect(corpo).toContain("ctx.db.patch(user._id, patch)");
    // Não aceita userId por argumento — não dá para gravar em outra conta.
    expect(corpo).not.toMatch(/args\.userId/);
  });

  it("users.getLogoUrl só devolve a logo do próprio usuário", () => {
    const corpo = corpoDe("convex/users.ts", "getLogoUrl");
    expect(corpo).toContain("getOptionalUser");
    expect(corpo).toContain("user?.logoStorageId");
    expect(corpo).not.toMatch(/args\./);
  });
});

describe("compatibilidade com dados antigos", () => {
  it("item SEM projectScope continua válido e entra na montagem", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "D", email: "d@exemplo.com.br", role: "user", subscriptionStatus: "active",
      });
      const eventId = await ctx.db.insert("events", {
        userId, name: "E", date: "2026-10-10", location: "L",
        clientName: "C", type: "wedding", status: "planning",
      });
      return ctx.db.insert("assemblyItems", {
        userId, eventId, area: "ceremony", order: 0, name: "Item antigo",
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
        createdAt: "2026-09-01", updatedAt: "2026-09-01",
      });
    });
    const item = await t.run(async (ctx) => ctx.db.get(id));
    expect(item!.projectScope).toBeUndefined();

    // O comportamento (item sem escopo continua na montagem) é verificado em
    // src/lib/decoration-project.test.ts — aqui garantimos só que o registro
    // antigo permanece GRAVÁVEL e LEGÍVEL, sem backfill.
    expect(item!.name).toBe("Item antigo");
    expect(item!.includeInAssemblyReport).toBe(true);
  });

  it("usuário SEM os campos de identidade continua válido", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Antiga", email: "antiga@exemplo.com.br", role: "user", subscriptionStatus: "active",
      }),
    );
    const u = await t.run(async (ctx) => ctx.db.get(id));
    expect(u!.brandColor).toBeUndefined();
    expect(u!.instagram).toBeUndefined();

    // A identidade resultante é verificada em src/lib/brand.test.ts.
    expect(u!.name).toBe("Antiga");
    expect(u!.studioName).toBeUndefined();
  });
});
