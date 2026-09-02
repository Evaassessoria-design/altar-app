import { ConvexError, v } from "convex/values";
import { effectivePurchaseStatus, isPendingStatus } from "./lib/purchaseStatus";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { getOptionalUser, requireIdentity, requireUser } from "./lib/identity";
import { trialAlertBody, trialAlertDaysLeft } from "./lib/trialAlerts";

// List latest 50 notifications for the current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

// Unread count
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("isRead", false))
      .collect();
    return unread.length;
  },
});

// Mark one as read
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const notif = await ctx.db.get(args.id);
    if (!notif || notif.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });
    await ctx.db.patch(args.id, { isRead: true });
  },
});

// Mark all as read
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("isRead", false))
      .collect();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { isRead: true })));
  },
});

// Delete one notification
export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const notif = await ctx.db.get(args.id);
    if (!notif || notif.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });
    await ctx.db.delete(args.id);
  },
});

// Public mutation so the current user can trigger their own alerts immediately
export const generateMyAlerts = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    await requireIdentity(ctx);
    const user = await getOptionalUser(ctx);
    if (!user) return;

    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const sevenDaysFromNow = new Date(now.getTime() + sevenDaysMs);
    const todayISO = now.toISOString().slice(0, 10);
    const sevenISO = sevenDaysFromNow.toISOString().slice(0, 10);

    const upcomingEvents = await ctx.db
      .query("events")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).gte("date", todayISO).lte("date", sevenISO),
      )
      .collect();

    for (const event of upcomingEvents) {
      if (event.status === "cancelled" || event.status === "completed") continue;
      const daysUntil = Math.ceil(
        (new Date(event.date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

      const pendingChecklist = await ctx.db
        .query("checklistItems")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .filter((q) => q.eq(q.field("isChecked"), false))
        .take(1);

      if (pendingChecklist.length > 0) {
        const exists = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("type"), "checklist_incomplete"),
              q.eq(q.field("relatedEventId"), event._id),
            ),
          )
          .first();
        if (!exists) {
          await ctx.db.insert("notifications", {
            userId: user._id,
            type: "checklist_incomplete",
            title: `Checklist incompleto — ${event.name}`,
            body: `Faltam ${daysUntil} dia${daysUntil === 1 ? "" : "s"} para o evento e ainda há itens não concluídos no checklist.`,
            isRead: false,
            relatedEventId: event._id,
            createdAt: now.toISOString(),
          });
        }
      }

      const eventAlert = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), "event_soon"),
            q.eq(q.field("relatedEventId"), event._id),
          ),
        )
        .first();
      if (!eventAlert) {
        await ctx.db.insert("notifications", {
          userId: user._id,
          type: "event_soon",
          title: `Evento próximo — ${event.name}`,
          body: `O evento "${event.name}" acontece em ${daysUntil} dia${daysUntil === 1 ? "" : "s"}. Tudo pronto?`,
          isRead: false,
          relatedEventId: event._id,
          createdAt: now.toISOString(),
        });
      }

      // `isPurchased === false` incluía o item CANCELADO: a decoradora tirava
      // a peça da lista e continuava recebendo "ainda há compras pendentes"
      // por causa dela. A regra certa é a situação efetiva — a mesma que o
      // Painel e o Quadro de Atenção usam (lib/purchaseStatus.ts).
      const pending = (
        await ctx.db
          .query("purchaseItems")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect()
      ).filter((i) => isPendingStatus(effectivePurchaseStatus(i)));
      if (pending.length > 0) {
        const exists = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("type"), "purchase_pending"),
              q.eq(q.field("relatedEventId"), event._id),
            ),
          )
          .first();
        if (!exists) {
          await ctx.db.insert("notifications", {
            userId: user._id,
            type: "purchase_pending",
            title: `Compras pendentes — ${event.name}`,
            body: `Existem itens de compra não adquiridos para o evento "${event.name}".`,
            isRead: false,
            relatedEventId: event._id,
            createdAt: now.toISOString(),
          });
        }
      }
    }

    // Aviso de trial: quem decide é lib/trialAlerts. Contas isentas de cobrança
    // (internal, admin, beta vigente) recebem `null` e não são notificadas.
    const daysLeft = trialAlertDaysLeft(user, now.getTime());
    if (daysLeft !== null) {
      const todayStr = now.toISOString().slice(0, 10);
      const recentAlert = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("type"), "trial_expiring"))
        .order("desc")
        .first();
      if (!recentAlert || recentAlert.createdAt.slice(0, 10) !== todayStr) {
        await ctx.db.insert("notifications", {
          userId: user._id,
          type: "trial_expiring",
          title: "Trial expirando em breve",
          body: trialAlertBody(daysLeft),
          isRead: false,
          createdAt: now.toISOString(),
        });
      }
    }
  },
});

