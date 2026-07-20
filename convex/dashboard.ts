import { query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server.d.ts";

async function getAuthUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
  return user;
}

// ─── Dashboard summary data ───────────────────────────────────────────────────

export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);

    const allEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const now = new Date();
    const nowIso = now.toISOString();

    // Upcoming events (not cancelled/completed, date in the future)
    const upcoming = allEvents
      .filter((e) => e.date >= nowIso && e.status !== "cancelled" && e.status !== "completed")
      .sort((a, b) => a.date.localeCompare(b.date));

    const nextEvent = upcoming[0] ?? null;

    // Revenue this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
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
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.toISOString();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const count = allEvents.filter((e) => e.date >= start && e.date <= end).length;
      const revenue = allEvents
        .filter((e) => e.date >= start && e.date <= end)
        .reduce((s, e) => s + (e.budget ?? 0), 0);
      months.push({ label, count, revenue });
    }

    // Pending checklist items across all upcoming events (next 30 days)
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
      pendingPurchasesCount += items.filter((i) => !i.isPurchased).length;
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
