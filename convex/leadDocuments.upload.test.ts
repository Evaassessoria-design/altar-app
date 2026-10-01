import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => {
  const usuarioDaSessao = async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string; email?: string } | null> };
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { _id: identity.subject, email: identity.email ?? "", name: "Pessoa" };
  };
  return {
    authComponent: {
      safeGetAuthUser: usuarioDaSessao,
      getAuthUser: usuarioDaSessao,
      registerRoutes: () => {},
      adapter: () => ({}),
    },
    createAuth: () => ({}),
  };
});

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { MB, TAMANHO_MAXIMO_DOCUMENTO } from "./lib/arquivos";
import { motivoParaRecusarArquivo } from "./lib/tiposDeDocumento";
import { validarArquivo } from "../src/lib/upload";

// ═════════════════════════════════════════════════════════════════════════════
// O DOCX DE 3,9 MB QUE FOI RECUSADO EM PRODUÇÃO
//
// Funil → Documentos → Orçamento. O arquivo subia inteiro para o storage e só
// então o registro era recusado, com "acima do limite de 1.000.000. Confira os
// zeros." — para quem não digitou zero nenhum: escolheu um arquivo.
//
// ── O QUE ESTE ARQUIVO PROVA ────────────────────────────────────────────────
// Que o mesmo arquivo atravessa AS TRÊS PORTAS e vira registro. Não basta a
// terceira ter sido corrigida: o defeito era as três discordarem, e é a
// concordância que este teste guarda.
//
//   1ª  `motivoParaRecusarArquivo`  — a tela do funil
//   2ª  `validarArquivo`            — o hook compartilhado
//   3ª  `leadDocuments.save`        — o backend, autoridade final
// ═════════════════════════════════════════════════════════════════════════════

/** 3,9 MB = 4.089.446 bytes. Quatro vezes o teto que recusava. */
const DOCX_39MB = Math.round(3.9 * MB);

const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id;
    const lead = await ctx.db.insert("leads", {
      userId: donaId,
      clientName: "Marina",
      stage: "contact",
      order: 0,
    });
    return { donaId, lead };
  });

  /** Um arquivo de verdade no storage, como o POST do navegador deixaria. */
  const subir = async (conteudo = "docx") =>
    t.run(async (ctx) => ctx.storage.store(new Blob([conteudo], { type: MIME_DOCX })));

  const anexar = async (bytes: number | undefined, nome = "Orçamento Marina.docx") => {
    const storageId = await subir();
    return dona.mutation(api.leadDocuments.save, {
      leadId: ids.lead,
      storageId,
      fileName: nome,
      documentType: "proposta",
      mimeType: MIME_DOCX,
      fileSize: bytes,
    });
  };

  return { t, dona, ids, subir, anexar };
}

// ─────────────────────────────────────────────────────────────────────────────
// O CASO REAL, NAS TRÊS PORTAS
// ─────────────────────────────────────────────────────────────────────────────

