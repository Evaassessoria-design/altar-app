import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertDemoEnvironment, inspectDemoEnvironment } from "./lib/demoGuard";
import { DEMO_WEDDING, DEMO_MARKER } from "./lib/demoData";
import { PORTFOLIO_DEMO } from "./lib/demoPortfolio";
import { dataEmDias } from "./lib/dataDoDia";
import { janelaSugerida } from "./lib/acervo";
import { normalizeName, normalizePhone } from "./lib/supplierIdentity";
import { resolveAccess } from "./lib/access";

/** O demo tem uma conta. O teto existe só para nunca varrer um banco grande. */
const MAX_CONTAS_LISTADAS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// SEED DE DEMONSTRAÇÃO — conteúdo fictício para prints e vídeos.
//
// Este arquivo é o MOTOR: valida o ambiente, garante idempotência e insere.
// O ROTEIRO (o casamento fictício em si) vive em lib/demoData.ts, separado de
// propósito: dá para trocar os dados sem tocar nas travas de segurança.
//
// GARANTIAS, todas verificadas por teste:
//   · só roda com ALTAR_DEMO=1 e num banco sem sinais de produção (lib/demoGuard);
//   · idempotente — rodar de novo não cria nada;
//   · SOMENTE INSERE. Não existe `delete` nem `patch` sobre dado alheio aqui;
//   · nenhuma chamada de IA e nenhuma chamada ao Asaas — é uma mutation, que
//     no Convex nem pode fazer requisição externa. A restrição é estrutural,
//     não uma promessa;
//   · nenhum arquivo/imagem: os campos de foto ficam vazios, prontos para você
//     subir as imagens pela própria interface depois.
//
// Interna de propósito: só executável pelo painel do Convex, por quem opera o
// deployment. Inalcançável pelo aplicativo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O ambiente aceitaria o seed? Não escreve nada.
 * Rode ANTES de semear, para confirmar que está no lugar certo.
 *
 *   internal.demo.checkEnvironment  { }
 */
export const checkEnvironment = internalQuery({
  args: {},
  handler: async (ctx) => {
    const check = await inspectDemoEnvironment(ctx);
    const jaSemeado = await encontrarEventoDemo(ctx);
    return {
      ...check,
      jaSemeado: jaSemeado !== null,
      proximoPasso: !check.ok
        ? `Bloqueado: ${check.motivo}`
        : jaSemeado
          ? "Já semeado — rodar de novo não fará nada."
          : "Pronto para semear.",
    };
  },
});

/** Marcador de idempotência: o evento demo já existe neste banco? */
async function encontrarEventoDemo(
  ctx: { db: MutationCtx["db"] | Parameters<typeof inspectDemoEnvironment>[0]["db"] },
): Promise<Doc<"events"> | null> {
  const eventos = await ctx.db.query("events").take(200);
  return eventos.find((e) => e.notes?.includes(DEMO_MARKER)) ?? null;
}

/**
 * Cria o casamento de demonstração.
 *
 *   internal.demo.seed  { }
 *   internal.demo.seed  { "email": "demo@appaltar.com.br" }
 *
 * O conteúdo é ligado a UM usuário — normalmente o único cadastrado no projeto
 * demo. Com mais de um, informe o e-mail para não haver ambiguidade.
 */
/**
 * Quem é a conta deste ambiente de demonstração.
 *
 * Somente leitura. Existe para CONFERIR o e-mail antes de redefinir a senha —
 * redefinir a senha da conta errada seria pior do que não redefinir nenhuma.
 * Devolve o e-mail de todas as contas (o demo tem uma só, por definição).
 */
export const contaDoDemo = internalQuery({
  args: {},
  handler: async (ctx) => {
    await assertDemoEnvironment(ctx);
    const usuarios = await ctx.db.query("users").take(MAX_CONTAS_LISTADAS);
    return {
      total: usuarios.length,
      contas: usuarios.map((u) => ({
        email: u.email,
        nome: u.name,
        criadaEm: new Date(u._creationTime).toISOString(),
        temLoginBetterAuth: u.betterAuthId !== undefined,
      })),
    };
  },
});

export const seed = internalMutation({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // ── Camadas 1 e 2: ambiente ──────────────────────────────────────────────
    await assertDemoEnvironment(ctx);

    // ── Camada 3: idempotência ───────────────────────────────────────────────
    const existente = await encontrarEventoDemo(ctx);
    if (existente) {
      return {
        // `as const` nos dois ramos: sem ele `criado` vira `boolean` nos dois e
        // deixa de discriminar a união — quem chama não consegue perguntar
        // "criou?" e ler o resumo em seguida.
        criado: false as const,
        motivo: "O casamento de demonstração já existe neste banco. Nada foi alterado.",
        eventId: existente._id,
      };
    }

    // ── Dono do conteúdo ─────────────────────────────────────────────────────
    const usuarios = await ctx.db.query("users").take(5);
    if (usuarios.length === 0) {
      throw new ConvexError({
        code: "NO_USER",
        message:
          "Nenhum usuário neste banco. Cadastre-se no app demo primeiro — o seed " +
          "liga o conteúdo a uma conta existente, não cria login.",
      });
    }

    const dono = args.email
      ? usuarios.find((u) => u.email.trim().toLowerCase() === args.email!.trim().toLowerCase())
      : usuarios.length === 1
        ? usuarios[0]
        : undefined;

    if (!dono) {
      throw new ConvexError({
        code: "AMBIGUOUS_USER",
        message: args.email
          ? `Nenhum usuário com o e-mail ${args.email}.`
          : `Há ${usuarios.length} usuários neste banco. Informe { "email": "..." } para escolher.`,
      });
    }

    return { criado: true as const, ...(await inserirDemonstracao(ctx, dono._id)) };
  },
});

