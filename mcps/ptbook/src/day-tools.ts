import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dateKey, DomainError, id, isoTime, planRow, type DayState, type Identity } from "./contracts.js";
import type { Env } from "./env.js";
import { estimateInput, estimateMeal, logMeal, logMealInput } from "./meals.js";
import { applyPlan, proposeInput, proposePlan, updateProgress } from "./plans.js";
import { reply, type Meta } from "./response.js";
import { logSet, logSetInput } from "./sets.js";
import { getSleep } from "./sleep.js";
import { commit, nutrition, replay } from "./state.js";
import { loadDay, mutateDay } from "./store.js";
import { estimateImage } from "./vision.js";
import { mediaLink, type MediaContext } from "./media-auth.js";

export function registerDayTools(
  server: McpServer,
  context: MediaContext,
) {
  const store = { db: context.env.DB, identity: context.identity };
  const meta: Meta = { dataMode: "live", source: "ptbook_d1",
    asOf: new Date().toISOString(), warnings: [], storage: "durable" };
  const dateInput = z.strictObject({ date: dateKey });
  const progress = (state: DayState) => ({
    completedSets: state.plan?.rows.reduce((sum, row) => sum + row.completedSets, 0) ?? 0,
    totalSets: state.plan?.rows.reduce((sum, row) => sum + row.sets, 0) ?? 0,
  });
  server.registerTool("get_day_state", {
    description: "Read your persistent plan, sets, meals and uploaded media. Identity comes from authentication, never an argument.",
    inputSchema: dateInput,
  }, ({ date }) => reply(async () => {
    const state = await loadDay(store, date);
    return { state, progress: progress(state), daily: nutrition(state),
      mealUploadUrl: (await mediaLink(context, { date, kind: "meal" })).url };
  }, meta));
  server.registerTool("get_workout_plan", {
    description: "Read your saved plan and completion counts.",
    inputSchema: dateInput,
  }, ({ date }) => reply(async () => {
    const state = await loadDay(store, date);
    return { plan: state.plan, pending: state.pendingPlan, progress: progress(state), view: state.views["plan-A"] ?? null };
  }, meta));

  const planInput = proposeInput.omit({ state: true }).extend({
    focus: z.literal("lower").default("lower"),
    availableMinutes: z.number().int().min(10).max(90).default(40),
  });
  const today = (input: z.infer<typeof planInput>) => reply(() => mutateDay(store, input.date, async state => {
    if (state.plan) return { result: { plan: state.plan, progress: progress(state) }, nextState: state };
    let sleep = null;
    try { sleep = await getSleep(input.date, context); }
    catch (error) {
      if (!(error instanceof DomainError && error.code === "NOT_FOUND")) throw error;
    }
    const proposed = proposePlan({ ...input, state }, sleep);
    const applied = applyPlan({
      date: input.date, state: proposed.nextState, candidateId: proposed.result.candidate.id,
      decision: "apply", expectedRevision: proposed.nextState.revision, requestId: crypto.randomUUID(),
    });
    return { result: { plan: applied.result.plan, progress: progress(applied.nextState) }, nextState: applied.nextState };
  }), meta);
  for (const name of ["get_today_plan", "propose_workout_plan"]) {
    server.registerTool(name, {
      description: "Create and immediately save/apply today's sleep-adjusted plan. Existing plans are returned unchanged. No approval step.",
      inputSchema: planInput,
    }, today);
  }
  server.registerTool("apply_workout_plan", {
    description: "Apply an existing pending plan immediately, or return the already applied plan. No second confirmation.",
    inputSchema: z.strictObject({ date: dateKey, requestId: id }),
  }, input => reply(() => mutateDay(store, input.date, state => {
    if (!state.pendingPlan) {
      if (!state.plan) throw new DomainError("NOT_FOUND", "Create today's plan first.");
      return { result: { plan: state.plan, applied: true }, nextState: state };
    }
    return applyPlan({ ...input, state, candidateId: state.pendingPlan.id,
      decision: "apply", expectedRevision: state.revision });
  }), meta));
  server.registerTool("update_workout_plan", {
    description: "Immediately save the user's requested plan edits, preserving completed set counts.",
    inputSchema: z.strictObject({ date: dateKey, rows: z.array(planRow.omit({ completedSets: true })).min(1).max(3), requestId: id }),
  }, input => reply(() => mutateDay(store, input.date, state => {
    if (!state.plan) throw new DomainError("NOT_FOUND", "Create today's plan first.");
    if (replay(state, { id: input.requestId, operation: "update_workout_plan" })) {
      return { result: { plan: state.plan }, nextState: state };
    }
    const changed = { ...state, plan: { ...state.plan,
      rows: input.rows.map(row => ({ ...row, completedSets: 0 })) } };
    const nextState = commit({ ...changed, plan: updateProgress(changed) },
      { id: input.requestId, operation: "update_workout_plan", recordId: state.plan.id });
    return { result: { plan: nextState.plan }, nextState };
  }), meta));
  server.registerTool("log_set", {
    description: "Immediately save a performed set and update plan completion. Supply date, exercise, kg, reps and requestId.",
    inputSchema: logSetInput.omit({ state: true }).extend({
      planRowId: id.nullable().default(null), rpe: z.number().min(1).max(10).nullable().default(null),
      note: z.string().min(1).max(300).nullable().default(null), occurredAt: isoTime.optional(),
    }),
  }, input => reply(() => mutateDay(store, input.date, state => logSet({
    ...input, state, occurredAt: input.occurredAt ?? new Date().toISOString(),
    planRowId: input.planRowId ?? state.plan?.rows.find(row => row.exercise === input.exercise)?.id ?? null,
  })), meta));
  server.registerTool("get_recent_sets", {
    description: "Read persistent recent sets for a date.",
    inputSchema: z.strictObject({ date: dateKey, exercise: z.string().nullable().default(null),
      limit: z.number().int().min(1).max(30).default(5) }),
  }, input => reply(async () => ({ records: (await loadDay(store, input.date)).sets
    .filter(record => input.exercise === null || record.exercise === input.exercise)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, input.limit) }), meta));

  server.registerTool("estimate_meal", {
    description: "Analyze a meal and IMMEDIATELY save it. salad-demo uses OpenAI photo vision; description-only uses A.X text. Return kcal, macros and daily totals; no approval.",
    inputSchema: estimateInput.omit({ state: true }).extend({ occurredAt: isoTime.optional() }),
  }, input => reply(() => mutateDay(store, input.date, async state => {
    const estimated = await estimateMeal({ ...input, state }, context.env);
    const existing = estimated.nextState.meals.find(meal => meal.id === estimated.result.id);
    if (existing) return { result: { meal: existing, daily: nutrition(estimated.nextState) }, nextState: estimated.nextState };
    return logMeal({
      date: input.date, state: estimated.nextState, estimateId: estimated.result.id,
      occurredAt: input.occurredAt ?? new Date().toISOString(), correction: null, requestId: crypto.randomUUID(),
    });
  }), { ...meta, dataMode: "estimated", source: input.sample_id || input.image_url ? "openai_vision" : "ax_k2_text" }));
  server.registerTool("log_meal", {
    description: "Immediately correct or upsert a recorded meal using its estimateId. Never ask for approval.",
    inputSchema: logMealInput.omit({ state: true }),
  }, input => reply(() => mutateDay(store, input.date, state => logMeal({ ...input, state })), meta));
  server.registerTool("correct_meal", {
    description: "Re-estimate a correction from food/portion text and replace the same meal, not a second meal.",
    inputSchema: z.strictObject({ date: dateKey, mealId: id, description: z.string().min(1).max(300), requestId: id }),
  }, input => reply(() => mutateDay(store, input.date, async state => {
    const meal = state.meals.find(item => item.id === input.mealId);
    if (!meal) throw new DomainError("NOT_FOUND", "This meal is not in your day's records.");
    const estimate = await estimateImage({ description: input.description }, context.env);
    return logMeal({ date: input.date, state, estimateId: meal.id, occurredAt: meal.occurredAt,
      correction: { label: estimate.label, kcal: estimate.kcal, macros: estimate.macros }, requestId: input.requestId });
  }), { ...meta, dataMode: "estimated" }));
  server.registerTool("get_daily_nutrition", {
    description: "Read saved daily kcal and macros with server-computed 4/4/9 energy percentages.",
    inputSchema: dateInput.extend({ targetKcal: z.number().min(1).max(10000).nullable().default(null) }),
  }, input => reply(async () => nutrition(await loadDay(store, input.date), input.targetKcal), meta));
  server.registerTool("remember_card", {
    description: "Remember a rendered GGUI session so the same card can be amended next turn.",
    inputSchema: z.strictObject({ date: dateKey,
      variant: z.enum(["plan-A", "sleep-B", "set-B", "video-A", "diet-A"]),
      sessionId: id, resourceUri: z.string().max(1000), blueprintId: z.string().max(120).nullable().default(null) }),
  }, input => reply(() => mutateDay(store, input.date, state => {
    const view = { sessionId: input.sessionId, resourceUri: input.resourceUri, blueprintId: input.blueprintId };
    const nextState = commit({ ...state, views: { ...state.views, [input.variant]: view } },
      { id: crypto.randomUUID(), operation: "remember_card", recordId: input.sessionId });
    return { result: view, nextState };
  }), meta));
}
