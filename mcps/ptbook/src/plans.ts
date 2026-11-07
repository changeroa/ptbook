import { z } from "zod";
import { dateKey, dayState, DomainError, id, type DayState, type Plan, type Sleep } from "./contracts.js";
import { checkDate, commit, replay } from "./state.js";

export const proposeInput = z.strictObject({
  date: dateKey, state: dayState, focus: z.literal("lower"),
  availableMinutes: z.number().int().min(10).max(90), requestId: id,
});
export const applyInput = z.strictObject({
  date: dateKey, state: dayState, candidateId: id, decision: z.enum(["apply", "keep"]),
  expectedRevision: z.number().int().min(0), requestId: id,
});

export function proposePlan(input: z.infer<typeof proposeInput>, sleep: Sleep | null) {
  checkDate(input.state, input.date);
  const oldRequest = replay(input.state, { id: input.requestId, operation: "propose_workout_plan" });
  if (oldRequest) {
    const candidate = input.state.pendingPlan;
    if (!candidate || candidate.id !== oldRequest.recordId) {
      throw new DomainError("STALE_REVISION", "That proposal is no longer pending. Read the current plan.");
    }
    return { result: { candidate, previous: input.state.plan }, nextState: input.state, commitRequired: false };
  }
  const lowerVolume = (sleep?.totalMinutes !== null && sleep?.totalMinutes !== undefined &&
    sleep.totalMinutes < 360) || (sleep?.efficiencyPct !== null &&
    sleep?.efficiencyPct !== undefined && sleep.efficiencyPct < 85);
  const baseRows = input.state.plan?.rows ?? [
    { id: "squat", exercise: "스쿼트", sets: 3, targetKg: null, targetReps: 8, completedSets: 0 },
    { id: "leg-curl", exercise: "레그 컬", sets: 3, targetKg: null, targetReps: 10, completedSets: 0 },
    { id: "calf-raise", exercise: "카프 레이즈", sets: 3, targetKg: 0, targetReps: 15, completedSets: 0 },
  ];
  const candidate: Plan = {
    id: crypto.randomUUID(), date: input.date, revision: input.state.revision + 1, status: "draft",
    rows: baseRows.map((row, index) => ({
      ...row,
      sets: lowerVolume && index > 0 ? Math.max(1, row.sets - 1) : row.sets,
      completedSets: input.state.sets.filter(record => record.planRowId === row.id).length,
    })),
    reason: lowerVolume ? `수면 ${sleep?.totalMinutes ?? "미측정"}분을 참고해 보조운동을 각 1세트 줄이는 제안입니다. 데모 규칙이며 의학적 처방이 아닙니다.`
      : "하체 3종 기본 제안입니다. 미확정 중량은 직접 정해주세요.",
    sleepDate: sleep?.date ?? null,
  };
  const nextState = commit({ ...input.state, pendingPlan: candidate }, {
    id: input.requestId, operation: "propose_workout_plan", recordId: candidate.id,
  });
  return { result: { candidate, previous: input.state.plan }, nextState, commitRequired: true };
}

export function applyPlan(input: z.infer<typeof applyInput>) {
  checkDate(input.state, input.date);
  const previous = replay(input.state, { id: input.requestId, operation: "apply_workout_plan" });
  if (previous || (input.decision === "apply" && input.state.plan?.id === input.candidateId)) {
    return { result: { plan: input.state.plan, applied: input.state.plan?.id === input.candidateId },
      nextState: input.state, commitRequired: false };
  }
  const candidate = input.state.pendingPlan;
  if (input.expectedRevision !== input.state.revision || candidate?.id !== input.candidateId) {
    throw new DomainError("STALE_REVISION", "Plan changed. Read and confirm the current proposal.");
  }
  const active: Plan | null = input.decision === "apply"
    ? { ...candidate, status: "applied", revision: input.state.revision + 1 }
    : input.state.plan;
  const nextState = commit({ ...input.state, plan: active, pendingPlan: null }, {
    id: input.requestId, operation: "apply_workout_plan", recordId: input.candidateId,
  });
  return { result: { plan: active, applied: input.decision === "apply" }, nextState, commitRequired: true };
}

export function updateProgress(state: DayState): Plan | null {
  if (!state.plan) return null;
  const rows = state.plan.rows.map(row => ({
    ...row, completedSets: state.sets.filter(record => record.planRowId === row.id).length,
  }));
  return { ...state.plan, rows, revision: state.revision + 1,
    status: rows.every(row => row.completedSets >= row.sets) ? "completed"
      : rows.some(row => row.completedSets > 0) ? "in_progress" : "applied" };
}
