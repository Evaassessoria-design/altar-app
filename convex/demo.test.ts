import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { DEMO_WEDDING } from "./lib/demoData";
import { consolidarMateriais } from "./lib/fichaTecnica";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// O SEED DE DEMONSTRAÇÃO.
//
// Metade destes testes prova que ele FUNCIONA; a outra metade prova que ele se
// RECUSA a funcionar onde não deve. A segunda metade importa mais: um seed
// disparado em produção inseriria um casamento fictício no meio dos dados reais
// de uma cliente.
// ─────────────────────────────────────────────────────────────────────────────

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

const seed = internal.demo.seed;

/** Ambiente demo válido: variável ligada e um único usuário sem cobrança. */
async function ambienteDemo(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  process.env.ALTAR_DEMO = "1";
  return t.run((ctx) =>
    ctx.db.insert("users", {
      name: "Conta Demo", email: "demo@exemplo.com.br",
      role: "admin", subscriptionStatus: "trial",
    }),
  );
}

describe("o seed se RECUSA a rodar fora do ambiente demo", () => {
  it("sem ALTAR_DEMO, recusa e não escreve nada", async () => {
    delete process.env.ALTAR_DEMO;
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "X", email: "x@x.com", role: "user", subscriptionStatus: "trial",
      }),
    );

    await expect(t.mutation(seed, {})).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(0);
    });
  });

  it("com ALTAR_DEMO=1 MAS num banco com cobrança Asaas, recusa", async () => {
    // O acidente mais plausível: a variável copiada para produção por engano.
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Cliente real", email: "real@x.com", role: "user",
        subscriptionStatus: "active", asaasCustomerId: "cus_REAL",
      }),
    );

    await expect(t.mutation(seed, {})).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(0);
      expect(await ctx.db.query("suppliers").collect()).toHaveLength(0);
      expect(await ctx.db.query("leads").collect()).toHaveLength(0);
    });
  });

  it("recusa num banco com usuários demais", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("users", {
          name: `U${i}`, email: `u${i}@x.com`, role: "user", subscriptionStatus: "trial",
        });
      }
    });
    await expect(t.mutation(seed, {})).rejects.toThrow();
  });

  it("recusa quando não há nenhum usuário — o seed não cria login", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await expect(t.mutation(seed, {})).rejects.toThrow();
  });

  it("recusa quando há vários usuários e nenhum e-mail informado", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "A", email: "a@x.com", role: "user", subscriptionStatus: "trial" });
      await ctx.db.insert("users", { name: "B", email: "b@x.com", role: "user", subscriptionStatus: "trial" });
    });
    await expect(t.mutation(seed, {})).rejects.toThrow();
  });
});

