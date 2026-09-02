import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { deleteEventCascade, deleteLeadCascade, deleteUserDataCascade } from "./lib/cascade";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — DOCUMENTOS DO LEAD
//
// O que está sendo protegido: arquivos comerciais (proposta, contrato
// assinado, comprovante do sinal) que nascem ANTES de existir evento. Três
// coisas não podem acontecer nunca:
//
//   · um documento aparecer para outra decoradora;
//   · um documento sobreviver, como arquivo cobrado no storage, ao lead que o
//     originou;
//   · a tela morrer porque o arquivo sumiu do storage.
//
// COMO ESTE ARQUIVO TESTA — e qual é a limitação:
// `save`, `list` e `remove` exigem sessão, e o componente do Better Auth NÃO é
// registrado no convex-test. Então não dá para chamar as mutations
// autenticadas. A divisão é a mesma já usada em purchases.custo.test.ts:
//
//   1. o que roda de verdade  → a cascata (`deleteLeadCascade`) e as chamadas
//      SEM sessão, que precisam ser recusadas;
//   2. o que é espelhado      → a mecânica de posse/idempotência de `remove` e
//      de `listForEvent`, reproduzida fielmente sobre o banco real;
//   3. o que amarra os dois   → o bloco final, que lê convex/leadDocuments.ts e
//      exige que o código de verdade tenha as mesmas guardas do espelho.
//
// Se o espelho e a fonte divergirem, (3) falha. É o que impede este arquivo de
// virar um teste que só testa a si mesmo.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE = readFileSync("convex/leadDocuments.ts", "utf-8");
const NOW = "2026-09-01T12:00:00.000Z";

type TestMutationCtx = MutationCtx & {
  storage: { store: (blob: Blob) => Promise<Id<"_storage">> };
};

function corpoDe(nome: string) {
  const i = FONTE.indexOf(`export const ${nome} =`);
  expect(i, `função ${nome} não existe mais em convex/leadDocuments.ts`).toBeGreaterThan(-1);
  const proximo = FONTE.indexOf("\nexport ", i + 1);
  return FONTE.slice(i, proximo === -1 ? undefined : proximo);
}

/** Duas decoradoras, cada uma com um lead e um documento com arquivo real. */
async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: TestMutationCtx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona", email: "dona@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra", email: "outra@ex.com", role: "user", subscriptionStatus: "active",
    });
    const leadId = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Noiva", stage: "quote_sent", order: 0,
    });
    const leadDaOutraId = await ctx.db.insert("leads", {
      userId: outraId, clientName: "Cliente da outra", stage: "contact", order: 0,
    });

    const arquivo = await ctx.storage.store(new Blob(["proposta em pdf"]));
    const docId = await ctx.db.insert("leadDocuments", {
      userId: donaId, leadId, storageId: arquivo,
      fileName: "proposta.pdf", documentType: "proposta",
      mimeType: "application/pdf", fileSize: 15, uploadedAt: NOW,
    });

    const arquivoDaOutra = await ctx.storage.store(new Blob(["contrato alheio"]));
    const docDaOutraId = await ctx.db.insert("leadDocuments", {
      userId: outraId, leadId: leadDaOutraId, storageId: arquivoDaOutra,
      fileName: "contrato-alheio.pdf", uploadedAt: NOW,
    });

    return { donaId, outraId, leadId, leadDaOutraId, docId, docDaOutraId, arquivo, arquivoDaOutra };
  });
  return { t, ...ids };
}

// ── Espelho fiel de `remove` ────────────────────────────────────────────────
// Reproduz o handler com o usuário injetado (o que a sessão faria).
async function removeEspelho(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"leadDocuments">,
) {
  const doc = await ctx.db.get(id);
  if (!doc) return { removido: false };
  if (doc.userId !== userId) throw new Error("NOT_FOUND");
  try {
    await ctx.storage.delete(doc.storageId);
  } catch {
    // arquivo já ausente não impede a remoção da linha
  }
  await ctx.db.delete(id);
  return { removido: true };
}

