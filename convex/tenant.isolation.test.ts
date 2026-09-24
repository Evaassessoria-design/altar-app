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
  // Mesma semântica de `requireUser` para as queries que degradam para null:
  // resolve QUEM está chamando, e a função compara o dono logo em seguida.
  "getOptionalUser",
  // Guarda de posse do módulo `propostas`, com a MESMA forma de
  // `requireEventOwner`: resolve a sessão por `requireUser`, lê o registro,
  // compara o dono e responde NOT_FOUND para id de outra conta.
  //
  // Entra na lista por ser um guarda de verdade, não por conveniência — e a
  // prova disso é o teste logo abaixo, que confere o que ele faz por dentro.
  // Sem essa checagem, acrescentar um nome aqui seria a maneira mais fácil de
  // desligar esta trava inteira.
  "minhaProposta",
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

  // Responde se o provedor de IMAGEM está configurado no AMBIENTE — um
  // booleano sobre a instalação, não sobre a conta. Exige sessão
  // (`requireIdentity`) para não virar sonda pública do que está ligado no
  // servidor, e não há dado de tenant para isolar.
  "layoutRenders.providerStatus": "booleano sobre o ambiente, não sobre a conta",
};

/** Módulos tocados ou recém-expostos nesta rodada e nas anteriores. */
const MODULOS = [
  // ── Central de Comunicações ──────────────────────────────────────────────
  // Operação do SaaS ALTAR, não dado de decoradora. O guarda de posse aqui é
  // `requireAdmin`: estas funções leem conversas do número comercial da
  // ALTAR, interessados da landing e assinantes — nunca o funil de clientes
  // de ninguém. Registrar os módulos aqui é o que faz esta trava vigiá-los.
  "communications",
  "adminApprovals",
  "adminWorkItems",
  "customerVoice",
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
  "materials",
  "compositions",
  "fichaTecnica",
  "acervo",
  // ── LACUNA FECHADA ───────────────────────────────────────────────────────
  // `propostas` ficou fora desta lista desde que o módulo nasceu, e a auditoria
  // de jornada registrou isso como lacuna de cobertura. Não havia defeito — as
  // funções sempre passaram por `minhaProposta`/`requireUser` —, mas a trava
  // que vigia o resto do produto não vigiava justamente o documento que vai
  // para a cliente.
  "propostas",
  // O Assistente da decoradora entra desde o primeiro dia: é a superfície mais
  // nova a ler dado de negócio, e a que mais depende de a posse vir da sessão.
  "assistente",
  "orcamento",
  "layoutRenders",
  "dashboard",
  "agenda",
  "notifications",
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

  it("panorama, update e setArchived comparam o dono antes de responder", () => {
    // `get` estava nesta lista e foi REMOVIDO do módulo: nasceu sem tela e
    // continuou sem tela depois que `panorama` passou a responder pela página
    // do fornecedor. Quem herdou a pergunta herda a guarda.
    for (const fn of ["panorama", "listEventsForSupplier", "update", "setArchived"]) {
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


// ─────────────────────────────────────────────────────────────────────────────
// UM NOME NA LISTA DE GUARDAS PRECISA SER UM GUARDA
//
// `GUARDAS` é uma lista de STRINGS conferida contra o texto da função. É
// poderosa e é frágil pelo mesmo motivo: acrescentar um nome ali é a maneira
// mais fácil de desligar esta trava inteira, e ninguém repararia.
//
// `minhaProposta` entrou nesta rodada. Este bloco existe para que ela tenha de
// continuar fazendo o que um guarda faz.
// ─────────────────────────────────────────────────────────────────────────────
describe("minhaProposta é mesmo um guarda de posse", () => {
  const PROPOSTAS = readFileSync("convex/propostas.ts", "utf-8");
  const corpo = PROPOSTAS.slice(
    PROPOSTAS.indexOf("async function minhaProposta"),
    PROPOSTAS.indexOf("/** O que a lista mostra"),
  );

  it("resolve a sessão", () => {
    expect(corpo).toContain("requireUser(ctx)");
  });

  it("compara o dono do registro com a sessão", () => {
    expect(corpo).toMatch(/proposta\.userId\s*!==\s*user\._id/);
  });

  it("responde NOT_FOUND, nunca FORBIDDEN", () => {
    // Confirmar que o id existe já seria contar que aquela empresa tem uma
    // proposta. É a regra do produto inteiro.
    expect(corpo).toContain('code: "NOT_FOUND"');
    expect(corpo).not.toContain("FORBIDDEN");
  });

  it("lança em vez de devolver — quem chama não tem como esquecer de checar", () => {
    expect(corpo).toContain("throw new ConvexError");
  });
});