describe("o seed cria o casamento completo", () => {
  it("cria o evento com os dados de Marina & Gabriel", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);

    const r = await t.mutation(seed, {});
    expect(r.criado).toBe(true);

    await t.run(async (ctx) => {
      const eventos = await ctx.db.query("events").collect();
      expect(eventos).toHaveLength(1);
      expect(eventos[0].name).toBe("Marina & Gabriel");
      expect(eventos[0].date).toBe("2026-10-10");
      expect(eventos[0].location).toContain("Fazenda Aurora");
      expect(eventos[0].status).toBe("confirmed");
    });
  });

  it("preenche todas as telas que serão gravadas", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const contar = async (tabela: Parameters<typeof ctx.db.query>[0]) =>
        (await ctx.db.query(tabela).collect()).length;

      expect(await contar("briefings"), "Briefing").toBe(1);
      expect(await contar("suppliers"), "Catálogo").toBe(DEMO_WEDDING.suppliers.length);
      expect(await contar("eventSuppliers"), "Fornecedores").toBe(DEMO_WEDDING.suppliers.length);
      expect(await contar("teamMembers"), "Equipe").toBe(DEMO_WEDDING.team.length);
      expect(await contar("eventTeam"), "Escala").toBe(DEMO_WEDDING.team.length);
      expect(await contar("checklistItems"), "Checklist").toBe(DEMO_WEDDING.checklist.length);
      expect(await contar("purchaseItems"), "Compras").toBe(DEMO_WEDDING.purchases.length);
      expect(await contar("budgetItems"), "Orçamento").toBe(DEMO_WEDDING.budget.length);
      expect(await contar("transactions"), "Financeiro").toBe(DEMO_WEDDING.transactions.length);
      expect(await contar("assemblyItems"), "Carregamento").toBe(DEMO_WEDDING.assembly.length);
      expect(await contar("leads"), "Funil").toBe(DEMO_WEDDING.leads.length);
      expect(await contar("materials"), "Materiais").toBe(DEMO_WEDDING.materials.length);
      expect(await contar("compositions"), "Composições").toBe(DEMO_WEDDING.compositions.length);
      expect(await contar("collectionItems"), "Acervo").toBe(DEMO_WEDDING.collection.length);
      expect(await contar("collectionReservations"), "Reservas").toBe(
        DEMO_WEDDING.reservations.length,
      );
      expect(await contar("collectionAdjustments"), "Ajustes").toBe(
        DEMO_WEDDING.adjustments.length,
      );
    });
  });

  it("liga o lead do casal ao evento — o funil mostra o fluxo completo", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    const r = await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const leads = await ctx.db.query("leads").collect();
      const principal = leads.find((l) => l.clientName.includes("Marina"));
      expect(principal?.stage).toBe("contracted");
      expect(principal?.convertedEventId).toBe(r.eventId);
      // Os demais leads não apontam para evento nenhum.
      expect(leads.filter((l) => l.convertedEventId !== undefined)).toHaveLength(1);
    });
  });

  it("cada fornecedor entra no catálogo E ganha vínculo com o evento", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      for (const v of vinculos) {
        expect(v.supplierId, `${v.companyName} sem catálogo`).toBeDefined();
        const supplier = await ctx.db.get(v.supplierId!);
        expect(supplier?.companyName).toBe(v.companyName);
      }
    });
  });

  it("o evento parece EM ANDAMENTO, não concluído", async () => {
    // É o que faz o print parecer uso real em vez de vitrine.
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const checklist = await ctx.db.query("checklistItems").collect();
      const feitos = checklist.filter((c) => c.isChecked).length;
      expect(feitos).toBeGreaterThan(0);
      expect(feitos).toBeLessThan(checklist.length);

      const compras = await ctx.db.query("purchaseItems").collect();
      const compradas = compras.filter((c) => c.isPurchased).length;
      expect(compradas).toBeGreaterThan(0);
      expect(compradas).toBeLessThan(compras.length);

      const lancamentos = await ctx.db.query("transactions").collect();
      expect(lancamentos.some((l) => l.isPaid)).toBe(true);
      expect(lancamentos.some((l) => !l.isPaid)).toBe(true);

      // ── O PAINEL DA MANHÃ PRECISA TER O QUE MOSTRAR ───────────────────
      // "Venceu e não foi liquidado" é o alerta de dinheiro do Dashboard.
      // Sem uma conta vencida na semente, a demonstração abre com o painel
      // calado justamente nessa linha.
      //
      // A data é FIXA NO PASSADO: o resto da semente é ancorado no evento
      // de 10/10/2026 e perde sentido depois dele; esta continua verdadeira
      // em qualquer dia.
      const vencidas = lancamentos.filter(
        (l) => !l.isPaid && l.date < "2026-09-16" && l.type === "expense",
      );
      expect(vencidas.length, "nenhuma conta vencida para o painel mostrar").toBeGreaterThan(0);

      // E é a decoradora devendo ao FORNECEDOR — não a cliente devendo a
      // ela. Marina pagou as três parcelas em dia, e a narrativa depende
      // disso: a parcela final ainda está no prazo.
      expect(
        lancamentos.filter((l) => !l.isPaid && l.type === "income").every((l) => l.date > "2026-09-21"),
        "a demo não pode pintar a cliente como inadimplente",
      ).toBe(true);

      // Fornecedores em estágios diferentes.
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      expect(new Set(vinculos.map((v) => v.status)).size).toBeGreaterThanOrEqual(3);
    });
  });

  it("a Agenda terá conteúdo nas duas áreas", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const briefing = (await ctx.db.query("briefings").collect())[0];
      // Os quatro horários do dia do evento.
      for (const campo of ["setupTime", "ceremonyTime", "receptionTime", "teardownTime"] as const) {
        expect(briefing[campo], campo).toBeTruthy();
      }
      // Escala com horários repetidos — para a Agenda agrupar as pessoas.
      const escala = await ctx.db.query("eventTeam").collect();
      const horarios = escala.map((e) => e.scheduledTime);
      expect(new Set(horarios).size).toBeLessThan(horarios.length);
      // Alinhamentos alimentam "Antes do evento".
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      expect(vinculos.some((v) => (v.alignments?.length ?? 0) > 0)).toBe(true);
    });
  });

  it("NÃO grava nenhuma imagem — as fotos você sobe depois", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.query("eventPhotos").collect()).toHaveLength(0);
      expect(await ctx.db.query("contracts").collect()).toHaveLength(0);
      expect(await ctx.db.query("layoutRenders").collect()).toHaveLength(0);
      const itens = await ctx.db.query("assemblyItems").collect();
      expect(itens.every((i) => i.referencePhotoStorageId === undefined)).toBe(true);
    });
  });
});