/**
 * Insere o conteúdo inteiro da demonstração na conta indicada.
 *
 * Extraída do corpo de `seed` para que `resetar` recrie EXATAMENTE o mesmo
 * conteúdo. Duas cópias do roteiro divergiriam na primeira edição, e a demo
 * recriada deixaria de ser a demo que foi ensaiada.
 *
 * SOMENTE INSERE. Quem apaga é `limpar`, e apaga antes de chamar esta.
 */
async function inserirDemonstracao(ctx: MutationCtx, userId: Id<"users">) {
  const d = DEMO_WEDDING;
  const agora = new Date().toISOString();

  // ── Evento ───────────────────────────────────────────────────────────────
  const eventId = await ctx.db.insert("events", { userId, ...d.event });

  // ── Briefing ─────────────────────────────────────────────────────────────
  await ctx.db.insert("briefings", { eventId, userId, ...d.briefing });

  // ── Catálogo + fornecedores do evento ────────────────────────────────────
  // O seed exercita o catálogo central: cada fornecedor entra no catálogo da
  // empresa E ganha o vínculo com o evento, como aconteceria no uso real.
  const supplierIds = new Map<string, Id<"suppliers">>();
  const vinculoPorNome = new Map<string, Id<"eventSuppliers">>();
  for (const [i, f] of d.suppliers.entries()) {
    const supplierId = await ctx.db.insert("suppliers", {
      userId,
      companyName: f.companyName,
      category: f.category,
      contactName: f.contactName,
      phone: f.phone,
      email: f.email,
      instagram: f.instagram,
      city: f.city,
      state: f.state,
      differentials: f.differentials,
      commercialInfo: f.commercialInfo,
      searchName: normalizeName(f.companyName),
      phoneDigits: normalizePhone(f.phone) || undefined,
      createdAt: agora,
      updatedAt: agora,
    });
    supplierIds.set(f.companyName, supplierId);

    // O id do VÍNCULO fica guardado: é para ele que `assemblyItems.supplierId`
    // aponta, e é o que faz a ficha do fornecedor responder "o que ele entrega
    // neste evento". Sem isto a demo mostraria o recurso vazio.
    const vinculoId = await ctx.db.insert("eventSuppliers", {
      userId,
      eventId,
      supplierId,
      category: f.category,
      companyName: f.companyName,
      contactName: f.contactName,
      phone: f.phone,
      email: f.email,
      instagram: f.instagram,
      city: f.city,
      state: f.state,
      differentials: f.differentials,
      commercialInfo: f.commercialInfo,
      status: f.status,
      nextAction: f.nextAction,
      alignments: f.alignments,
      notes: f.notes,
      order: i,
    });
    vinculoPorNome.set(f.companyName, vinculoId);
  }

  // ── Catálogo de materiais ────────────────────────────────────────────────
  // Entra DEPOIS dos fornecedores porque alguns materiais apontam para um
  // fornecedor preferencial — e o id só existe a partir daqui.
  const materialIds = new Map<string, Id<"materials">>();
  for (const m of d.materials) {
    const materialId = await ctx.db.insert("materials", {
      userId,
      nome: m.nome,
      searchName: normalizeName(m.nome),
      unidade: m.unidade,
      categoria: m.categoria,
      tipo: m.tipo,
      custoReferencia: m.custoReferencia,
      margemPercentual: "margemPercentual" in m ? m.margemPercentual : undefined,
      supplierId: "supplier" in m ? supplierIds.get(m.supplier as string) : undefined,
      updatedAt: agora,
    });
    materialIds.set(m.nome, materialId);
  }

  /**
   * Uma linha de receita, com o material do catálogo resolvido.
   *
   * A cópia de `unidade`, `tipo`, `categoria`, `custoReferencia` e
   * `margemPercentual` NÃO é redundância: é o snapshot que o schema exige.
   * A receita tem de continuar legível depois que o material for editado ou
   * arquivado — senão um evento executado mudaria sozinho.
   */
  const linhaDaReceita = (componente: { material: string; quantidade: number }) => {
    const material = d.materials.find((m) => m.nome === componente.material);
    if (!material) {
      throw new ConvexError({
        code: "DEMO_RECEITA_INVALIDA",
        message: `A receita cita "${componente.material}", que não está no catálogo do demo.`,
      });
    }
    return {
      materialId: materialIds.get(material.nome),
      nome: material.nome,
      unidade: material.unidade,
      quantidade: componente.quantidade,
      tipo: material.tipo,
      categoria: material.categoria,
      custoReferencia: material.custoReferencia,
      margemPercentual: "margemPercentual" in material ? material.margemPercentual : undefined,
    };
  };

  // ── Biblioteca de composições ────────────────────────────────────────────
  const compositionIds = new Map<string, Id<"compositions">>();
  for (const c of d.compositions) {
    const compositionId = await ctx.db.insert("compositions", {
      userId,
      nome: c.nome,
      searchName: normalizeName(c.nome),
      categoria: c.categoria,
      notes: c.notes,
      receita: c.receita.map(linhaDaReceita),
      updatedAt: agora,
    });
    compositionIds.set(c.nome, compositionId);
  }

  // ── Acervo ───────────────────────────────────────────────────────────────
  const collectionIds = new Map<string, Id<"collectionItems">>();
  for (const item of d.collection) {
    const collectionItemId = await ctx.db.insert("collectionItems", {
      userId,
      nome: item.nome,
      searchName: normalizeName(item.nome),
      unidade: item.unidade,
      quantidadeTotal: item.quantidadeTotal,
      categoria: item.categoria,
      materialId: "material" in item ? materialIds.get(item.material as string) : undefined,
      notes: "notes" in item ? (item.notes as string) : undefined,
      updatedAt: agora,
    });
    collectionIds.set(item.nome, collectionItemId);
  }

  /** O item de acervo referido pelo nome — erra alto em vez de gravar torto. */
  const acervoPorNome = (nome: string): Id<"collectionItems"> => {
    const id = collectionIds.get(nome);
    if (!id) {
      throw new ConvexError({
        code: "DEMO_ACERVO_INVALIDO",
        message: `"${nome}" não está no acervo do demo.`,
      });
    }
    return id;
  };

  for (const r of d.reservations) {
    await ctx.db.insert("collectionReservations", {
      userId,
      collectionItemId: acervoPorNome(r.item),
      eventId,
      quantidade: r.quantidade,
      inicio: d.reservationWindow.inicio,
      fim: d.reservationWindow.fim,
      origem: r.origem,
      materialId:
        r.origem === "ficha" ? materialIds.get(r.item) : undefined,
      necessidadeTecnica: "necessidadeTecnica" in r ? r.necessidadeTecnica : undefined,
      notes: "notes" in r ? (r.notes as string) : undefined,
      updatedAt: agora,
    });
  }

  // Histórico: a data é o `_creationTime` do Convex, carimbo do servidor. Por
  // isso os ajustes aparecem com a data em que o seed rodou, e não uma data
  // inventada — o acervo não afirma um passado que não existiu.
  for (const a of d.adjustments) {
    await ctx.db.insert("collectionAdjustments", {
      userId,
      collectionItemId: acervoPorNome(a.item),
      tipo: a.tipo,
      delta: a.delta,
      quantidadeAntes: a.quantidadeAntes,
      quantidadeDepois: a.quantidadeDepois,
      motivo: a.motivo,
      eventId: a.doEvento ? eventId : undefined,
    });
  }

  // ── Equipe e escala ──────────────────────────────────────────────────────
  for (const p of d.team) {
    const teamMemberId = await ctx.db.insert("teamMembers", {
      userId,
      name: p.name,
      role: p.role,
      phone: p.phone,
    });
    await ctx.db.insert("eventTeam", {
      userId,
      eventId,
      teamMemberId,
      scheduledTime: p.scheduledTime,
      notes: p.notes,
    });
  }

  // ── Checklist (pré e pós, parcialmente concluído) ────────────────────────
  for (const [i, item] of d.checklist.entries()) {
    await ctx.db.insert("checklistItems", {
      eventId,
      userId,
      phase: item.phase,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      order: i,
      isChecked: item.isChecked,
    });
  }

  // ── Compras (parcialmente concluídas) ────────────────────────────────────
  for (const [i, c] of d.purchases.entries()) {
    await ctx.db.insert("purchaseItems", {
      userId,
      eventId,
      name: c.name,
      category: c.category,
      quantity: c.quantity,
      unit: c.unit,
      supplier: c.supplier,
      unitPrice: c.unitPrice,
      isPurchased: c.isPurchased,
      notes: "notes" in c ? (c.notes as string) : undefined,
      // O vínculo com a Ficha Técnica. Só nas compras que de fato nasceram de
      // uma necessidade consolidada — é ele que torna gerar de novo idempotente.
      materialId: "material" in c ? materialIds.get(c.material as string) : undefined,
      necessidadeTecnica: "necessidadeTecnica" in c ? c.necessidadeTecnica : undefined,
      order: i,
    });
  }

  // ── Orçamento ────────────────────────────────────────────────────────────
  for (const [i, b] of d.budget.entries()) {
    await ctx.db.insert("budgetItems", {
      userId,
      eventId,
      description: b.description,
      category: b.category,
      quantity: b.quantity,
      unitPrice: b.unitPrice,
      type: b.type,
      order: i,
    });
  }

  // ── Financeiro ───────────────────────────────────────────────────────────
  for (const t of d.transactions) {
    await ctx.db.insert("transactions", {
      userId,
      eventId,
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount,
      date: t.date,
      isPaid: t.isPaid,
      // QUANDO entrou e COMO. `date` é o vencimento; estes dois são o
      // pagamento de verdade. Sem eles a demonstração mostraria "pago" sem
      // a data e a forma que a tela sabe exibir — e o recurso de
      // comprovantes pareceria não existir.
      paidAt: "paidAt" in t ? (t.paidAt as string) : undefined,
      paymentMethod: "paymentMethod" in t ? (t.paymentMethod as string) : undefined,
    });
  }

  /** A receita mestre, copiada. Ver o comentário no laço abaixo. */
  const composicaoDe = (nome: string) => {
    const composicao = d.compositions.find((c) => c.nome === nome);
    if (!composicao) {
      throw new ConvexError({
        code: "DEMO_COMPOSICAO_INVALIDA",
        message: `O item de montagem cita a composição "${nome}", que não existe no demo.`,
      });
    }
    return composicao.receita.map(linhaDaReceita);
  };

  // ── Carregamento / Caderno de Montagem ───────────────────────────────────
  // Campos de foto ficam VAZIOS de propósito: você sobe as imagens depois,
  // pela própria interface.
  for (const [i, a] of d.assembly.entries()) {
    await ctx.db.insert("assemblyItems", {
      userId,
      eventId,
      area: a.area,
      order: i,
      name: a.name,
      model: a.model,
      quantity: a.quantity,
      unit: a.unit,
      supplierName: a.supplierName,
      // O VÍNCULO, e não só o nome. `supplierName` continua ao lado como
      // snapshot — é o que mantém o Caderno legível se o fornecedor sair
      // do evento depois.
      supplierId: a.supplierName ? vinculoPorNome.get(a.supplierName) : undefined,
      ambiente: a.ambiente,
      notes: a.notes,
      // O que é contratado e o que é direção estética. Sem isto o Projeto
      // Visual da demonstração não mostraria a distinção que evita a
      // confusão mais cara da decoração — a cliente achar que a inspiração
      // foi comprada.
      projectScope: "escopo" in a ? (a.escopo as "incluso" | "referencia" | "nao_incluso") : undefined,
      includeInAssemblyReport: true,
      checkOnAssembly: a.checkOnAssembly,
      visibility: a.visibility,
      // SNAPSHOT, não referência: a receita é COPIADA da biblioteca.
      // `compositionId` é só procedência ("veio do Arco de oliveiras") —
      // nenhuma leitura busca a receita por ele, senão deixaria de ser
      // snapshot e editar a biblioteca recalcularia o evento em silêncio.
      receita: "composicao" in a ? composicaoDe(a.composicao as string) : undefined,
      compositionId: "composicao" in a ? compositionIds.get(a.composicao as string) : undefined,
      createdAt: agora,
      updatedAt: agora,
    });
  }

  // ── Funil ────────────────────────────────────────────────────────────────
  // O lead do casal já está em "contratado" e aponta para o evento — mostra o
  // fluxo completo. Os demais dão volume às outras colunas do kanban.
  let leadDoCasal: Id<"leads"> | undefined;
  for (const [i, l] of d.leads.entries()) {
    const leadId = await ctx.db.insert("leads", {
      userId,
      clientName: l.clientName,
      clientPhone: l.clientPhone,
      eventType: l.eventType,
      eventDate: l.eventDate,
      budget: l.budget,
      stage: l.stage,
      notes: l.notes,
      order: i,
      convertedEventId: l.isMainEvent ? eventId : undefined,
    });
    if (l.isMainEvent) leadDoCasal = leadId;
  }

  // ── A proposta comercial que ganhou este casamento ───────────────────────
  // Pendurada nos DOIS vínculos de propósito: nasceu da oportunidade no funil
  // e hoje pertence ao evento. É o caminho real — e é o que faz a tela do
  // evento e o card do funil mostrarem a mesma proposta.
  //
  // `versaoEnviada` é preenchida porque ela FOI enviada: sem esse registro a
  // proposta apareceria como rascunho aceito, que é um estado que a operação
  // não produz.
  const p = d.proposta;
  await ctx.db.insert("proposals", {
    userId,
    leadId: leadDoCasal,
    eventId,
    titulo: p.titulo,
    apresentacao: p.apresentacao,
    clienteNome: d.event.clientName,
    eventoTipo: "Casamento",
    eventoData: d.event.date,
    eventoLocal: d.event.location,
    eventoConvidados: 180,
    itens: p.itens.map((i) => ({ ...i })),
    condicoesPagamento: p.condicoesPagamento,
    validadeAte: p.validadeAte,
    observacoes: p.observacoes,
    status: "aceita",
    versaoEnviada: {
      enviadaEm: p.enviadaEm,
      titulo: p.titulo,
      investimento: p.itens.reduce((soma, i) => soma + i.valor, 0),
      itens: p.itens.map((i) => ({ ...i })),
      condicoesPagamento: p.condicoesPagamento,
      validadeAte: p.validadeAte,
    },
    decididaEm: p.decididaEm,
    decididaPor: "Aurora",
    createdAt: p.enviadaEm,
    updatedAt: p.decididaEm,
  });

  // ── A EMPRESA EM VOLTA ───────────────────────────────────────────────────
  // Marina & Gabriel tem profundidade; estes doze dão CONTORNO. Sem eles o
  // Dashboard abria com um evento, a Agenda com uma data e o Financeiro com
  // um cliente — e a primeira frase da apresentação, "essa é a sua empresa
  // hoje", caía no vazio.
  //
  // São rasos de propósito: existem para os painéis terem o que somar, não
  // para serem abertos. A live abre um evento, não doze.
  let eventosDoPortfolio = 0;
  let lancamentosDoPortfolio = 0;
  let comprasDoPortfolio = 0;

  for (const p of PORTFOLIO_DEMO) {
    const { emDias, ...campos } = p.event;
    const outroId = await ctx.db.insert("events", {
      userId,
      ...campos,
      date: dataEmDias(emDias),
    });
    eventosDoPortfolio++;

    for (const t of p.transacoes) {
      await ctx.db.insert("transactions", {
        userId,
        eventId: outroId,
        type: t.type,
        category: t.category,
        description: `${t.description} ${DEMO_MARKER}`,
        amount: t.amount,
        date: dataEmDias(t.emDias),
        isPaid: t.isPaid,
        // Pago diz QUANDO e COMO. Sem isto o Financeiro mostra recebimento
        // quitado sem data — e `paidAt` ausente num lançamento pago é a
        // diferença entre "quando era para entrar" e "quando entrou".
        ...(t.isPaid
          ? { paidAt: dataEmDias(t.pagoEmDias ?? t.emDias), paymentMethod: t.forma }
          : {}),
      });
      lancamentosDoPortfolio++;
    }

    for (const [i, c] of (p.compras ?? []).entries()) {
      const { prazoEmDias, ...resto } = c;
      await ctx.db.insert("purchaseItems", {
        userId,
        eventId: outroId,
        ...resto,
        order: i,
        // Comprado é RECEBIDO nesta demo: uma compra marcada como comprada e
        // pendente ao mesmo tempo faria as Compras mostrarem um estado que o
        // produto não produz sozinho.
        ...(c.isPurchased ? { status: "recebido" as const } : {}),
        ...(prazoEmDias !== undefined ? { dueDate: dataEmDias(prazoEmDias) } : {}),
      });
      comprasDoPortfolio++;
    }

    for (const [i, item] of (p.checklist ?? []).entries()) {
      await ctx.db.insert("checklistItems", {
        userId,
        eventId: outroId,
        name: item.name,
        phase: "pre" as const,
        isChecked: item.isChecked,
        order: i,
      });
    }

    // ── Acervo do contorno: a segunda-feira pós-evento ──────────────────
    // A janela vem da data RELATIVA do evento, como a de qualquer reserva
    // feita pela tela — a demo não afirma uma operação em data inventada.
    const janelaDoContorno = janelaSugerida(dataEmDias(emDias));
    for (const r of p.acervo ?? []) {
      await ctx.db.insert("collectionReservations", {
        userId,
        collectionItemId: acervoPorNome(r.item),
        eventId: outroId,
        quantidade: r.quantidade,
        inicio: janelaDoContorno.inicio,
        fim: janelaDoContorno.fim,
        origem: "manual" as const,
        ...(r.saiu !== undefined ? { saiu: r.saiu } : {}),
        ...(r.voltou !== undefined ? { voltou: r.voltou } : {}),
        notes: r.notes,
        updatedAt: agora,
      });
    }
    for (const m of p.manutencao ?? []) {
      const itemId = acervoPorNome(m.item);
      const item = (await ctx.db.get(itemId))!;
      const antes = item.emManutencao ?? 0;
      await ctx.db.patch(itemId, { emManutencao: antes + m.quantidade });
      await ctx.db.insert("collectionAdjustments", {
        userId,
        collectionItemId: itemId,
        tipo: "manutencao_envio" as const,
        delta: 0,
        quantidadeAntes: item.quantidadeTotal,
        quantidadeDepois: item.quantidadeTotal,
        manutencaoAntes: antes,
        manutencaoDepois: antes + m.quantidade,
        motivo: m.motivo,
        eventId: outroId,
      });
    }
  }

  return {
    eventId,
    portfolio: {
      eventos: eventosDoPortfolio,
      lancamentos: lancamentosDoPortfolio,
      compras: comprasDoPortfolio,
    },
    resumo: {
      fornecedores: d.suppliers.length,
      materiais: d.materials.length,
      composicoes: d.compositions.length,
      acervo: d.collection.length,
      reservas: d.reservations.length,
      ajustesDeAcervo: d.adjustments.length,
      equipe: d.team.length,
      checklist: d.checklist.length,
      compras: d.purchases.length,
      orcamento: d.budget.length,
      lancamentos: d.transactions.length,
      montagem: d.assembly.length,
      leads: d.leads.length,
      propostas: 1,
    },
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// LIMPAR E RESETAR — as únicas funções deste arquivo que APAGAM
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
// A apresentação de 06/10 vai ser ensaiada mais de uma vez. Cada ensaio deixa
// rastro: um item de checklist marcado, um lead movido, uma conta dada como
// paga. Sem reset, o terceiro ensaio roda sobre uma demo já mexida — e o
// apresentador descobre no ar que o número que ele ia citar mudou.
//
// ── POR QUE APAGAR AQUI É PERIGOSO, E O QUE SEGURA ──────────────────────────
// O seed sempre foi SOMENTE-INSERÇÃO, e essa era metade da sua segurança.
// Estas duas funções quebram isso de propósito, então carregam trava própria:
//
//   1. `assertDemoEnvironment` — ALTAR_DEMO=1, nenhum rastro de cobrança
//      Asaas, no máximo três contas. A mesma do seed.
//   2. FRASE DIGITADA, não booleano. Um `confirmar: true` é o valor que um
//      clique errado produz; uma frase exata tem de ser digitada.
//   3. O EVENTO MARCADO PRECISA EXISTIR. Sem um evento com o marcador `[demo]`
//      neste banco, não há demonstração para apagar — e apagar assim mesmo
//      seria limpar a conta de alguém que nunca semeou nada aqui.
//
// ── O QUE ELA APAGA, E O QUE ISSO CUSTA ─────────────────────────────────────
// Tudo o que pertence à CONTA da demonstração nas dezoito tabelas que o seed
// escreve. Não é "o que o seed criou": é tudo dessa conta nessas tabelas.
//
// A diferença importa e está escrita aqui de propósito: se alguém usar a conta
// demo para trabalho de verdade, o reset leva esse trabalho junto. A trava 3
// garante que a conta é uma que já foi semeada; ela não garante que ninguém
// guardou nada ali depois. Quem opera o deployment precisa saber disso, e é
// por isso que a resposta diz quantas linhas foram apagadas de cada tabela.
//
// Fotos, contratos e plantas o seed NUNCA criou — são subidos à mão, e as fotos
// de Marina & Gabriel são o clímax da apresentação. Por isso o reset RECUSA
// quando encontra algum, em vez de escolher sozinho entre deixar linha órfã e
// destruir o trabalho manual. `{ "apagarArquivos": true }` é a decisão explícita
// de descartá-los; mesmo assim só o vínculo some, e o arquivo continua no
// storage do Convex.
// ═════════════════════════════════════════════════════════════════════════════

/** A frase. Longa e específica para não ser digitada por reflexo. */
export const CONFIRMACAO_DE_RESET = "APAGAR E RECRIAR A DEMONSTRACAO";

/**
 * Teto por tabela numa limpeza.
 *
 * A demo semeada tem dezenas de linhas por tabela, não milhares. Se uma passar
 * disto, alguma coisa está muito diferente do esperado e a resposta diz
 * `incompleta: true` em vez de apagar às cegas e mentir que terminou.
 */
const TETO_POR_TABELA = 2000;

/** As tabelas que o seed escreve, todas com índice por usuário. */
const TABELAS_DA_DEMO = [
  // ── POR QUE `notifications` ESTÁ AQUI, SE O SEED NÃO ESCREVE NELA ────────
  // Porque o cron diário escreve. `notifications.generateDailyAlerts` roda às
  // 5h da manhã e cria avisos com `relatedEventId` apontando para os eventos
  // da demonstração. Deixá-los de fora fazia o reset apagar o evento e manter
  // o aviso: o sino mostraria uma linha que leva a um evento que não existe
  // mais — exatamente o órfão que a ordem filho-antes-de-pai existe para
  // evitar. E é dado DERIVADO: o cron da madrugada seguinte refaz.
  "notifications",
  "proposals", "leads", "assemblyItems", "transactions", "purchaseItems",
  "checklistItems", "eventTeam", "teamMembers", "collectionAdjustments",
  "collectionReservations", "collectionItems", "compositions", "materials",
  "eventSuppliers", "suppliers", "briefings", "events",
] as const;

type TabelaDaDemo = (typeof TABELAS_DA_DEMO)[number];

/**
 * Apaga o conteúdo da demonstração da conta indicada.
 *
 * A ordem de `TABELAS_DA_DEMO` é FILHO ANTES DE PAI. Convex não tem chave
 * estrangeira, então nada quebraria ao contrário — mas se a limpeza parar no
 * meio (teto atingido, erro), o que sobra é um pai sem filhos, e não um filho
 * apontando para um evento que não existe mais. Órfão é o estado que faz uma
 * tela quebrar; pai vazio é só uma tela vazia.
 */
async function limparConta(ctx: MutationCtx, userId: Id<"users">, apagarArquivos: boolean) {
  const apagadas: Partial<Record<TabelaDaDemo | "budgetItems" | "anexos", number>> = {};
  let incompleta = false;

  // `budgetItems` só tem índice por evento, então precisa dos eventos antes de
  // eles sumirem.
  const eventos = await ctx.db
    .query("events")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(TETO_POR_TABELA);

  let orcamento = 0;
  for (const e of eventos) {
    const itens = await ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", e._id))
      .take(TETO_POR_TABELA);
    if (itens.length === TETO_POR_TABELA) incompleta = true;
    for (const i of itens) await ctx.db.delete(i._id);
    orcamento += itens.length;
  }
  apagadas.budgetItems = orcamento;

  // Os anexos vêm antes dos eventos, pela mesma razão que tudo o mais: quem
  // fica para trás fica sem filho, nunca órfão.
  const anexos = await anexosDaConta(ctx, userId, eventos);
  if (anexos.total > 0 && !apagarArquivos) {
    throw new ConvexError({
      code: "TEM_ARQUIVO",
      message:
        `Recusado: nada foi apagado. Esta conta tem ${anexos.fotos.length} foto(s), ` +
        `${anexos.contratos.length} contrato(s), ${anexos.plantas.length} planta(s) e ` +
        `${anexos.documentos.length} documento(s) de lead — ` +
        "e o seed nunca criou nenhum deles, o que quer dizer que foram subidos à " +
        "mão. Apagar o evento deixaria essas linhas órfãs. Se quiser mesmo " +
        'descartá-las, informe { "apagarArquivos": true }. Os arquivos em si ' +
        "continuam no storage do Convex; só o vínculo com o evento some.",
    });
  }
  for (const linha of [
    ...anexos.fotos, ...anexos.contratos, ...anexos.plantas, ...anexos.documentos,
  ]) {
    await ctx.db.delete(linha._id);
  }
  apagadas.anexos = anexos.total;

  for (const tabela of TABELAS_DA_DEMO) {
    const linhas = await ctx.db
      .query(tabela)
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(TETO_POR_TABELA);
    if (linhas.length === TETO_POR_TABELA) incompleta = true;
    for (const l of linhas) await ctx.db.delete(l._id);
    apagadas[tabela] = linhas.length;
  }

  return { apagadas, incompleta };
}

/**
 * As tabelas que guardam ARQUIVO e que o seed nunca escreve.
 *
 * ── POR QUE ELAS PRECISAM DE TRATAMENTO SEPARADO ──────────────────────────
 * O seed não cria foto nenhuma: as imagens de Marina & Gabriel são subidas à
 * mão pela interface, e são o clímax da apresentação. Se o reset apagasse o
 * evento e deixasse as fotos apontando para ele, sobrariam linhas órfãs; se
 * apagasse as fotos junto, o ensaio destruiria o trabalho manual que mais
 * custou a fazer.
 *
 * Então ele PERGUNTA. Sem `apagarArquivos`, recusa e diz quantos arquivos
 * encontrou. É a única coisa nesta demonstração que não dá para refazer
 * rodando um comando.
 */
async function anexosDaConta(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventos: readonly Doc<"events">[],
) {
  const fotos = await ctx.db
    .query("eventPhotos")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(TETO_POR_TABELA);
  const contratos = await ctx.db
    .query("contracts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(TETO_POR_TABELA);
  // `leadDocuments.storageId` é obrigatório: toda linha aqui É um arquivo que
  // alguém subiu. Vale a mesma regra das fotos — o seed nunca criou nenhum, e
  // apagar sem perguntar destruiria trabalho manual.
  const documentos = await ctx.db
    .query("leadDocuments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(TETO_POR_TABELA);

  // `layoutRenders` só tem índice por evento.
  const plantas: Doc<"layoutRenders">[] = [];
  for (const e of eventos) {
    plantas.push(
      ...(await ctx.db
        .query("layoutRenders")
        .withIndex("by_event", (q) => q.eq("eventId", e._id))
        .take(TETO_POR_TABELA)),
    );
  }

  return {
    fotos, contratos, plantas, documentos,
    total: fotos.length + contratos.length + plantas.length + documentos.length,
  };
}

/** As três travas, na ordem em que precisam barrar. Devolve a conta da demo. */
async function autorizarReset(
  ctx: MutationCtx,
  confirmo: string,
): Promise<Id<"users">> {
  await assertDemoEnvironment(ctx);

  if (confirmo !== CONFIRMACAO_DE_RESET) {
    throw new ConvexError({
      code: "CONFIRMACAO_INVALIDA",
      message:
        `Recusado: nada foi apagado. Para confirmar, informe ` +
        `{ "confirmo": "${CONFIRMACAO_DE_RESET}" } — exatamente assim.`,
    });
  }

  const marcado = await encontrarEventoDemo(ctx);
  if (!marcado) {
    throw new ConvexError({
      code: "NADA_PARA_RESETAR",
      message:
        "Recusado: nada foi apagado. Não existe evento com o marcador " +
        `${DEMO_MARKER} neste banco, ou seja, o seed nunca rodou aqui. Apagar ` +
        "assim mesmo limparia a conta de alguém que não semeou nada.",
    });
  }
  return marcado.userId;
}

/**
 * Apaga a demonstração e NÃO recria.
 *
 *   internal.demo.limpar  { "confirmo": "APAGAR E RECRIAR A DEMONSTRACAO" }
 *
 * Existe separada de `resetar` para o caso de querer o banco vazio — trocar o
 * roteiro, conferir uma tela de estado vazio, encerrar o ambiente.
 */
export const limpar = internalMutation({
  args: { confirmo: v.string(), apagarArquivos: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await autorizarReset(ctx, args.confirmo);
    const { apagadas, incompleta } = await limparConta(ctx, userId, args.apagarArquivos === true);
    return {
      limpou: true as const,
      apagadas,
      incompleta,
      proximoPasso: incompleta
        ? `Sobrou conteúdo: alguma tabela passou de ${TETO_POR_TABELA} linhas. Rode de novo.`
        : "Banco limpo. Rode internal.demo.seed para semear de novo.",
    };
  },
});

/**
 * Apaga e recria a demonstração, na mesma transação.
 *
 *   internal.demo.resetar  { "confirmo": "APAGAR E RECRIAR A DEMONSTRACAO" }
 *
 * É o botão do ensaio: devolve a demo ao estado exato em que o roteiro foi
 * escrito. Mesma transação de propósito — se a recriação falhar, o apagamento
 * não fica de pé sozinho, e ninguém abre a apresentação com o banco vazio.
 */
export const resetar = internalMutation({
  args: { confirmo: v.string(), apagarArquivos: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await autorizarReset(ctx, args.confirmo);
    const { apagadas, incompleta } = await limparConta(ctx, userId, args.apagarArquivos === true);
    if (incompleta) {
      throw new ConvexError({
        code: "LIMPEZA_INCOMPLETA",
        message:
          `Recusado: alguma tabela passou de ${TETO_POR_TABELA} linhas e a ` +
          "limpeza não terminou, e semear por cima duplicaria o conteúdo. " +
          "Como a mutation é uma transação só, o que já tinha sido apagado " +
          "VOLTOU: o banco está como estava. Rode internal.demo.limpar, que " +
          "apaga em rodadas, até ele dizer que terminou.",
      });
    }
    // Recria com o MESMO código do seed. Se divergisse, a demo recriada não
    // seria a demo ensaiada.
    const criado = await inserirDemonstracao(ctx, userId);
    return { resetou: true as const, apagadas, ...criado };
  },
});

/**
 * Deixa a CONTA de demonstração pronta para a live — acesso, não conteúdo.
 *
 *   internal.demo.prepararConta  { }
 *   internal.demo.prepararConta  { "email": "demo@exemplo.com.br" }
 *
 * ── OS DOIS DEFEITOS QUE A AUDITORIA DE 28/09 ACHOU NA DEMO ─────────────────
 *   · teste vencido em 15/09 e sem acesso `internal`: o paywall cortaria o
 *     bloco 2 (converter proposta em evento) e a IA, ao vivo;
 *   · `role: "admin"`: a barra lateral mostraria "Painel Admin" e "Campanha"
 *     na transmissão — justamente as telas que o roteiro manda não abrir.
 *
 * O caminho que existia, `admin.grantInternalAccessByEmail`, libera o acesso
 * MAS promove a admin (é a ferramenta de SUPORTE, e por isso a demo estava
 * admin). Aqui é o contrário: `internal` e `user`.
 *
 * Mesma trava do seed (`assertDemoEnvironment`): ALTAR_DEMO=1, nenhum rastro
 * de cobrança, no máximo três contas. Em produção, recusa antes de ler. Não
 * cria conta, não mexe em senha nem em conteúdo, e é idempotente.
 */
export const prepararConta = internalMutation({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertDemoEnvironment(ctx);
    const usuarios = await ctx.db.query("users").take(MAX_CONTAS_LISTADAS);
    const conta = args.email
      ? usuarios.find((u) => u.email.trim().toLowerCase() === args.email!.trim().toLowerCase())
      : usuarios.length === 1
        ? usuarios[0]
        : undefined;
    if (!conta) {
      throw new ConvexError({
        code: "AMBIGUOUS_USER",
        message: args.email
          ? `Nenhum usuário com o e-mail ${args.email}. Nada foi alterado.`
          : `Há ${usuarios.length} usuários neste banco. Informe { "email": "..." }. Nada foi alterado.`,
      });
    }
    await ctx.db.patch(conta._id, {
      accessType: "internal",
      accessExpiresAt: undefined,
      role: "user",
    });
    const depois = (await ctx.db.get(conta._id))!;
    return {
      email: depois.email,
      role: depois.role,
      accessType: depois.accessType,
      // A pergunta que importa no dia: o paywall corta alguma coisa?
      bloqueada: resolveAccess(depois).blocked,
    };
  },
});
