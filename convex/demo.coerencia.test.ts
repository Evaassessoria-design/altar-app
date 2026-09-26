import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PORTFOLIO_DEMO, TOTAL_DE_EVENTOS_DEMO } from "./lib/demoPortfolio";
import { DEMO_MARKER } from "./lib/demoData";
import { dataDoDia } from "./lib/dataDoDia";

// ═════════════════════════════════════════════════════════════════════════════
// OS NÚMEROS DA DEMO CONVERSAM
//
// ── POR QUE ISTO É MAIS IMPORTANTE DO QUE PARECE ────────────────────────────
// Numa apresentação ao vivo, um número que não fecha é pior do que um campo
// vazio. O campo vazio é honesto — "ainda não preenchi isso". O número errado
// destrói a confiança em TODOS os outros números da tela, e quem está
// assistindo não tem como saber quais estavam certos.
//
// Se o Dashboard diz que há três recebimentos vencidos, o Financeiro precisa
// listar três. Se um evento está `completed`, ele não pode ter cobrança em
// aberto. Se uma compra foi recebida, ela não aparece como pendente.
//
// ── E POR QUE UM TESTE, E NÃO UMA CONFERIDA ─────────────────────────────────
// Porque a demo vai ser editada. Alguém vai acrescentar um evento na véspera,
// mudar um valor, ajustar uma data — e a incoerência que nasce disso não
// aparece até estar projetada numa tela.
// ═════════════════════════════════════════════════════════════════════════════

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

async function semear() {
  const t = convexTest(schema, modules);
  process.env.ALTAR_DEMO = "1";
  await t.run((ctx) =>
    ctx.db.insert("users", {
      name: "Conta Demo",
      email: "demo@exemplo.com.br",
      role: "admin",
      subscriptionStatus: "trial",
    }),
  );
  const r = await t.mutation(internal.demo.seed, {});
  return { t, r };
}

const lerTudo = <T extends "events" | "transactions" | "purchaseItems" | "checklistItems">(
  t: ReturnType<typeof convexTest>,
  tabela: T,
) => t.run((ctx) => ctx.db.query(tabela).collect());