describe("o seed é idempotente e não destrói nada", () => {
  it("rodar três vezes cria uma vez só", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);

    const r1 = await t.mutation(seed, {});
    const r2 = await t.mutation(seed, {});
    const r3 = await t.mutation(seed, {});

    expect(r1.criado).toBe(true);
    expect(r2.criado).toBe(false);
    expect(r3.criado).toBe(false);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(1);
      expect(await ctx.db.query("suppliers").collect()).toHaveLength(DEMO_WEDDING.suppliers.length);
    });
  });

  it("NÃO sobrescreve um evento que já existia no banco", async () => {
    const t = convexTest(schema, modules);
    const userId = await ambienteDemo(t);

    const anterior = await t.run((ctx) =>
      ctx.db.insert("events", {
        userId, name: "Evento anterior", type: "birthday", date: "2026-11-01",
        location: "Outro lugar", clientName: "Alguém", status: "planning",
      }),
    );

    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const original = await ctx.db.get(anterior);
      expect(original?.name).toBe("Evento anterior");
      expect(await ctx.db.query("events").collect()).toHaveLength(2);
    });
  });

  it("respeita o e-mail informado quando há mais de uma conta", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    const escolhido = await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "A", email: "a@x.com", role: "user", subscriptionStatus: "trial" });
      return ctx.db.insert("users", { name: "B", email: "b@x.com", role: "user", subscriptionStatus: "trial" });
    });

    await t.mutation(seed, { email: "b@x.com" });

    await t.run(async (ctx) => {
      const eventos = await ctx.db.query("events").collect();
      expect(eventos[0].userId).toBe(escolhido);
    });
  });
});

