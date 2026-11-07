import { z } from "zod";

export const dateKey = z.iso.date();
export const id = z.string().min(1).max(80);
export const shortText = z.string().min(1).max(300);
export const isoTime = z.iso.datetime();
export const macros = z.strictObject({
  carbG: z.number().min(0).max(1000),
  proteinG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
});
export const planRow = z.strictObject({
  id,
  exercise: z.string().min(1).max(80),
  sets: z.number().int().min(1).max(5),
  targetKg: z.number().min(0).max(300).nullable(),
  targetReps: z.number().int().min(1).max(30),
  completedSets: z.number().int().min(0).max(30),
});
export const plan = z.strictObject({
  id,
  date: dateKey,
  revision: z.number().int().min(0),
  status: z.enum(["draft", "applied", "in_progress", "completed"]),
  rows: z.array(planRow).min(1).max(3),
  reason: shortText,
  sleepDate: dateKey.nullable(),
});
export const setRecord = z.strictObject({
  id,
  occurredAt: isoTime,
  planRowId: id.nullable(),
  exercise: z.string().min(1).max(80),
  kg: z.number().min(0).max(300),
  reps: z.number().int().min(1).max(30),
  rpe: z.number().min(1).max(10).nullable(),
  note: shortText.nullable(),
});
export const mealEstimate = z.strictObject({
  id,
  label: z.string().min(1).max(120),
  kcal: z.number().min(0).max(5000),
  macros,
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.array(shortText).max(8),
});
export const mealRecord = mealEstimate.extend({
  occurredAt: isoTime,
  corrected: z.boolean(),
});
export const dayState = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().min(0),
  date: dateKey,
  plan: plan.nullable(),
  pendingPlan: plan.nullable(),
  sets: z.array(setRecord).max(30),
  meals: z.array(mealRecord).max(8),
  pendingEstimates: z.array(mealEstimate).max(3),
  media: z.strictObject({
    squatKey: z.string().max(200).nullable(),
    mealKey: z.string().max(200).nullable(),
  }).default({ squatKey: null, mealKey: null }),
  views: z.partialRecord(z.enum(["plan-A", "sleep-B", "set-B", "video-A", "diet-A"]), z.strictObject({
    sessionId: id, resourceUri: z.string().max(1000), blueprintId: z.string().max(120).nullable(),
  })).default({}),
  requests: z.array(z.strictObject({
    id, operation: z.string().min(1).max(80), recordId: id.nullable(),
  })).max(64),
}).superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 48 * 1024) {
    ctx.addIssue({ code: "custom", message: "Day ledger exceeds 48 KiB." });
  }
  if ([value.plan, value.pendingPlan].some(p => p !== null && p.date !== value.date)) {
    ctx.addIssue({ code: "custom", message: "Plan date must match ledger date." });
  }
});
export const sleep = z.strictObject({
  date: dateKey,
  totalMinutes: z.number().min(0).max(1440).nullable(),
  deepMinutes: z.number().min(0).max(1440).nullable(),
  remMinutes: z.number().min(0).max(1440).nullable(),
  efficiencyPct: z.number().min(0).max(100).nullable(),
  stages: z.array(z.strictObject({
    start: isoTime,
    end: isoTime,
    stage: z.enum(["awake", "light", "deep", "rem", "unknown"]),
  })).nullable(),
});

export type DayState = z.infer<typeof dayState>;
export type Plan = z.infer<typeof plan>;
export type SetRecord = z.infer<typeof setRecord>;
export type MealEstimate = z.infer<typeof mealEstimate>;
export type MealRecord = z.infer<typeof mealRecord>;
export type Sleep = z.infer<typeof sleep>;
export type Macro = z.infer<typeof macros>;
export type DataMode = "live" | "imported" | "sample" | "estimated";
export type Identity = { readonly kind: "owner" | "sample"; readonly subject: string };
export class DomainError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "NOT_FOUND" | "NOT_CONNECTED" | "STALE_REVISION" |
      "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR" | "UNSUPPORTED_MEDIA" | "STORAGE_LIMIT",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function emptyDay(date: string): DayState {
  return { version: 1, revision: 0, date, plan: null, pendingPlan: null,
    sets: [], meals: [], pendingEstimates: [], requests: [], media: { squatKey: null, mealKey: null }, views: {} };
}