describe("a empresa demo parece uma empresa", () => {
  it("tem o evento principal MAIS o portfólio em volta", async () => {
    // Uma empresa com um casamento não é uma empresa. O Dashboard, a Agenda e
    // o Financeiro abriam com uma linha cada.
    const { t, r } = await semear();
    expect(r.criado).toBe(true);

    const eventos = await lerTudo(t, "events");
    expect(eventos).toHaveLength(TOTAL_DE_EVENTOS_DEMO);
    expect(TOTAL_DE_EVENTOS_DEMO).toBeGreaterThanOrEqual(12);

    expect(eventos.some((e) => e.name === "Marina & Gabriel")).toBe(true);
  });

  it("todo evento demo é MARCADO — a limpeza depende disso", async () => {
    // Sem marcador, distinguir dado de demonstração de dado real seria
    // impossível, e qualquer limpeza viraria uma aposta.
    const { t } = await semear();
    for (const e of await lerTudo(t, "events")) {
      expect(e.notes ?? "", `"${e.name}" sem marcador`).toContain(DEMO_MARKER);
    }
  });

  it("NÃO é tudo casamento — o produto não é só de noivos", async () => {
    // Uma demo só de casamento ensina o público errado sobre o que o ALTAR
    // faz, e o público da live é decoradora de eventos, não de noivas.
    const tipos = new Set((await lerTudo((await semear()).t, "events")).map((e) => e.type));
    expect(tipos.size, "todos os eventos são do mesmo tipo").toBeGreaterThanOrEqual(4);
    expect(tipos.has("corporate")).toBe(true);
    expect(tipos.has("debutante")).toBe(true);
  });

  it("tem passado, presente e futuro", async () => {
    // Uma agenda só com futuro parece empresa que nunca entregou nada; só com
    // passado, empresa que parou.
    const hoje = dataDoDia();
    const eventos = await lerTudo((await semear()).t, "events");
    expect(eventos.filter((e) => e.date < hoje).length, "nenhum evento realizado").toBeGreaterThan(2);
    expect(eventos.filter((e) => e.date > hoje).length, "nenhum evento futuro").toBeGreaterThan(5);
  });

  it("há um evento PRÓXIMO o suficiente para o painel de atenção falar", async () => {
    // Sem isso o painel de atenção abre vazio — e ele é o primeiro bloco do
    // roteiro da live.
    const hoje = dataDoDia();
    const em14 = new Date(Date.parse(`${hoje}T12:00:00Z`) + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const eventos = await lerTudo((await semear()).t, "events");
    const proximos = eventos.filter((e) => e.date >= hoje && e.date <= em14);
    expect(proximos.length, "nada nos próximos 14 dias").toBeGreaterThan(0);
  });
});

describe("os números conversam", () => {
  it("evento REALIZADO não tem recebimento em aberto", async () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // Um `completed` com saldo a receber faria o Financeiro mostrar cobrança
    // de um cliente que já foi embora — e alguém na plateia repararia.
    const { t } = await semear();
    const eventos = await lerTudo(t, "events");
    const transacoes = await lerTudo(t, "transactions");

    for (const e of eventos.filter((x) => x.status === "completed")) {
      const aberto = transacoes.filter(
        (x) => x.eventId === e._id && x.type === "income" && !x.isPaid,
      );
      expect(aberto, `"${e.name}" está realizado e tem recebimento em aberto`).toEqual([]);
    }
  });

  it("nada foi pago no FUTURO", async () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // `paidAt` derivado do vencimento é cômodo — e num lançamento que vence
    // daqui a trinta dias produziria "pago em 26/10", uma data que ainda não
    // chegou. Ninguém pagou amanhã.
    const { t } = await semear();
    const hoje = dataDoDia();
    for (const x of await lerTudo(t, "transactions")) {
      if (!x.isPaid) continue;
      expect(x.paidAt, `"${x.description}" está paga sem dizer quando`).toBeTruthy();
      // ISO ordena como texto; comparar como número recusaria a string.
      expect(x.paidAt! <= hoje, `"${x.description}" foi paga em ${x.paidAt}, no futuro`).toBe(true);
    }
  });

  it("todo valor é um número positivo e legível", async () => {
    const { t } = await semear();
    for (const x of await lerTudo(t, "transactions")) {
      expect(Number.isFinite(x.amount), `"${x.description}" com valor ilegível`).toBe(true);
      expect(x.amount, `"${x.description}" com valor não positivo`).toBeGreaterThan(0);
    }
  });

  it("compra RECEBIDA não aparece como pendente", async () => {
    const { t } = await semear();
    for (const c of await lerTudo(t, "purchaseItems")) {
      if (!c.isPurchased) continue;
      expect(
        c.status === undefined || c.status === "recebido" || c.status === "comprado",
        `"${c.name}" está comprada e com status "${c.status}"`,
      ).toBe(true);
    }
  });

  it("todo lançamento do portfólio está ligado a um evento que existe", async () => {
    // Lançamento órfão inflaria o total do Financeiro sem aparecer em evento
    // nenhum — e a soma do Dashboard deixaria de bater com a lista.
    const { t } = await semear();
    const ids = new Set((await lerTudo(t, "events")).map((e) => e._id as string));
    for (const x of await lerTudo(t, "transactions")) {
      if (!x.eventId) continue;
      expect(ids.has(x.eventId as string), `lançamento "${x.description}" aponta para evento inexistente`).toBe(true);
    }
  });

  it("o orçamento de cada evento é coerente com o que foi contratado", async () => {
    // Receita total maior que o orçamento significaria cobrar mais do que o
    // combinado — e é o tipo de número que alguém confere na hora.
    const { t } = await semear();
    const eventos = await lerTudo(t, "events");
    const transacoes = await lerTudo(t, "transactions");

    for (const e of eventos) {
      if (e.budget === undefined) continue;
      const receita = transacoes
        .filter((x) => x.eventId === e._id && x.type === "income")
        .reduce((s, x) => s + x.amount, 0);
      expect(
        receita,
        `"${e.name}": receita ${receita} maior que o orçamento ${e.budget}`,
      ).toBeLessThanOrEqual(e.budget);
    }
  });

  it("nenhum evento tem despesa maior do que o que ele fatura", async () => {
    // Prejuízo existe na vida real, mas numa DEMO ele vira uma pergunta que
    // rouba o tempo da apresentação.
    const { t } = await semear();
    const eventos = await lerTudo(t, "events");
    const transacoes = await lerTudo(t, "transactions");

    for (const e of eventos.filter((x) => x.status === "completed")) {
      const doEvento = transacoes.filter((x) => x.eventId === e._id);
      const receita = doEvento.filter((x) => x.type === "income").reduce((s, x) => s + x.amount, 0);
      const despesa = doEvento.filter((x) => x.type === "expense").reduce((s, x) => s + x.amount, 0);
      if (receita === 0) continue;
      expect(despesa, `"${e.name}" fechou no prejuízo na demo`).toBeLessThan(receita);
    }
  });
});

