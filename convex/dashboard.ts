import { query } from "./_generated/server";
import { requireUser } from "./lib/identity";
import { diasEntre, montarAtencao, JANELA_RETORNO_DIAS } from "./lib/attention";
import { deficitDaReserva, disponibilidadeNaJanela, faltaVoltar } from "./lib/acervo";
import { effectivePurchaseStatus, isOverdue, isPendingStatus } from "./lib/purchaseStatus";
import { aguardandoEntrega } from "./lib/panoramaDeCompras";
import { dataDoDia, dataEmDias, faixaDoMes, primeiroDiaDoMes } from "./lib/dataDoDia";
import { resumirFornecedores } from "./lib/eventSummary";
import { fornecedoresDaDecoradora } from "./lib/escopoDecoradora";

// ─── Dashboard summary data ───────────────────────────────────────────────────

export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const allEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const now = new Date();
    // Dia, não instante: `e.date` é "AAAA-MM-DD" e comparar com um ISO
    // completo excluía o evento de HOJE (ver lib/dataDoDia.ts).
    const hoje = dataDoDia(now);

    // Upcoming events (not cancelled/completed, date in the future)
    const upcoming = allEvents
      .filter((e) => e.date >= hoje && e.status !== "cancelled" && e.status !== "completed")
      .sort((a, b) => a.date.localeCompare(b.date));

    const nextEvent = upcoming[0] ?? null;

    // Revenue this month
    // O dia 1º ficava DE FORA de "este mês" com o ISO completo, enquanto o
    // Financeiro (que já cortava em 10 caracteres) o incluía: duas telas
    // mostrando números diferentes para o mesmo mês.
    const monthStart = primeiroDiaDoMes(now);
    const monthTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).gte("date", monthStart),
      )
      .collect();
    const revenueThisMonth = monthTransactions
      .filter((t) => t.type === "income" && t.isPaid)
      .reduce((s, t) => s + t.amount, 0);
    const expensesThisMonth = monthTransactions
      .filter((t) => t.type === "expense" && t.isPaid)
      .reduce((s, t) => s + t.amount, 0);

    // Events by status
    const byStatus = {
      planning: allEvents.filter((e) => e.status === "planning").length,
      confirmed: allEvents.filter((e) => e.status === "confirmed").length,
      in_progress: allEvents.filter((e) => e.status === "in_progress").length,
      completed: allEvents.filter((e) => e.status === "completed").length,
      cancelled: allEvents.filter((e) => e.status === "cancelled").length,
    };

    // Events per month (last 6 months)
    const months: { label: string; count: number; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const { inicio: start, fim: end, rotulo: label } = faixaDoMes(-i, now);
      const count = allEvents.filter((e) => e.date >= start && e.date <= end).length;
      const revenue = allEvents
        .filter((e) => e.date >= start && e.date <= end)
        .reduce((s, e) => s + (e.budget ?? 0), 0);
      months.push({ label, count, revenue });
    }

    // Pending checklist items across all upcoming events (next 30 days)
    const in30Days = dataEmDias(30, now);
    const urgentEvents = upcoming.filter((e) => e.date <= in30Days);
    let pendingChecklistCount = 0;
    const urgentTasks: { eventName: string; eventDate: string; itemName: string; phase: string }[] = [];

    for (const ev of urgentEvents.slice(0, 5)) {
      const items = await ctx.db
        .query("checklistItems")
        .withIndex("by_event", (q) => q.eq("eventId", ev._id))
        .collect();
      const unchecked = items.filter((i) => !i.isChecked);
      pendingChecklistCount += unchecked.length;
      for (const item of unchecked.slice(0, 3)) {
        urgentTasks.push({
          eventName: ev.name,
          eventDate: ev.date,
          itemName: item.name,
          phase: item.phase,
        });
      }
    }

    // Pending purchases (not yet purchased) across upcoming events
    let pendingPurchasesCount = 0;
    for (const ev of urgentEvents.slice(0, 10)) {
      const items = await ctx.db
        .query("purchaseItems")
        .withIndex("by_event", (q) => q.eq("eventId", ev._id))
        .collect();
      // `!isPurchased` contava CANCELADO como "falta comprar": um item que a
      // decoradora tirou da lista continuava inflando o número do painel, e o
      // Quadro de Atenção (que já usava esta regra) mostrava outro valor para
      // o mesmo evento. A verdade é a situação efetiva do item.
      pendingPurchasesCount += items.filter((i) =>
        isPendingStatus(effectivePurchaseStatus(i)),
      ).length;
    }

    return {
      totalEvents: allEvents.length,
      upcomingCount: upcoming.length,
      completedCount: byStatus.completed,
      nextEvent,
      revenueThisMonth,
      expensesThisMonth,
      byStatus,
      monthlyData: months,
      pendingChecklistCount,
      pendingPurchasesCount,
      urgentTasks: urgentTasks.slice(0, 8),
    };
  },
});