export const generateDailyAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const sevenDaysFromNow = new Date(now.getTime() + sevenDaysMs);
    const todayISO = now.toISOString().slice(0, 10);
    const sevenISO = sevenDaysFromNow.toISOString().slice(0, 10);

    const users = await ctx.db.query("users").take(500);

    for (const user of users) {
      // 1. Events in the next 7 days
      const upcomingEvents = await ctx.db
        .query("events")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", user._id).gte("date", todayISO).lte("date", sevenISO),
        )
        .collect();

      for (const event of upcomingEvents) {
        if (event.status === "cancelled" || event.status === "completed") continue;

        const daysUntil = Math.ceil(
          (new Date(event.date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        );

        // Check for incomplete checklist items
        const pendingChecklist = await ctx.db
          .query("checklistItems")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .filter((q) => q.eq(q.field("isChecked"), false))
          .take(1);

        if (pendingChecklist.length > 0) {
          const exists = await ctx.db
            .query("notifications")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .filter((q) =>
              q.and(
                q.eq(q.field("type"), "checklist_incomplete"),
                q.eq(q.field("relatedEventId"), event._id),
              ),
            )
            .first();
          if (!exists) {
            await ctx.db.insert("notifications", {
              userId: user._id,
              type: "checklist_incomplete",
              title: `Checklist incompleto — ${event.name}`,
              body: `Faltam ${daysUntil} dia${daysUntil === 1 ? "" : "s"} para o evento e ainda há itens não concluídos no checklist.`,
              isRead: false,
              relatedEventId: event._id,
              createdAt: now.toISOString(),
            });
          }
        }

        // Event upcoming alert (once per event, only if no recent one)
        const eventAlert = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("type"), "event_soon"),
              q.eq(q.field("relatedEventId"), event._id),
            ),
          )
          .first();
        if (!eventAlert) {
          await ctx.db.insert("notifications", {
            userId: user._id,
            type: "event_soon",
            title: `Evento próximo — ${event.name}`,
            body: `O evento "${event.name}" acontece em ${daysUntil} dia${daysUntil === 1 ? "" : "s"}. Tudo pronto?`,
            isRead: false,
            relatedEventId: event._id,
            createdAt: now.toISOString(),
          });
        }
      }

      // 2. Trial expiring — MESMA regra de `generateMyAlerts`, importada de
      // lib/trialAlerts para as duas não voltarem a divergir. Contas isentas
      // de cobrança (internal, admin, beta vigente) recebem `null` aqui.
      const daysLeft = trialAlertDaysLeft(user, now.getTime());
      if (daysLeft !== null) {
        const recentAlert = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) => q.eq(q.field("type"), "trial_expiring"))
          .order("desc")
          .first();
        // Only re-notify once per day
        if (!recentAlert || recentAlert.createdAt.slice(0, 10) !== todayISO) {
          await ctx.db.insert("notifications", {
            userId: user._id,
            type: "trial_expiring",
            title: "Trial expirando em breve",
            body: trialAlertBody(daysLeft),
            isRead: false,
            createdAt: now.toISOString(),
          });
        }
      }

      // 3. Pending purchases for events in next 7 days
      for (const event of upcomingEvents) {
        if (event.status === "cancelled" || event.status === "completed") continue;
        // Mesma regra do bloco acima: cancelado não é pendência de ninguém.
        const pending = (
          await ctx.db
            .query("purchaseItems")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect()
        ).filter((i) => isPendingStatus(effectivePurchaseStatus(i)));
        if (pending.length > 0) {
          const exists = await ctx.db
            .query("notifications")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .filter((q) =>
              q.and(
                q.eq(q.field("type"), "purchase_pending"),
                q.eq(q.field("relatedEventId"), event._id),
              ),
            )
            .first();
          if (!exists) {
            await ctx.db.insert("notifications", {
              userId: user._id,
              type: "purchase_pending",
              title: `Compras pendentes — ${event.name}`,
              body: `Existem itens de compra não adquiridos para o evento "${event.name}".`,
              isRead: false,
              relatedEventId: event._id,
              createdAt: now.toISOString(),
            });
          }
        }
      }
    }
  },
});