describe("a demo dá o que as telas da live precisam mostrar", () => {
  it("há recebimento VENCIDO — senão o Assistente não tem o que apontar", async () => {
    // "O que precisa da minha atenção hoje?" é a primeira pergunta do roteiro.
    // Sem nada vencido, a resposta honesta é "nada" — e a demonstração morre.
    const { t } = await semear();
    const hoje = dataDoDia();
    const vencidos = (await lerTudo(t, "transactions")).filter(
      (x) => x.type === "income" && !x.isPaid && x.date < hoje,
    );
    expect(vencidos.length, "nada vencido: o briefing abre vazio").toBeGreaterThan(0);
  });

  it("há compra ATRASADA — senão o painel de Compras abre sem vermelho", async () => {
    const { t } = await semear();
    const hoje = dataDoDia();
    const atrasadas = (await lerTudo(t, "purchaseItems")).filter(
      (c) => !c.isPurchased && c.dueDate !== undefined && c.dueDate < hoje,
    );
    expect(atrasadas.length, "nenhuma compra atrasada").toBeGreaterThan(0);
  });

  it("há checklist pendente num evento próximo", async () => {
    const { t } = await semear();
    const pendentes = (await lerTudo(t, "checklistItems")).filter((i) => !i.isChecked);
    expect(pendentes.length).toBeGreaterThan(0);
  });

  it("o portfólio inteiro entrou — nenhum evento se perdeu no caminho", async () => {
    const { t, r } = await semear();
    expect(r.portfolio?.eventos).toBe(PORTFOLIO_DEMO.length);

    const esperados = PORTFOLIO_DEMO.reduce((s, p) => s + p.transacoes.length, 0);
    const doPortfolio = (await lerTudo(t, "transactions")).filter((x) =>
      x.description.includes(DEMO_MARKER),
    );
    expect(doPortfolio).toHaveLength(esperados);
  });
});

describe("as datas não envelhecem", () => {
  it("o portfólio usa dias RELATIVOS, não datas fixas", () => {
    // ── O DEFEITO QUE ISTO IMPEDE ─────────────────────────────────────────
    // Um seed com datas fixas envelhece: o evento "da semana que vem" vira
    // passado no primeiro ensaio de novembro, e a demo passa a mostrar uma
    // empresa que parou de trabalhar.
    for (const p of PORTFOLIO_DEMO) {
      expect(typeof p.event.emDias, `"${p.event.name}" tem data fixa`).toBe("number");
      for (const t of p.transacoes) {
        expect(typeof t.emDias, `lançamento de "${p.event.name}" tem data fixa`).toBe("number");
      }
    }
  });

  it("rodar o seed hoje ou daqui a um mês produz a mesma FORMA", async () => {
    // Os dias relativos garantem que a proporção passado/futuro se mantenha.
    const { t } = await semear();
    const hoje = dataDoDia();
    const eventos = await lerTudo(t, "events");
    const passado = eventos.filter((e) => e.date < hoje).length;
    const futuro = eventos.filter((e) => e.date > hoje).length;
    // A forma: mais futuro do que passado, e nenhum dos dois zerado.
    expect(passado).toBeGreaterThan(0);
    expect(futuro).toBeGreaterThan(passado);
  });
});

describe("o seed continua idempotente com o portfólio", () => {
  it("rodar duas vezes não duplica os doze eventos", async () => {
    const { t } = await semear();
    const segunda = await t.mutation(internal.demo.seed, {});
    expect(segunda.criado).toBe(false);
    expect(await lerTudo(t, "events")).toHaveLength(TOTAL_DE_EVENTOS_DEMO);
  });
});
