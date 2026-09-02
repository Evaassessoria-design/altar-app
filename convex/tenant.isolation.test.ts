import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE ISOLAMENTO ENTRE EMPRESAS
//
// A empresa A nunca pode ler nem alterar dado da empresa B.
//
// Por que inspeção de fonte e não chamada real: o componente Better Auth não é
// registrado no convex-test, então não há como autenticar duas empresas
// diferentes e chamar as queries de verdade. A alternativa honesta é exigir,
// por leitura do código, que TODA função pública tenha um dos guardas de posse.
//
// É uma trava contra o esquecimento — o modo real como este tipo de vazamento
// nasce: alguém acrescenta uma query nova e esquece o `requireUser`.
// ─────────────────────────────────────────────────────────────────────────────

/** Guardas que resolvem a identidade e a posse do dado. */
const GUARDAS = [
  "requireAdmin", // painel: exige administrador do ALTAR
  "requireEventOwner", // lança se o evento não for do usuário
  "getOwnedEvent", // devolve null se o evento não for do usuário
  "requireLeadOwner", // lança se o lead do funil não for do usuário
  "getOwnedLead", // devolve null se o lead do funil não for do usuário
  "requireActiveAccess", // paywall; resolve o usuário via requireUser
  "requireUser", // resolve o usuário; a função filtra por ele
];

// `requireIdentity` NÃO entra nesta lista de propósito: ele confirma que há
// sessão, mas não resolve DE QUEM é o dado. Numa função que lê ou grava
// registro, sozinho ele seria um buraco.


/**
 * Funções sem guarda de posse, com o motivo. Toda exceção é declarada aqui:
 * se alguém acrescentar uma query desprotegida, o teste quebra em vez de o
 * vazamento passar despercebido.
 */
const SEM_GUARDA_JUSTIFICADO: Record<string, string> = {
  "admin.isAdmin":
    "responde sobre o PRÓPRIO chamador (getOptionalUser) e devolve só um booleano",
  "landingLeads.submit":
    "chamada pela landing por visitante NÃO autenticado; grava, nunca lê",

  // As quatro abaixo usam `requireIdentity`: exigem sessão, mas devolvem uma
  // URL de upload que não está atrelada a tenant nenhum. Ela só produz um
  // `storageId`; transformar esse id em dado do evento passa por outra
  // mutation, essa sim com guarda de posse (ex.: `saveContract` →
  // `requireEventOwner`). O isolamento acontece na gravação, não na URL.
  "contracts.generateUploadUrl": "URL de upload sem vínculo com tenant",
  "suppliers.generateUploadUrl": "URL de upload sem vínculo com tenant",
  "assemblyItems.generateUploadUrl": "URL de upload sem vínculo com tenant",
  "gallery.generateUploadUrl": "URL de upload sem vínculo com tenant",
  "leadDocuments.generateUploadUrl": "URL de upload sem vínculo com tenant",
};

/** Módulos tocados ou recém-expostos nesta rodada e na anterior. */
const MODULOS = [
  "supplierCatalog",
  "contracts",
  "team",
  "briefing",
  "health",
  "admin",
  "landingLeads",
  "purchases",
  "financeiro",
  "suppliers",
  "assemblyItems",
  "gallery",
  "funil",
  "events",
  "leadDocuments",
];

type Funcao = { id: string; tipo: string; corpo: string };

function funcoesPublicas(modulo: string): Funcao[] {
  const src = readFileSync(`convex/${modulo}.ts`, "utf-8");
  const out: Funcao[] = [];
  const re = /export const (\w+)\s*=\s*(internal)?(query|mutation|action)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[2]) continue; // internal* não é alcançável pelo cliente
    const proximo = src.indexOf("\nexport ", m.index + 1);
    out.push({
      id: `${modulo}.${m[1]}`,
      tipo: m[3],
      corpo: src.slice(m.index, proximo === -1 ? undefined : proximo),
    });
  }
  return out;
}

const TODAS = MODULOS.flatMap(funcoesPublicas);

describe("isolamento entre empresas", () => {
  it("a auditoria encontrou funções para checar", () => {
    // Se um refactor mudar a forma dos exports, este teste avisa em vez de
    // passar vazio dando falsa segurança.
    expect(TODAS.length).toBeGreaterThan(50);
  });

  it.each(TODAS.map((f) => [f.id, f]) as [string, Funcao][])(
    "%s tem guarda de posse",
    (id, f) => {
      if (id in SEM_GUARDA_JUSTIFICADO) return;
      const temGuarda = GUARDAS.some((g) => f.corpo.includes(g));
      expect(
        temGuarda,
        `${id} é pública e não usa nenhum guarda (${GUARDAS.join(", ")}). ` +
          "Se for intencional, declare em SEM_GUARDA_JUSTIFICADO com o motivo.",
      ).toBe(true);
    },
  );

  it("toda exceção declarada existe de verdade", () => {
    // Impede que a lista de exceções vire lixo protegendo função que já sumiu.
    const ids = new Set(TODAS.map((f) => f.id));
    for (const id of Object.keys(SEM_GUARDA_JUSTIFICADO)) {
      expect(ids.has(id), `Exceção declarada para "${id}", que não existe mais`).toBe(true);
    }
  });
});

describe("catálogo central: consultas presas ao dono", () => {
  const src = readFileSync("convex/supplierCatalog.ts", "utf-8");

  it("a listagem usa índice por usuário — nunca varre a tabela inteira", () => {
    // `ctx.db.query("suppliers").collect()` sem índice devolveria o catálogo
    // de TODAS as empresas.
    expect(src).toContain('withIndex("by_user"');
    expect(src).not.toMatch(/query\("suppliers"\)\s*\.collect\(\)/);
  });

  it("get, update e setArchived comparam o dono antes de responder", () => {
    for (const fn of ["get", "listEventsForSupplier", "update", "setArchived"]) {
      const i = src.indexOf(`export const ${fn} =`);
      const proximo = src.indexOf("\nexport ", i + 1);
      const corpo = src.slice(i, proximo === -1 ? undefined : proximo);
      expect(corpo, `${fn} não compara userId`).toMatch(/userId !== user\._id/);
    }
  });

  it("o histórico de eventos filtra os vínculos pelo dono", () => {
    const i = src.indexOf("export const listEventsForSupplier =");
    const proximo = src.indexOf("\nexport ", i + 1);
    expect(src.slice(i, proximo)).toContain("userId === user._id");
  });
});

describe("pasta do evento e resumo: presos ao evento do dono", () => {
  it("listDocuments só responde para evento do usuário", () => {
    const src = readFileSync("convex/contracts.ts", "utf-8");
    const i = src.indexOf("export const listDocuments =");
    const corpo = src.slice(i);
    expect(corpo).toContain("getOwnedEvent");
    expect(corpo).toMatch(/if \(!\(await getOwnedEvent[\s\S]{0,60}return \[\]/);
  });

  it("getEventSummary só responde para evento do usuário", () => {
    const src = readFileSync("convex/health.ts", "utf-8");
    const i = src.indexOf("export const getEventSummary =");
    const corpo = src.slice(i);
    expect(corpo).toContain("getOwnedEvent");
    expect(corpo).toMatch(/if \(!event\) return null/);
    // E toda leitura seguinte é presa ao eventId já validado.
    expect(corpo).not.toMatch(/\.collect\(\)[\s\S]{0,40}filter\(\(\w\) => \w\.userId/);
  });
});
