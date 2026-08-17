import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireUser } from "./lib/identity";

// ─── Team Members ────────────────────────────────────────────────────────────

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const createMember = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return ctx.db.insert("teamMembers", { userId: user._id, ...args });
  },
});

export const updateMember = mutation({
  args: {
    id: v.id("teamMembers"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const member = await ctx.db.get(args.id);
    if (!member || member.userId !== user._id)
      throw new ConvexError({ message: "Membro não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const deleteMember = mutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const member = await ctx.db.get(args.id);
    if (!member || member.userId !== user._id)
      throw new ConvexError({ message: "Membro não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});

// ─── Event Team Assignments ───────────────────────────────────────────────────

export const listEventTeam = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Query de listagem: degrada para vazio (não lança) — ver orcamento.listItems.
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return [];
    const assignments = await ctx.db
      .query("eventTeam")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    // Filter by user ownership and join with member data
    const results = await Promise.all(
      assignments
        .filter((a) => a.userId === event.userId)
        .map(async (a) => {
          const member = await ctx.db.get(a.teamMemberId);
          return { ...a, member };
        }),
    );
    return results.filter((r) => r.member !== null);
  },
});

export const addToEventTeam = mutation({
  args: {
    eventId: v.id("events"),
    teamMemberId: v.id("teamMembers"),
    scheduledTime: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // O membro precisa ser da equipe do próprio usuário — senão daria para
    // anexar a equipe de outra pessoa a um evento seu.
    const member = await ctx.db.get(args.teamMemberId);
    if (!member || member.userId !== user._id) {
      throw new ConvexError({ message: "Membro não encontrado", code: "NOT_FOUND" });
    }
    // Check not already added
    const existing = await ctx.db
      .query("eventTeam")
      .withIndex("by_event_member", (q) =>
        q.eq("eventId", args.eventId).eq("teamMemberId", args.teamMemberId),
      )
      .unique();
    if (existing) throw new ConvexError({ message: "Membro já adicionado ao evento", code: "CONFLICT" });
    return ctx.db.insert("eventTeam", { userId: user._id, ...args });
  },
});

export const updateEventTeamMember = mutation({
  args: {
    id: v.id("eventTeam"),
    scheduledTime: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await ctx.db.get(args.id);
    if (!assignment || assignment.userId !== user._id)
      throw new ConvexError({ message: "Atribuição não encontrada", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const removeFromEventTeam = mutation({
  args: { id: v.id("eventTeam") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await ctx.db.get(args.id);
    if (!assignment || assignment.userId !== user._id)
      throw new ConvexError({ message: "Atribuição não encontrada", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});