/**
 * "Precisam da sua atenção" — os eventos que exigem alguma coisa hoje.
 *
 * As REGRAS vivem em lib/attention.ts, puras e testadas. Esta query só lê o
 * banco e entrega os números; nenhum julgamento nasce aqui.
 *
 * Só olha eventos ainda por vir e não cancelados, dentro de uma janela de
 * leitura generosa — o corte fino de "isto merece atenção?" é da regra, não da
 * consulta.
 */
export const getAttentionBoard = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const hojeISO = dataDoDia();

    const eventos = (
      await ctx.db
        .query("events")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).filter(
      (e) =>
        e.status !== "cancelled" &&
        e.status !== "completed" &&
        // Passado recente entra por UM motivo só: "não voltou" é uma pergunta
        // que nasce DEPOIS do evento, e um painel que só olha para a frente
        // nunca a faria. Quem não tiver motivo sai em `montarAtencao`.
        e.date >= dataEmDias(-JANELA_RETORNO_DIAS),
    );

    // Acervo em DUAS consultas, não uma por evento: o N+1 aqui multiplicaria
    // por todo evento do painel. As regras continuam em lib/acervo.ts.
    const [reservas, itensDeAcervo] = await Promise.all([
      ctx.db.query("collectionReservations").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("collectionItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
    ]);
    const totalDoItem = new Map(itensDeAcervo.map((i) => [i._id as string, i.quantidadeTotal]));
    const reservasPorItem = new Map<string, typeof reservas>();
    for (const r of reservas) {
      const chave = r.collectionItemId as string;
      const atual = reservasPorItem.get(chave);
      if (atual) atual.push(r);
      else reservasPorItem.set(chave, [r]);
    }

    const entradas = await Promise.all(
      eventos.map(async (e) => {
        const [checklist, compras, fornecedores, equipe] = await Promise.all([
          ctx.db.query("checklistItems").withIndex("by_event", (q) => q.eq("eventId", e._id)).collect(),
          ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", e._id)).collect(),
          ctx.db.query("eventSuppliers").withIndex("by_event", (q) => q.eq("eventId", e._id)).collect(),
          ctx.db.query("eventTeam").withIndex("by_event", (q) => q.eq("eventId", e._id)).collect(),
        ]);

        const doEvento = reservas.filter((r) => r.eventId === e._id);

        // Déficit: o que a reserva pede menos o que está livre na janela dela.
        // Número calculado, nunca "não sei" — material reutilizável sem item
        // de acervo vinculado simplesmente não gera reserva, e por isso não
        // aparece aqui. Ausência de informação não vira alerta.
        const acervoDeficit = doEvento.reduce((soma, r) => {
          const total = totalDoItem.get(r.collectionItemId as string);
          if (total === undefined) return soma;
          const estado = disponibilidadeNaJanela(
            total,
            reservasPorItem.get(r.collectionItemId as string) ?? [],
            { inicio: r.inicio, fim: r.fim },
            e._id as string,
          );
          return soma + deficitDaReserva(r.quantidade, estado.disponivel);
        }, 0);

        // Só conta depois que a janela operacional TERMINOU. Durante ela a
        // peça está no evento, que é onde ela deve estar.
        const acervoNaoRetornado = doEvento.reduce(
          (soma, r) => (r.fim < hojeISO ? soma + faltaVoltar(r) : soma),
          0,
        );

        return {
          eventId: e._id as string,
          nome: e.name,
          data: e.date,
          diasAte: diasEntre(hojeISO, e.date),
          acervoDeficit,
          acervoNaoRetornado,
          checklistPendentes: checklist.filter((i) => i.phase === "pre" && !i.isChecked).length,
          comprasPendentes: compras.filter((i) => isPendingStatus(effectivePurchaseStatus(i))).length,
          comprasAtrasadas: compras.filter((i) => isOverdue(i, hojeISO)).length,
          // Comprado e ainda não recebido: o dinheiro saiu, a caixa não chegou.
          // A regra de quando isso vira atenção é de lib/attention.ts.
          comprasAguardandoEntrega: compras.filter(aguardandoEntrega).length,
          // "Fornecedor sem confirmação" também é sobre a operação dela: o
          // buffet não ter confirmado é uma pendência do cliente, não da
          // decoradora. A regra é a mesma de `acoesDeFornecedor`.
          fornecedoresAguardando: resumirFornecedores(fornecedoresDaDecoradora(fornecedores))
            .aguardando,
          equipeEscalada: equipe.length,
          // A categoria vai junto: quem decide se a ação é da decoradora é a
          // regra em lib/attention.ts, não esta consulta.
          acoesDeFornecedor: fornecedores
            .filter((f) => f.nextAction?.trim())
            .map((f) => ({
              fornecedor: f.companyName,
              texto: f.nextAction!.trim(),
              categoria: f.category,
            })),
        };
      }),
    );

    return montarAtencao(entradas);
  },
});