describe("documentos do lead — posse", () => {
  it("a dona lê os documentos do seu lead", async () => {
    const { t, leadId, docId } = await cenario();
    const docs = await t.run(async (ctx) =>
      ctx.db.query("leadDocuments").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
    );
    expect(docs.map((d) => d._id)).toEqual([docId]);
    expect(docs[0].fileName).toBe("proposta.pdf");
  });

  it("o documento de OUTRA decoradora não entra na lista", async () => {
    const { t, leadId, docDaOutraId } = await cenario();
    const docs = await t.run(async (ctx) =>
      ctx.db.query("leadDocuments").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
    );
    expect(docs.map((d) => d._id)).not.toContain(docDaOutraId);
  });

  it("outra decoradora NÃO consegue remover documento alheio", async () => {
    const { t, outraId, docId, arquivo } = await cenario();
    await expect(
      t.run(async (ctx) => removeEspelho(ctx, outraId, docId)),
    ).rejects.toThrow();
    // e o arquivo continua lá — recusar tem que ser recusar de verdade
    const [linha, ainda] = await t.run(async (ctx) => [
      await ctx.db.get(docId),
      await ctx.storage.getUrl(arquivo),
    ]);
    expect(linha).not.toBeNull();
    expect(ainda).not.toBeNull();
  });

  it("a dona remove o seu documento — linha e ARQUIVO saem juntos", async () => {
    const { t, donaId, docId, arquivo } = await cenario();
    const r = await t.run(async (ctx) => removeEspelho(ctx, donaId, docId));
    expect(r).toEqual({ removido: true });
    const [linha, url] = await t.run(async (ctx) => [
      await ctx.db.get(docId),
      await ctx.storage.getUrl(arquivo),
    ]);
    expect(linha).toBeNull();
    expect(url).toBeNull();
  });

  it("remover DUAS VEZES não é erro (clique duplo, retry de rede)", async () => {
    const { t, donaId, docId } = await cenario();
    const primeira = await t.run(async (ctx) => removeEspelho(ctx, donaId, docId));
    const segunda = await t.run(async (ctx) => removeEspelho(ctx, donaId, docId));
    expect(primeira).toEqual({ removido: true });
    expect(segunda).toEqual({ removido: false });
  });

  it("arquivo JÁ REMOVIDO do storage não impede a remoção da linha", async () => {
    const { t, donaId, docId, arquivo } = await cenario();
    await t.run(async (ctx) => ctx.storage.delete(arquivo));
    const r = await t.run(async (ctx) => removeEspelho(ctx, donaId, docId));
    expect(r).toEqual({ removido: true });
    expect(await t.run(async (ctx) => ctx.db.get(docId))).toBeNull();
  });

  it("documento ANTIGO, sem tipo nem metadados, continua legível", async () => {
    // Dado gravado antes de `documentType`/`mimeType` existirem. Ele não pode
    // sumir da lista nem ganhar um tipo inventado.
    const { t, leadId } = await cenario();
    const antigoId = await t.run(async (ctx: TestMutationCtx) => {
      const f = await ctx.storage.store(new Blob(["antigo"]));
      return ctx.db.insert("leadDocuments", {
        userId: (await ctx.db.get(leadId))!.userId,
        leadId, storageId: f, fileName: "antigo.pdf", uploadedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const docs = await t.run(async (ctx) =>
      ctx.db.query("leadDocuments").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
    );
    const antigo = docs.find((d) => d._id === antigoId)!;
    expect(antigo).toBeDefined();
    expect(antigo.documentType).toBeUndefined();
    expect(antigo.mimeType).toBeUndefined();
  });

  it("arquivo sumido do storage devolve url null, e a linha SEGUE na lista", async () => {
    const { t, leadId, docId, arquivo } = await cenario();
    await t.run(async (ctx) => ctx.storage.delete(arquivo));
    const resolvidos = await t.run(async (ctx) => {
      const docs = await ctx.db
        .query("leadDocuments")
        .withIndex("by_lead", (q) => q.eq("leadId", leadId))
        .collect();
      return Promise.all(
        docs.map(async (d) => ({ id: d._id, url: await ctx.storage.getUrl(d.storageId) })),
      );
    });
    expect(resolvidos).toEqual([{ id: docId, url: null }]);
  });
});

describe("documentos do lead — sem sessão", () => {
  it("`list` devolve vazio em vez de vazar", async () => {
    const { t, leadId } = await cenario();
    expect(await t.query(api.leadDocuments.list, { leadId })).toEqual([]);
  });

  it("`listForEvent` devolve vazio em vez de vazar", async () => {
    const { t } = await cenario();
    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("events", {
        userId: (await ctx.db.query("users").first())!._id,
        name: "Evento", type: "wedding", date: "2026-12-12",
        location: "Salão", clientName: "Noiva", status: "planning",
      }),
    );
    expect(
      await t.query(api.leadDocuments.listForEvent, { eventId }),
    ).toEqual([]);
  });

  it("`save` recusa — não existe upload anônimo", async () => {
    const { t, leadId } = await cenario();
    const storageId = await t.run(async (ctx: TestMutationCtx) =>
      ctx.storage.store(new Blob(["x"])),
    );
    await expect(
      t.mutation(api.leadDocuments.save, {
        leadId, storageId, fileName: "x.pdf",
      }),
    ).rejects.toThrow();
  });
});

describe("conversão do lead em evento", () => {
  it("converter NÃO move, NÃO copia e NÃO apaga documento", async () => {
    const { t, donaId, leadId, docId } = await cenario();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        userId: donaId, name: "Casamento", type: "wedding", date: "2026-12-12",
        location: "Salão", clientName: "Noiva", status: "planning",
      });
      await ctx.db.patch(leadId, { stage: "contracted", convertedEventId: id });
      return id;
    });

    const [doPreLead, total, contratos] = await t.run(async (ctx) => [
      await ctx.db.query("leadDocuments").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
      (await ctx.db.query("leadDocuments").collect()).length,
      await ctx.db.query("contracts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ]);
    expect(doPreLead.map((d) => d._id)).toEqual([docId]); // continua no lead
    expect(total).toBe(2); // nada foi duplicado (o outro é o da outra conta)
    expect(contratos).toEqual([]); // nada foi copiado para `contracts`
  });

  it("o evento ENXERGA os documentos da negociação que o gerou", async () => {
    const { t, donaId, leadId, docId } = await cenario();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        userId: donaId, name: "Casamento", type: "wedding", date: "2026-12-12",
        location: "Salão", clientName: "Noiva", status: "planning",
      });
      await ctx.db.patch(leadId, { stage: "contracted", convertedEventId: id });
      return id;
    });

    // Espelho de `listForEvent`: lead do dono que aponta para o evento.
    const vistos = await t.run(async (ctx) => {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_user", (q) => q.eq("userId", donaId))
        .collect();
      const origem = leads.find((l) => l.convertedEventId === eventId);
      if (!origem) return [];
      return ctx.db
        .query("leadDocuments")
        .withIndex("by_lead", (q) => q.eq("leadId", origem._id))
        .collect();
    });
    expect(vistos.map((d) => d._id)).toEqual([docId]);
  });

  it("evento que NÃO nasceu de lead não enxerga documento nenhum", async () => {
    const { t, donaId } = await cenario();
    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("events", {
        userId: donaId, name: "Direto", type: "birthday", date: "2026-11-11",
        location: "Casa", clientName: "Cliente", status: "planning",
      }),
    );
    const vistos = await t.run(async (ctx) => {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_user", (q) => q.eq("userId", donaId))
        .collect();
      return leads.find((l) => l.convertedEventId === eventId) ? ["achou"] : [];
    });
    expect(vistos).toEqual([]);
  });
});

