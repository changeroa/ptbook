import { z } from "zod";
import { dateKey, dayState, DomainError, id, isoTime, shortText, type SetRecord } from "./contracts.js";
import { updateProgress } from "./plans.js";
import { checkDate, checkOccurredAt, commit, replay } from "./state.js";

export const logSetInput = z.strictObject({
  date: dateKey, state: dayState, planRowId: id.nullable(),
  exercise: z.string().min(1).max(80), kg: z.number().min(0).max(300),
  reps: z.number().int().min(1).max(30), rpe: z.number().min(1).max(10).nullable(),
  note: shortText.nullable(), occurredAt: isoTime, requestId: id,
});

export function logSet(input: z.infer<typeof logSetInput>) {
  checkDate(input.state, input.date);
  checkOccurredAt(input.occurredAt, input.date);
  const previous = replay(input.state, { id: input.requestId, operation: "log_set" });
  if (previous) {
    const record = input.state.sets.find(item => item.id === previous.recordId);
    if (!record) throw new DomainError("INVALID_INPUT", "Replayed request has no corresponding set.");
    return { result: { record, plan: input.state.plan, coaching: null },
      nextState: input.state, commitRequired: false };
  }
  if (input.planRowId !== null) {
    const row = input.state.plan?.rows.find(item => item.id === input.planRowId);
    if (!row || row.exercise !== input.exercise) {
      throw new DomainError("INVALID_INPUT", "Set must reference an applied row of the same exercise.");
    }
  }
  const record: SetRecord = {
    id: crypto.randomUUID(), occurredAt: input.occurredAt, planRowId: input.planRowId,
    exercise: input.exercise, kg: input.kg, reps: input.reps, rpe: input.rpe, note: input.note,
  };
  const updated = { ...input.state, sets: [...input.state.sets, record] };
  const nextState = commit({ ...updated, plan: updateProgress(updated) }, {
    id: input.requestId, operation: "log_set", recordId: record.id,
  });
  return { result: { record, plan: nextState.plan, coaching: null }, nextState, commitRequired: true };
}
