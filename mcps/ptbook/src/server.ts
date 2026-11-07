import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dateKey, dayState, DomainError, shortText, type Identity } from "./contracts.js";
import type { Env } from "./env.js";
import { findClips } from "./clips.js";
import { setFeedback } from "./coach.js";
import { estimateInput, estimateMeal, logMeal, logMealInput } from "./meals.js";
import { applyInput, applyPlan, proposeInput, proposePlan } from "./plans.js";
import { reply, type Meta } from "./response.js";
import { logSet, logSetInput } from "./sets.js";
import { getSleep } from "./sleep.js";
import { checkDate, nutrition } from "./state.js";
import ownerSquatAnalysis from "../assets/owner-squat-analysis.json";

export function createServer(context: { readonly env: Env; readonly identity: Identity }) {
  const server = new McpServer({ name: "ptbook", version: "0.1.0" });
  const meta: Meta = { dataMode: "live", source: "stateless_compute",
    asOf: new Date().toISOString(), warnings: [], storage: "none" };
  const sleepMeta: Meta = { ...meta,
    dataMode: context.identity.kind === "owner" ? "imported" : "sample",
    source: context.identity.kind === "owner" ? "healine_d1_dump" : "illustrative_sleep_sample",
    asOf: context.identity.kind === "owner" ? context.env.PTBOOK_DUMP_AS_OF : meta.asOf,
    warnings: [context.identity.kind === "owner" ? "Imported snapshot, not live synchronization."
      : "Illustrative sample; not the owner's health records."],
  };
  const readInput = z.strictObject({ date: dateKey, state: dayState });
  server.registerTool("get_sleep", {
    description: "Read sleep for a KST date. Owner reads imported D1; other users get an explicitly labeled illustrative sample.",
    inputSchema: z.strictObject({ date: dateKey }),
  }, ({ date }) => reply(() => getSleep(date, context), sleepMeta));

  server.registerTool("get_workout_plan", {
    description: "Read active and pending plan from your saved home ledger. No server-side storage.",
    inputSchema: readInput,
  }, input => reply(() => {
    checkDate(input.state, input.date);
    return { plan: input.state.plan, pending: input.state.pendingPlan };
  }, meta));

  const propose = (input: z.infer<typeof proposeInput>) => reply(async () => {
    let sleep = null;
    try { sleep = await getSleep(input.date, context); }
    catch (error) {
      if (!(error instanceof DomainError && error.code === "NOT_FOUND")) throw error;
    }
    return proposePlan(input, sleep);
  }, sleepMeta);
  server.registerTool("propose_workout_plan", {
    description: "Propose a sleep-adjusted lower-body plan without replacing the active plan. Save nextState; wait for user apply/keep.",
    inputSchema: proposeInput,
  }, propose);
  server.registerTool("get_today_plan", {
    description: "Create today's sleep-adjusted plan proposal; requires current state and a unique requestId. Does not apply it.",
    inputSchema: proposeInput,
  }, propose);

  server.registerTool("apply_workout_plan", {
    description: "Apply or keep a pending plan only after the user's explicit action. expectedRevision is the current ledger revision.",
    inputSchema: applyInput,
  }, input => reply(() => applyPlan(input), meta));
  server.registerTool("log_set", {
    description: "Compute one new set and plan progress, idempotently by requestId. Persist nextState in your Guuey home before saying saved.",
    inputSchema: logSetInput,
  }, input => reply(() => logSet(input), meta));
  server.registerTool("get_recent_sets", {
    description: "Read most recent sets from the saved date ledger.",
    inputSchema: z.strictObject({
      date: dateKey, state: dayState, exercise: z.string().min(1).max(80).nullable(),
      limit: z.number().int().min(1).max(30),
    }),
  }, input => reply(() => {
    checkDate(input.state, input.date);
    return { records: input.state.sets.filter(record =>
      input.exercise === null || record.exercise === input.exercise)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, input.limit) };
  }, meta));
  server.registerTool("find_reference_clips", {
    description: "Search 19 verified public bodybuilding video segments. Query Korean exercise names or cues; return original timestamp links.",
    inputSchema: z.strictObject({ query: shortText, limit: z.number().int().min(1).max(3).default(3) }),
  }, input => reply(() => findClips(input.query, input.limit), {
    ...meta, dataMode: "imported", source: "youtube_public_captions",
    warnings: ["Auto-caption index; not a new video analysis."],
  }));
  server.registerTool("estimate_meal", {
    description: "Estimate meal nutrition from a food/portion description with A.X K2. salad-demo is a labeled text sample. Image analysis only if OpenAI is configured. Ask before log_meal.",
    inputSchema: estimateInput,
  }, input => reply(() => estimateMeal(input, context.env), {
    ...meta, dataMode: "estimated",
    source: context.env.PTBOOK_OPENAI_KEY && (input.sample_id || input.image_url)
      ? "openai_vision_public_sample" : "ax_k2_text_estimate",
    warnings: [context.env.PTBOOK_OPENAI_KEY && (input.sample_id || input.image_url)
      ? "Public salad sample, not your meal. Portions and nutrition are estimates."
      : "Text-based estimate, not image analysis. salad-demo is an illustrative meal description."],
  }));
  server.registerTool("log_meal", {
    description: "Record or correct a confirmed estimate. Same estimateId updates one meal, never adds duplicates. Save nextState.",
    inputSchema: logMealInput,
  }, input => reply(() => logMeal(input), meta));
  server.registerTool("get_daily_nutrition", {
    description: "Compute daily calories and 4/4/9 macro energy percentages from saved meals. No target is invented.",
    inputSchema: readInput.extend({ targetKcal: z.number().min(1).max(10000).nullable().optional() }),
  }, input => reply(() => {
    checkDate(input.state, input.date);
    return nutrition(input.state, input.targetKcal ?? null);
  }, meta));
  server.registerTool("set_feedback", {
    description: "Ask A.X K2 for concise Korean coaching from the user's text report. This does not inspect posture or save a set.",
    inputSchema: z.strictObject({ text: z.string().min(1).max(2000) }),
  }, input => reply(() => setFeedback(input.text, context.env), {
    ...meta, source: "skt/a.ll/A.X-K2-ADOT",
  }));
  server.registerTool("analyze_squat_video", {
    description: "Return the cached real OpenAI analysis of six frames from owner-squat-20261107. Owner-approved sample, not a new live analysis. No uploads or arbitrary URLs.",
    inputSchema: z.strictObject({ sample_id: z.string().min(1).max(80) }),
  }, ({ sample_id }) => reply(() => {
    if (sample_id !== "owner-squat-20261107") {
      throw new DomainError("UNSUPPORTED_MEDIA", "Available approved sample: owner-squat-20261107. New video uploads are not supported.");
    }
    return ownerSquatAnalysis;
  }, { ...meta, dataMode: "sample", source: "openai_vision_cached_owner_sample",
    asOf: ownerSquatAnalysis.analyzedAt,
    warnings: ["Owner-approved sample. Cached OpenAI frame analysis, not a new call or full-video posture assessment."] }));
  return server;
}