describe("o DOCX de 3,9 MB atravessa as três portas", () => {
  const arquivo = { name: "Orçamento Marina.docx", type: MIME_DOCX, size: DOCX_39MB };

  it("1ª porta — a tela do funil aceita", () => {
    expect(motivoParaRecusarArquivo(arquivo)).toBeNull();
  });

  it("2ª porta — o hook compartilhado aceita", () => {
    expect(validarArquivo(arquivo, { tipo: "documento" }).ok).toBe(true);
  });

  it("3ª porta — o backend aceita E grava o registro", async () => {
    const c = await cenario();
    const id = await c.anexar(DOCX_39MB);

    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs).toHaveLength(1);
    expect(docs[0]?.fileName).toBe("Orçamento Marina.docx");
    expect(docs[0]?.fileSize).toBe(DOCX_39MB);
    expect(docs[0]?.documentType).toBe("proposta");
    expect(id).toBeTruthy();
  });

  it("e o tamanho aparece legível na lista, não em bytes crus", async () => {
    const c = await cenario();
    await c.anexar(DOCX_39MB);
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    // A decoradora nunca precisa interpretar bytes.
    expect(docs[0]?.fileSize).toBe(DOCX_39MB);
    expect(String(docs[0]?.fileSize)).not.toContain("NaN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AS BORDAS, NO BACKEND
// ─────────────────────────────────────────────────────────────────────────────

describe("o backend é autoridade final, e concorda com a tela", () => {
  it.each([
    ["500 KB", 500 * 1024],
    ["1 MB", 1 * MB],
    ["3,9 MB", DOCX_39MB],
    ["10 MB", 10 * MB],
    ["19,9 MB", Math.round(19.9 * MB)],
    ["20 MB exatos", TAMANHO_MAXIMO_DOCUMENTO],
  ])("%s é aceito e gera registro", async (_r, bytes) => {
    const c = await cenario();
    await expect(c.anexar(bytes)).resolves.toBeTruthy();
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs[0]?.fileSize).toBe(bytes);
  });

  it("20 MB + 1 byte é recusado, com a frase de gente", async () => {
    const c = await cenario();
    await expect(c.anexar(TAMANHO_MAXIMO_DOCUMENTO + 1)).rejects.toThrow(
      /ultrapassa o limite de 20 MB/,
    );
  });

  it("a recusa NÃO fala em zeros nem em 1.000.000", async () => {
    const c = await cenario();
    let recado = "";
    try {
      await c.anexar(TAMANHO_MAXIMO_DOCUMENTO + 1);
    } catch (e: unknown) {
      recado = (e as { data?: { message?: string } }).data?.message ?? String(e);
    }
    expect(recado).not.toMatch(/zeros/i);
    expect(recado).not.toMatch(/1\.000\.000|1000000/);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negativo", -1],
  ])("%s é recusado antes de virar linha", async (_r, valor) => {
    const c = await cenario();
    await expect(c.anexar(valor)).rejects.toThrow();
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs).toEqual([]);
  });

  it("ZERO é recusado — arquivo vazio não é documento, e as três portas concordam", async () => {
    const c = await cenario();
    const vazio = { name: "vazio.pdf", type: "application/pdf", size: 0 };
    expect(motivoParaRecusarArquivo(vazio)).toBe("O arquivo está vazio.");
    expect(validarArquivo(vazio, { tipo: "documento" }).ok).toBe(false);
    await expect(c.anexar(0)).rejects.toThrow(/vazio/i);
  });

  it("tamanho AUSENTE passa — documento antigo foi gravado antes do campo", async () => {
    const c = await cenario();
    await expect(c.anexar(undefined)).resolves.toBeTruthy();
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs[0]?.fileSize).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A CONCORDÂNCIA É O QUE IMPEDE O ÓRFÃO
// ─────────────────────────────────────────────────────────────────────────────

describe("tela e servidor não discordam em nenhuma borda", () => {
  // Esta é a trava que fecha a CAUSA do arquivo órfão: o órfão nascia de a
  // tela dizer sim, o arquivo subir, e o servidor dizer não. Enquanto as duas
  // respostas forem iguais, o envio não chega a acontecer para ser rejeitado.
  const BORDAS = [
    1,
    500 * 1024,
    1 * MB,
    DOCX_39MB,
    10 * MB,
    TAMANHO_MAXIMO_DOCUMENTO - 1,
    TAMANHO_MAXIMO_DOCUMENTO,
    TAMANHO_MAXIMO_DOCUMENTO + 1,
    30 * MB,
  ];

  it.each(BORDAS.map((b) => [b] as const))("%d bytes: as duas portas dizem o mesmo", async (bytes) => {
    const telaAceita = motivoParaRecusarArquivo({ name: "a.pdf", size: bytes }) === null;
    const hookAceita = validarArquivo(
      { name: "a.pdf", type: "application/pdf", size: bytes },
      { tipo: "documento" },
    ).ok;

    const c = await cenario();
    let backendAceita = true;
    try {
      await c.anexar(bytes, "a.pdf");
    } catch {
      backendAceita = false;
    }

    expect({ telaAceita, hookAceita, backendAceita }).toEqual({
      telaAceita: backendAceita,
      hookAceita: backendAceita,
      backendAceita,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E NADA DISSO AFROUXOU A FRONTEIRA DA CONTA
// ─────────────────────────────────────────────────────────────────────────────

describe("o limite novo não abriu porta nenhuma", () => {
  it("a rival não anexa no lead da dona, nem com arquivo válido", async () => {
    const c = await cenario();
    const rival = await autenticarComo(c.t, {
      nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
    });
    const storageId = await c.subir();

    await expect(
      rival.mutation(api.leadDocuments.save, {
        leadId: c.ids.lead,
        storageId,
        fileName: "intruso.pdf",
        fileSize: 1 * MB,
      }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
  });

  it("deslogado não anexa", async () => {
    const c = await cenario();
    const storageId = await c.subir();
    await expect(
      c.t.mutation(api.leadDocuments.save, {
        leadId: c.ids.lead,
        storageId,
        fileName: "x.pdf",
        fileSize: 1 * MB,
      }),
    ).rejects.toThrow();
  });

  it("documento sem nome é recusado", async () => {
    const c = await cenario();
    await expect(c.anexar(1 * MB, "   ")).rejects.toThrow(/sem nome|INVALID/i);
  });
});
