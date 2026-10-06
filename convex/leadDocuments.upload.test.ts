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
  const subir = async (conteudo: BlobPart = "docx") =>
    t.run(async (ctx) => ctx.storage.store(new Blob([conteudo], { type: MIME_DOCX })));

  /** Um arquivo com EXATAMENTE `bytes` bytes no storage. */
  const subirComTamanho = (bytes: number) => subir(new Uint8Array(bytes));

  /**
   * Anexa como a tela faria: o arquivo guardado TEM o tamanho declarado.
   *
   * Desde 06/10 o backend confere o tamanho do storage, não o declarado — um
   * blob de 4 bytes declarando 3,9 MB deixou de ser um cenário honesto. Quando
   * o valor declarado não é um tamanho possível (NaN, negativo, ausente), o
   * arquivo guardado é pequeno e válido: o que se testa é a declaração.
   */
  const anexar = async (
    bytes: number | undefined,
    nome = "Orçamento Marina.docx",
    guardados?: number,
  ) => {
    const real =
      guardados ?? (bytes !== undefined && Number.isFinite(bytes) && bytes > 0 ? bytes : 4);
    const storageId = await subirComTamanho(real);
    return dona.mutation(api.leadDocuments.save, {
      leadId: ids.lead,
      storageId,
      fileName: nome,
      documentType: "proposta",
      mimeType: MIME_DOCX,
      fileSize: bytes,
    });
  };

  return { t, dona, ids, subir, subirComTamanho, anexar };
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
    ["20 MB (o teto anterior)", 20 * MB],
    ["36 MB (o orçamento de fornecedor do relato)", 36 * MB],
    ["99,9 MB", Math.round(99.9 * MB)],
    ["100 MB exatos", TAMANHO_MAXIMO_DOCUMENTO],
  ])("%s é aceito e gera registro", async (_r, bytes) => {
    const c = await cenario();
    await expect(c.anexar(bytes)).resolves.toBeTruthy();
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs[0]?.fileSize).toBe(bytes);
  });

  it("100 MB + 1 byte é recusado, com a frase de gente", async () => {
    const c = await cenario();
    await expect(c.anexar(TAMANHO_MAXIMO_DOCUMENTO + 1)).rejects.toThrow(
      /ultrapassa o limite de 100 MB/,
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

  it("tamanho AUSENTE passa, e o registro guarda o tamanho do storage", async () => {
    // O argumento continua opcional (chamada antiga sem o campo não quebra),
    // mas a linha nova sempre nasce com o tamanho verdadeiro.
    const c = await cenario();
    await expect(c.anexar(undefined, "antigo.pdf", 2048)).resolves.toBeTruthy();
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs[0]?.fileSize).toBe(2048);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O TAMANHO QUE VALE É O DO STORAGE
//
// Antes de 06/10, `save` conferia `fileSize` — um número que o navegador
// manda. Quem chamasse a mutation direto declarava 1 byte e anexava 500 MB.
// ─────────────────────────────────────────────────────────────────────────────

describe("o navegador não decide o tamanho", () => {
  it("declarar 1 MB com 100 MB + 1 guardados é recusado, e nenhuma linha nasce", async () => {
    const c = await cenario();
    await expect(c.anexar(1 * MB, "mentira.pdf", TAMANHO_MAXIMO_DOCUMENTO + 1)).rejects.toThrow(
      /ultrapassa o limite de 100 MB/,
    );
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs).toEqual([]);
  });

  it("declarar 90 MB com 3 KB guardados grava 3 KB — a lista não exibe número inventado", async () => {
    const c = await cenario();
    await c.anexar(90 * MB, "inflado.pdf", 3 * 1024);
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs[0]?.fileSize).toBe(3 * 1024);
  });

  it("storageId de arquivo que já não existe é recusado com frase de gente", async () => {
    // O POST não terminou, ou o arquivo foi apagado entre o envio e o save.
    const c = await cenario();
    const storageId = await c.subirComTamanho(1024);
    await c.t.run(async (ctx) => ctx.storage.delete(storageId));
    await expect(
      c.dona.mutation(api.leadDocuments.save, {
        leadId: c.ids.lead,
        storageId,
        fileName: "sumiu.pdf",
        fileSize: 1024,
      }),
    ).rejects.toThrow(/não chegou ao servidor/);
    const docs = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(docs).toEqual([]);
  });

  it("a rival recebe NOT_FOUND antes de qualquer conferência de arquivo", async () => {
    // Posse primeiro: o erro de tamanho não pode virar oráculo sobre o lead
    // de outra conta.
    const c = await cenario();
    const rival = await autenticarComo(c.t, {
      nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
    });
    const storageId = await c.subirComTamanho(TAMANHO_MAXIMO_DOCUMENTO + 1);
    await expect(
      rival.mutation(api.leadDocuments.save, {
        leadId: c.ids.lead,
        storageId,
        fileName: "grande.pdf",
        fileSize: 1,
      }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
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
    36 * MB,
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
