import { z } from "zod";
import { dateKey, dayState, DomainError, id, isoTime, macros, shortText } from "./contracts.js";
import type { Env } from "./env.js";
import { checkDate, checkOccurredAt, commit, nutrition, replay, upsertMeal } from "./state.js";
import { estimateImage } from "./vision.js";

export const estimateInput = z.strictObject({
  date: dateKey, state: dayState, sample_id: z.string().min(1).max(80).optional(),
  image_url: z.url().optional(), description: shortText.nullable(), requestId: id,
});
export const logMealInput = z.strictObject({
  date: dateKey, state: dayState, estimateId: id, occurredAt: isoTime,
  correction: z.strictObject({
    label: z.string().min(1).max(120), kcal: z.number().min(0).max(5000), macros,
  }).nullable(),
  targetKcal: z.number().min(1).max(10000).nullable().optional(),
  requestId: id,
});

export async function estimateMeal(input: z.infer<typeof estimateInput>, env: Env) {
  checkDate(input.state, input.date);
  const previous = replay(input.state, { id: input.requestId, operation: "estimate_meal" });
  if (previous) {
    const estimate = [...input.state.pendingEstimates, ...input.state.meals]
      .find(item => item.id === previous.recordId);
    if (!estimate) throw new DomainError("INVALID_INPUT", "Replayed request has no meal estimate.");
    return { result: estimate, nextState: input.state, commitRequired: false };
  }
  if (input.state.pendingEstimates.length >= 3) throw new DomainError("STORAGE_LIMIT", "Confirm a pending meal before estimating another.");
  const estimate = await estimateImage({
    ...(input.sample_id === undefined ? {} : { sample_id: input.sample_id }),
    ...(input.image_url === undefined ? {} : { image_url: input.image_url }),
    description: input.description,
  }, env);
  const nextState = commit({ ...input.state, pendingEstimates: [...input.state.pendingEstimates, estimate] }, {
    id: input.requestId, operation: "estimate_meal", recordId: estimate.id,
  });
  return { result: estimate, nextState, commitRequired: true };
}

export function logMeal(input: z.infer<typeof logMealInput>) {
  checkDate(input.state, input.date);
  checkOccurredAt(input.occurredAt, input.date);
  const previous = replay(input.state, { id: input.requestId, operation: "log_meal" });
  if (previous) {
    const meal = input.state.meals.find(item => item.id === previous.recordId);
    if (!meal) throw new DomainError("INVALID_INPUT", "Replayed request has no recorded meal.");
    return { result: { meal, daily: nutrition(input.state, input.targetKcal ?? null) },
      nextState: input.state, commitRequired: false };
  }
  const estimate = [...input.state.pendingEstimates, ...input.state.meals]
    .find(item => item.id === input.estimateId);
  if (!estimate) throw new DomainError("NOT_FOUND", "Read the day's pending estimates before logging this meal.");
  const meal = { ...estimate, ...(input.correction ?? {}),
    occurredAt: input.occurredAt, corrected: input.correction !== null };
  const nextState = commit(upsertMeal(input.state, meal), {
    id: input.requestId, operation: "log_meal", recordId: meal.id,
  });
  return { result: { meal, daily: nutrition(nextState, input.targetKcal ?? null) },
    nextState, commitRequired: true };
}