describe("EXCLUIR O LEAD CONVERTIDO NÃO DESTRÓI A HISTÓRIA DO EVENTO", () => {
  // O defeito, achado na auditoria pós-MASTER #5: a decoradora fecha a venda,
  // converte o lead, e depois limpa o funil apagando o cartão. Isso destruía o
  // CONTRATO ASSINADO do evento — linha e arquivo, sem aviso.
  //
  // Agora o vínculo MIGRA para o evento. Nada é copiado: mesmo arquivo, dono
  // novo. Cópia criaria dois donos e a exclusão de um deixaria o outro
  // apontando para o vazio.
  async function convertido() {
    const c = await cenario();
    const eventId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        userId: c.donaId, name: "Casamento", type: "wedding", date: "2026-12-12",
        location: "Fazenda", clientName: "Noiva", status: "confirmed",
      });
      await ctx.db.patch(c.leadId, { stage: "contracted", convertedEventId: id });
      return id;
    });
    return { ...c, eventId };
  }

  it("o documento sobrevive, com o arquivo intacto", async () => {
    const { t, leadId, docId, arquivo } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    const [doc, url] = await t.run(async (ctx) => [
      await ctx.db.get(docId),
      await ctx.storage.getUrl(arquivo),
    ]);
    expect(doc).not.toBeNull();
    expect(url).not.toBeNull();
  });

  it("o dono passa a ser o EVENTO, e o vínculo com o lead some", async () => {
    const { t, leadId, docId, eventId } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    const doc = await t.run(async (ctx) => ctx.db.get(docId));
    expect(doc!.eventId).toBe(eventId);
    expect(doc!.leadId).toBeUndefined();
  });

  it("a tela do evento continua mostrando o mesmo documento", async () => {
    const { t, leadId, docId, eventId } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    const vistos = await t.run(async (ctx) =>
      ctx.db.query("leadDocuments").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    expect(vistos.map((d) => d._id)).toEqual([docId]);
  });

  it("nada é duplicado — continua sendo UMA linha e UM arquivo", async () => {
    const { t, leadId, donaId } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    const total = await t.run(async (ctx) =>
      (await ctx.db.query("leadDocuments").withIndex("by_user", (q) => q.eq("userId", donaId))
        .collect()).length,
    );
    expect(total).toBe(1);
  });

  it("lead NÃO convertido continua levando os documentos junto", async () => {
    // A migração é só para história que virou evento. Um lead descartado não
    // deixa arquivo pago para trás.
    const { t, leadId, docId, arquivo } = await cenario();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    expect(await t.run(async (ctx) => ctx.db.get(docId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).toBeNull();
  });

  it("evento JÁ APAGADO não herda nada — o documento sai junto", async () => {
    const { t, leadId, eventId, docId, arquivo } = await convertido();
    await t.run(async (ctx) => ctx.db.delete(eventId));
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    expect(await t.run(async (ctx) => ctx.db.get(docId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).toBeNull();
  });

  it("evento de OUTRA empresa nunca herda — nem por ponteiro cruzado", async () => {
    const { t, leadId, outraId, docId, arquivo } = await cenario();
    await t.run(async (ctx) => {
      const alheio = await ctx.db.insert("events", {
        userId: outraId, name: "Da outra", type: "wedding", date: "2026-12-12",
        location: "L", clientName: "C", status: "confirmed",
      });
      await ctx.db.patch(leadId, { convertedEventId: alheio });
    });
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    // Some, como qualquer lead sem herdeiro legítimo — nunca vaza para a outra.
    expect(await t.run(async (ctx) => ctx.db.get(docId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).toBeNull();
  });

  it("apagar o EVENTO depois leva o documento herdado, arquivo incluído", async () => {
    const { t, leadId, eventId, docId, arquivo } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    await t.run(async (ctx) => deleteEventCascade(ctx, eventId));
    expect(await t.run(async (ctx) => ctx.db.get(docId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).toBeNull();
  });

  it("apagar o EVENTO com o lead VIVO não encosta no documento do lead", async () => {
    const { t, eventId, docId, arquivo } = await convertido();
    await t.run(async (ctx) => deleteEventCascade(ctx, eventId));
    expect(await t.run(async (ctx) => ctx.db.get(docId))).not.toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).not.toBeNull();
  });

  it("excluir a EMPRESA não deixa arquivo herdado para trás", async () => {
    // A ordem importa: eventos saem primeiro (levando os herdados), depois os
    // leads. Um documento que escapasse das duas viraria arquivo cobrado sem
    // dono nenhum.
    const { t, leadId, donaId, arquivo } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    await t.run(async (ctx) => deleteUserDataCascade(ctx, donaId));
    const sobrou = await t.run(async (ctx) =>
      (await ctx.db.query("leadDocuments").withIndex("by_user", (q) => q.eq("userId", donaId))
        .collect()).length,
    );
    expect(sobrou).toBe(0);
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).toBeNull();
  });

  it("o documento herdado continua podendo ser excluído pela dona", async () => {
    const { t, leadId, donaId, docId, arquivo } = await convertido();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    const r = await t.run(async (ctx) => removeEspelho(ctx, donaId, docId));
    expect(r).toEqual({ removido: true });
    expect(await t.run(async (ctx) => ctx.storage.getUrl(arquivo))).toBeNull();
  });
});

describe("cascata — documento não sobrevive ao lead", () => {
  it("apagar o lead apaga documentos E arquivos", async () => {
    const { t, leadId, docId, arquivo } = await cenario();
    const resumo = await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    expect(resumo).toEqual({ events: 0, documents: 2, files: 1 });
    const [lead, doc, url] = await t.run(async (ctx) => [
      await ctx.db.get(leadId),
      await ctx.db.get(docId),
      await ctx.storage.getUrl(arquivo),
    ]);
    expect(lead).toBeNull();
    expect(doc).toBeNull();
    expect(url).toBeNull();
  });

  it("apagar o lead NÃO toca no documento de outra decoradora", async () => {
    const { t, leadId, docDaOutraId, arquivoDaOutra } = await cenario();
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    const [doc, url] = await t.run(async (ctx) => [
      await ctx.db.get(docDaOutraId),
      await ctx.storage.getUrl(arquivoDaOutra),
    ]);
    expect(doc).not.toBeNull();
    expect(url).not.toBeNull();
  });

  it("apagar o lead NÃO apaga o evento que ele gerou", async () => {
    const { t, donaId, leadId } = await cenario();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        userId: donaId, name: "Casamento", type: "wedding", date: "2026-12-12",
        location: "Salão", clientName: "Noiva", status: "planning",
      });
      await ctx.db.patch(leadId, { convertedEventId: id });
      return id;
    });
    await t.run(async (ctx) => deleteLeadCascade(ctx, leadId));
    expect(await t.run(async (ctx) => ctx.db.get(eventId))).not.toBeNull();
  });

  it("apagar a EMPRESA leva os documentos comerciais e os arquivos", async () => {
    const { t, donaId, docId, arquivo, docDaOutraId, arquivoDaOutra } = await cenario();
    await t.run(async (ctx) => deleteUserDataCascade(ctx, donaId));
    const [doc, url, alheio, urlAlheia] = await t.run(async (ctx) => [
      await ctx.db.get(docId),
      await ctx.storage.getUrl(arquivo),
      await ctx.db.get(docDaOutraId),
      await ctx.storage.getUrl(arquivoDaOutra),
    ]);
    expect(doc).toBeNull();
    expect(url).toBeNull();
    expect(alheio).not.toBeNull(); // a outra empresa fica intacta
    expect(urlAlheia).not.toBeNull();
  });

  it("cascata não quebra quando o arquivo já sumiu do storage", async () => {
    const { t, leadId, arquivo } = await cenario();
    await t.run(async (ctx) => ctx.storage.delete(arquivo));
    await expect(t.run(async (ctx) => deleteLeadCascade(ctx, leadId))).resolves.toBeTruthy();
    expect(await t.run(async (ctx) => ctx.db.get(leadId))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AMARRA — o espelho acima só vale se a FONTE fizer o mesmo.
// ─────────────────────────────────────────────────────────────────────────────
describe("o código de verdade tem as guardas que o espelho reproduz", () => {
  it("`save` confirma o dono do lead ANTES de gravar", () => {
    const corpo = corpoDe("save");
    expect(corpo).toContain("requireLeadOwner");
    const posicaoGuarda = corpo.indexOf("requireLeadOwner");
    const posicaoInsert = corpo.indexOf("ctx.db.insert");
    expect(posicaoGuarda).toBeLessThan(posicaoInsert);
  });

  it("`save` grava o userId resolvido pela sessão, nunca um vindo do cliente", () => {
    expect(corpoDe("save")).toContain("userId: user._id");
    expect(FONTE).not.toMatch(/userId:\s*v\.id\("users"\)/);
  });

  it("`list` e `listForEvent` degradam para vazio em vez de lançar", () => {
    expect(corpoDe("list")).toMatch(/getOwnedLead[\s\S]{0,60}return \[\]/);
    expect(corpoDe("listForEvent")).toMatch(/getOwnedEvent[\s\S]{0,120}return \[\]/);
  });

  it("`remove` compara o dono e é idempotente", () => {
    const corpo = corpoDe("remove");
    expect(corpo).toContain("doc.userId !== user._id");
    expect(corpo).toMatch(/if \(!doc\) return \{ removido: false \}/);
  });

  it("`remove` usa safeDeleteFile — arquivo ausente não trava a exclusão", () => {
    expect(corpoDe("remove")).toContain("safeDeleteFile");
  });

  it("nenhuma leitura alcança o arquivo por storageId solto do cliente", () => {
    // Toda query recebe leadId ou eventId; um storageId vindo do navegador
    // nunca é usado para BUSCAR — só para gravar depois da guarda de posse.
    for (const fn of ["list", "listForEvent", "remove"]) {
      expect(corpoDe(fn)).not.toContain('v.id("_storage")');
    }
  });

  it("`funil.deleteLead` passa pela cascata (não apaga só a linha)", () => {
    const funil = readFileSync("convex/funil.ts", "utf-8");
    const i = funil.indexOf("export const deleteLead");
    const corpo = funil.slice(i, funil.indexOf("\nexport ", i + 1));
    expect(corpo).toContain("deleteLeadCascade");
    expect(corpo).not.toMatch(/ctx\.db\.delete\(args\.id\)/);
  });
});