describe("os dados são reconhecidamente fictícios", () => {
  it("telefones seguem o padrão inventado (11) 9000X-XXXX", async () => {
    const telefones = [
      DEMO_WEDDING.event.clientPhone,
      ...DEMO_WEDDING.suppliers.map((s) => s.phone),
      ...DEMO_WEDDING.team.map((p) => p.phone),
      ...DEMO_WEDDING.leads.map((l) => l.clientPhone),
    ];
    for (const tel of telefones) {
      expect(tel, `${tel} fora do padrão fictício`).toMatch(/^\(11\) 900\d{2}-\d{4}$/);
    }
  });

  it("e-mails usam apenas o domínio de exemplo", () => {
    for (const s of DEMO_WEDDING.suppliers) {
      expect(s.email, s.email).toMatch(/@[\w.-]*exemplo\.com\.br$/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A HISTÓRIA DO DEMO TEM DE FECHAR
//
// Uma demonstração em que os números não batem é pior do que uma tela vazia:
// quem assiste não sabe apontar o erro, mas sente. E a primeira pessoa a
// perceber costuma ser a decoradora experiente do outro lado da mesa.
//
// Estes testes conferem a CADEIA, não cada dado isolado:
//
//     briefing → composição → ficha técnica → consolidado
//                                  ↓              ↓
//                              acervo         compras
//
// Não são números copiados do arquivo de dados — são calculados pelo MESMO
// consolidador que a tela usa. Mexer numa receita e esquecer a compra quebra
// aqui, antes de quebrar na frente de um cliente.
// ═════════════════════════════════════════════════════════════════════════════

describe("a história do demo fecha", () => {
  /** O consolidado real, calculado a partir do que o seed gravou. */
  async function consolidado(t: ReturnType<typeof convexTest>) {
    const itens = await t.run(async (ctx) => ctx.db.query("assemblyItems").collect());
    return consolidarMateriais(
      itens.map((i) => ({
        _id: i._id,
        nome: i.name,
        quantidade: i.quantity,
        area: i.area,
        ambiente: i.ambiente,
        projectScope: i.projectScope,
        receita: i.receita,
      })),
      ehObrigacaoDeMontagem,
    );
  }

  const linha = (linhas: Awaited<ReturnType<typeof consolidado>>, nome: string) => {
    const encontrada = linhas.find((l) => l.nome === nome);
    expect(encontrada, `sem linha consolidada para "${nome}"`).toBeDefined();
    return encontrada!;
  };

  it("a receita multiplicada pelo projeto dá a necessidade — e ela não é inventada", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});
    const linhas = await consolidado(t);

    // 18 centros × 5 + 12 arranjos de corredor × 3 + 1 arco × 60.
    expect(linha(linhas, "Rosa branca importada").necessario).toBe(186);
    // Margem de 10% do insumo, NUNCA somada dentro do necessário.
    expect(linha(linhas, "Rosa branca importada").sugeridoOperacional).toBe(205);

    // 18 × 0,5 maço. Meio maço por arranjo é legítimo; meio maço COMPRADO não.
    expect(linha(linhas, "Eucalipto cinerea").necessario).toBe(9);
    expect(linha(linhas, "Eucalipto cinerea").sugeridoOperacional).toBe(10);

    // A mesa posta é receita POR COUVERT: é o 180 que multiplica.
    expect(linha(linhas, "Sousplat dourado").necessario).toBe(180);
    expect(linha(linhas, "Anel de guardanapo folha").necessario).toBe(180);
  });

  it("o que a ficha manda comprar é o que está na lista de compras", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});
    const linhas = await consolidado(t);

    const compras = await t.run(async (ctx) => ctx.db.query("purchaseItems").collect());
    const compraDe = (nome: string) => compras.find((c) => c.name === nome);

    // 114 velas de necessidade, 5% de margem, unidade indivisível → 120.
    // E 120 é exatamente o que ela comprou.
    expect(linha(linhas, "Vela pilar 20cm").necessario).toBe(114);
    expect(linha(linhas, "Vela pilar 20cm").sugeridoOperacional).toBe(120);
    expect(compraDe("Vela pilar 20cm")?.quantity).toBe(120);

    // Metro aceita fração: 39,6 m é a sugestão honesta. Ela comprou 40 — e a
    // diferença fica VISÍVEL em vez de o sistema arredondar por conta própria.
    expect(linha(linhas, "Fita de cetim dourada").sugerido).toBeCloseTo(39.6, 3);
    expect(compraDe("Fita de cetim dourada")?.quantity).toBe(40);

    // Toda compra gerada da ficha carrega o carimbo da necessidade da época.
    for (const compra of compras.filter((c) => c.materialId !== undefined)) {
      expect(compra.necessidadeTecnica, compra.name).toBeGreaterThan(0);
    }
  });

  it("acervo próprio e locação NÃO entram na lista de compras", async () => {
    // É a diferença entre um sistema que entende decoração e uma planilha:
    // o vaso que ela já tem não vira gasto, e o arco alugado volta ao dono.
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});
    const linhas = await consolidado(t);

    expect(linha(linhas, "Vaso de vidro âmbar 18cm").normalmenteCompra).toBe(false);
    expect(linha(linhas, "Vaso de vidro âmbar 18cm").retornavel).toBe(true);
    expect(linha(linhas, "Estrutura curva de ferro 2,4m").retornavel).toBe(true);
    expect(linha(linhas, "Estrutura curva de ferro 2,4m").normalmenteCompra).toBe(false);

    // E o consumível continua entrando.
    expect(linha(linhas, "Rosa branca importada").normalmenteCompra).toBe(true);
  });

  it("a reserva de acervo cobre a necessidade — e o buraco que sobra é a compra", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});
    const linhas = await consolidado(t);

    const { acervo, reservas, compras } = await t.run(async (ctx) => ({
      acervo: await ctx.db.query("collectionItems").collect(),
      reservas: await ctx.db.query("collectionReservations").collect(),
      compras: await ctx.db.query("purchaseItems").collect(),
    }));

    const reservaDe = (nome: string) => {
      const item = acervo.find((a) => a.nome === nome)!;
      return {
        total: item.quantidadeTotal,
        reservado: reservas
          .filter((r) => r.collectionItemId === item._id)
          .reduce((soma, r) => soma + r.quantidade, 0),
      };
    };

    // O vaso está coberto: 30 reservados de 58 no galpão.
    expect(linha(linhas, "Vaso de vidro âmbar 18cm").necessario).toBe(30);
    expect(reservaDe("Vaso de vidro âmbar 18cm")).toEqual({ total: 58, reservado: 30 });

    // O guardanapo NÃO está: a mesa posta pede 180 e ela tem 150. O déficit é
    // o ponto alto da demonstração — o sistema viu antes de faltar no dia.
    const guardanapo = reservaDe("Guardanapo de linho verde-oliva");
    expect(linha(linhas, "Guardanapo de linho verde-oliva").necessario).toBe(180);
    expect(guardanapo.reservado).toBe(180);
    expect(guardanapo.total).toBe(150);

    const falta = guardanapo.reservado - guardanapo.total;
    expect(falta).toBe(30);
    // E a compra aberta fecha EXATAMENTE o buraco — nem mais, nem menos.
    const compra = compras.find((c) => c.name === "Guardanapo de linho verde-oliva");
    expect(compra?.quantity).toBe(falta);
    expect(compra?.isPurchased).toBe(false);
  });

  it("o histórico do acervo explica o estoque, em vez de contradizê-lo", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    const { item, ajustes } = await t.run(async (ctx) => {
      const acervo = await ctx.db.query("collectionItems").collect();
      const item = acervo.find((a) => a.nome === "Vaso de vidro âmbar 18cm")!;
      return {
        item,
        ajustes: (await ctx.db.query("collectionAdjustments").collect()).filter(
          (a) => a.collectionItemId === item._id,
        ),
      };
    });

    // Auditoria, não fonte de verdade: aplicados em ordem, fecham no total.
    const emOrdem = [...ajustes].sort((a, b) => a._creationTime - b._creationTime);
    let saldo = emOrdem[0].quantidadeAntes;
    for (const ajuste of emOrdem) {
      expect(ajuste.quantidadeAntes).toBe(saldo);
      expect(ajuste.quantidadeDepois).toBe(saldo + ajuste.delta);
      saldo = ajuste.quantidadeDepois;
    }
    expect(saldo).toBe(item.quantidadeTotal);
  });

  it("toda receita cita material que existe no catálogo", async () => {
    // Uma linha órfã não quebra a tela — some do consolidado em silêncio, e a
    // decoradora compra a menos sem nunca saber por quê.
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const materiais = await ctx.db.query("materials").collect();
      const ids = new Set(materiais.map((m) => String(m._id)));

      const receitas = [
        ...(await ctx.db.query("compositions").collect()).map((c) => c.receita),
        ...(await ctx.db.query("assemblyItems").collect()).map((a) => a.receita ?? []),
      ];

      for (const receita of receitas) {
        for (const componente of receita) {
          expect(componente.materialId, componente.nome).toBeDefined();
          expect(ids.has(String(componente.materialId)), componente.nome).toBe(true);
          // O snapshot tem de ser autossuficiente: nome e unidade próprios.
          expect(componente.nome.length).toBeGreaterThan(0);
          expect(componente.unidade.length).toBeGreaterThan(0);
        }
      }
    });
  });

  it("a receita é CÓPIA, não referência — editar a biblioteca não mexe no evento", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const composicao = (await ctx.db.query("compositions").collect()).find(
        (c) => c.nome === "Centro de mesa — eucalipto e velas",
      )!;
      // A biblioteca muda hoje...
      await ctx.db.patch(composicao._id, { receita: [] });

      const item = (await ctx.db.query("assemblyItems").collect()).find(
        (a) => a.compositionId === composicao._id,
      )!;
      // ...e o evento de outubro continua exatamente como foi aprovado.
      expect(item.receita).toBeDefined();
      expect(item.receita!.length).toBeGreaterThan(0);
    });
  });

  it("os números que a decoradora vê na tela são os mesmos em toda parte", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const evento = (await ctx.db.query("events").collect())[0];
      const briefing = (await ctx.db.query("briefings").collect())[0];
      const orcamento = await ctx.db.query("budgetItems").collect();
      const lancamentos = await ctx.db.query("transactions").collect();

      const somar = (linhas: { amount: number }[]) =>
        linhas.reduce((s, l) => s + l.amount, 0);

      // O contrato é UM número — e ele aparece no evento, no orçamento, no
      // funil e no livro-caixa. Divergir em qualquer um deles é a pergunta
      // que trava a reunião.
      const receitaPrevista = orcamento
        .filter((b) => b.type === "income")
        .reduce((s, b) => s + b.quantity * b.unitPrice, 0);
      expect(receitaPrevista).toBe(evento.budget);
      expect(somar(lancamentos.filter((l) => l.type === "income"))).toBe(evento.budget);

      const lead = (await ctx.db.query("leads").collect()).find(
        (l) => l.convertedEventId === evento._id,
      );
      expect(lead?.budget).toBe(evento.budget);

      // O número de convidados também: briefing, mesa posta e cadeiras.
      expect(briefing.guestCount).toBe("180");
      expect(briefing.guestChairCount).toBe("180");
      const mesaPosta = (await ctx.db.query("assemblyItems").collect()).find((a) =>
        a.name.startsWith("Mesa posta"),
      );
      expect(mesaPosta?.quantity).toBe(180);
    });
  });

  it("nenhum fornecedor citado no dinheiro é um fornecedor que não existe", async () => {
    // O defeito que isto tranca: o livro-caixa pagava "Mobiliário Bela Casa",
    // empresa que não estava em lugar nenhum do demo. Quem abrisse Fornecedores
    // procurando por ela não acharia nada.
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const fornecedores = (await ctx.db.query("suppliers").collect()).map((f) => f.companyName);
      const lancamentos = await ctx.db.query("transactions").collect();

      // Só os lançamentos que NOMEIAM uma empresa (têm " — " no texto).
      for (const l of lancamentos) {
        const [empresa] = l.description.split(" — ");
        if (empresa === l.description) continue;
        expect(fornecedores, l.description).toContain(empresa);
      }
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O ROTEIRO COMERCIAL CITA NÚMEROS. ELES TÊM DE SER OS DO SISTEMA.
//
// `docs/demo-comercial.md` manda dizer, em voz alta, numa reunião: "precisa de
// 186 hastes", "faltam exatamente 30 guardanapos", "o contrato é de
// R$ 186.500". Se alguém mexer no seed e esquecer do roteiro, ninguém descobre
// — até o dia em que a tela mostrar outro número enquanto a frase já saiu da
// boca de quem está vendendo.
//
// Este teste lê o DOCUMENTO e confere cada número contra o que o seed grava e
// contra o MESMO consolidador que a tela usa. É a única forma de um arquivo de
// markdown envelhecer com barulho em vez de em silêncio.
// ═════════════════════════════════════════════════════════════════════════════

describe("o roteiro comercial não mente sobre o demo", () => {
  const roteiro = readFileSync("docs/demo-comercial.md", "utf-8");
  const prontidao = readFileSync("docs/prontidao-comercial.md", "utf-8");

  it("o casamento do roteiro é o casamento do seed", () => {
    expect(roteiro).toContain(DEMO_WEDDING.event.name);
    expect(roteiro).toContain("180 convidados");
    expect(DEMO_WEDDING.briefing.guestCount).toBe("180");
    // 10/10/2026, escrito por extenso no roteiro.
    expect(DEMO_WEDDING.event.date).toBe("2026-10-10");
    expect(roteiro).toMatch(/10 de outubro de 2026/);
    // O contrato, com o separador de milhar que a tela usa.
    expect(DEMO_WEDDING.event.budget).toBe(186_500);
    expect(roteiro).toContain("R$ 186.500,00");
    expect(roteiro).toContain(DEMO_WEDDING.event.location);
  });

  it("as quantidades ditas em voz alta são as que o consolidador calcula", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    const itens = await t.run(async (ctx) => ctx.db.query("assemblyItems").collect());
    const linhas = consolidarMateriais(
      itens.map((i) => ({
        _id: i._id,
        nome: i.name,
        quantidade: i.quantity,
        area: i.area,
        ambiente: i.ambiente,
        projectScope: i.projectScope,
        receita: i.receita,
      })),
      ehObrigacaoDeMontagem,
    );
    const de = (nome: string) => linhas.find((l) => l.nome === nome)!;

    // "Precisa 186 haste · Providenciar 205 haste"
    expect(roteiro).toContain("186");
    expect(de("Rosa branca importada").necessario).toBe(186);
    expect(roteiro).toContain("205");
    expect(de("Rosa branca importada").sugeridoOperacional).toBe(205);

    // "Precisa 114 · Providenciar 120", e a compra de 120.
    expect(roteiro).toContain("114");
    expect(de("Vela pilar 20cm").necessario).toBe(114);
    expect(de("Vela pilar 20cm").sugeridoOperacional).toBe(120);

    // "a mesa posta precisa de 180 guardanapos"
    expect(de("Guardanapo de linho verde-oliva").necessario).toBe(180);
  });

  it("o déficit de 30 guardanapos é 30 no banco", async () => {
    // É o ponto alto do roteiro: "a compra aberta é de exatamente trinta".
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const item = (await ctx.db.query("collectionItems").collect()).find(
        (a) => a.nome === "Guardanapo de linho verde-oliva",
      )!;
      const reservado = (await ctx.db.query("collectionReservations").collect())
        .filter((r) => r.collectionItemId === item._id)
        .reduce((s, r) => s + r.quantidade, 0);

      expect(reservado - item.quantidadeTotal).toBe(30);
      expect(item.quantidadeTotal).toBe(150);

      const compra = (await ctx.db.query("purchaseItems").collect()).find(
        (c) => c.name === "Guardanapo de linho verde-oliva",
      );
      expect(compra?.quantity).toBe(30);
    });

    expect(roteiro).toContain("150");
    expect(roteiro).toMatch(/Faltam 30 un/);
  });

  it("os totais do topo da ficha técnica conferem", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    const itens = await t.run(async (ctx) => ctx.db.query("assemblyItems").collect());
    const linhas = consolidarMateriais(
      itens.map((i) => ({
        _id: i._id,
        nome: i.name,
        quantidade: i.quantity,
        area: i.area,
        ambiente: i.ambiente,
        projectScope: i.projectScope,
        receita: i.receita,
      })),
      ehObrigacaoDeMontagem,
    );

    // "13 materiais, 4 composições" — 13 porque o castiçal está no catálogo e
    // no acervo, mas não entra em receita nenhuma. A tela conta as LINHAS do
    // consolidado, não o catálogo.
    expect(linhas).toHaveLength(13);
    expect(roteiro).toContain("13 materiais");
    expect(DEMO_WEDDING.compositions).toHaveLength(4);
    expect(roteiro).toContain("4 composições");
  });

  it("o financeiro citado é o que o seed lança", () => {
    const soma = (tipo: "income" | "expense", pago: boolean) =>
      DEMO_WEDDING.transactions
        .filter((l) => l.type === tipo && l.isPaid === pago)
        .reduce((s, l) => s + l.amount, 0);

    expect(soma("income", true)).toBe(143_000);
    expect(roteiro).toContain("R$ 143.000,00");
    expect(soma("expense", true)).toBe(67_000);
    expect(roteiro).toContain("R$ 67.000,00");
    expect(soma("income", false)).toBe(43_500);
    expect(roteiro).toContain("R$ 43.500,00");
  });

  it("os dois documentos comerciais existem e se citam", () => {
    expect(roteiro).toContain("docs/prontidao-comercial.md");
    expect(prontidao.length).toBeGreaterThan(2000);
    // As quatro classificações que o Matheus consulta no meio da reunião.
    for (const rotulo of ["PRONTO", "PRONTO COM RESSALVA", "NÃO MOSTRAR AINDA", "FUTURO"]) {
      expect(prontidao).toContain(rotulo);
    }
  });

  it("o roteiro manda NÃO abrir o que não é produto da decoradora", () => {
    // O pior acidente possível numa reunião é abrir o Painel Admin e mostrar a
    // conta de outra cliente.
    for (const proibido of ["Painel Admin", "Central"]) {
      expect(roteiro).toContain(proibido);
      expect(prontidao).toContain(proibido);
    }
    expect(prontidao).toContain("NÃO MOSTRAR AINDA");
  });

  it("nenhum dos dois documentos promete o que a landing deixou de prometer", () => {
    // As cinco afirmações removidas da landing não podem reaparecer aqui.
    for (const doc of [roteiro, prontidao]) {
      expect(doc).not.toMatch(/preenche o briefing automaticamente/i);
      expect(doc).not.toMatch(/notifique a equipe/i);
      expect(doc).not.toMatch(/anexe pedidos/i);
      expect(doc).not.toMatch(/Kanban com \d+ etapas/i);
    }
  });
});
