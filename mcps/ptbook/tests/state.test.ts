import { describe, expect, it } from "bun:test";
import { DomainError, emptyDay, type DayState, type MealEstimate } from "../src/contracts.js";
import { findClips } from "../src/clips.js";
import { logMeal } from "../src/meals.js";
import { applyPlan, proposePlan } from "../src/plans.js";
import { logSet } from "../src/sets.js";
import { nutrition } from "../src/state.js";

const date = "2026-11-07";
const shortSleep = { date, totalMinutes: 230, deepMinutes: 68, remMinutes: 68,
  efficiencyPct: 93.51, stages: null };
function proposal() {
  return proposePlan({ date, state: emptyDay(date), focus: "lower",
    availableMinutes: 40, requestId: "proposal" }, shortSleep);
}
function activeDay(): DayState {
  const proposed = proposal();
  return applyPlan({ date, state: proposed.nextState, candidateId: proposed.result.candidate.id,
    decision: "apply", expectedRevision: 1, requestId: "apply" }).nextState;
}
const meal: MealEstimate = { id: "meal-1", label: "Sample meal", kcal: 600,
  macros: { carbG: 60, proteinG: 30, fatG: 20 }, confidence: "medium", assumptions: ["Sample portions"] };

describe("sleep-adjusted plan", () => {
  it("reduces accessory sets without applying the proposal", () => {
    // Given
    const state = emptyDay(date);
    // When
    const result = proposePlan({ date, state, focus: "lower", availableMinutes: 40,
      requestId: "short-sleep" }, shortSleep);
    // Then
    expect(result.result.candidate.rows.map(row => row.sets)).toEqual([3, 2, 2]);
    expect(result.nextState.plan).toBeNull();
    expect(state.revision).toBe(0);
    expect(result.result.candidate.rows[0]?.targetKg).toBeNull();
  });
  it("does not reduce volume when sleep is missing", () => {
    // Given
    const state = emptyDay(date);
    // When
    const result = proposePlan({ date, state, focus: "lower", availableMinutes: 40,
      requestId: "missing-sleep" }, null);
    // Then
    expect(result.result.candidate.rows.map(row => row.sets)).toEqual([3, 3, 3]);
  });
  it("keeps an absent active plan absent when proposal is rejected", () => {
    // Given
    const proposed = proposal();
    // When
    const result = applyPlan({ date, state: proposed.nextState, candidateId: proposed.result.candidate.id,
      decision: "keep", expectedRevision: 1, requestId: "keep" });
    // Then
    expect(result.nextState.plan).toBeNull();
    expect(result.nextState.pendingPlan).toBeNull();
  });
  it("rejects applying a stale revision", () => {
    // Given
    const proposed = proposal();
    // When / Then
    expect(() => applyPlan({ date, state: proposed.nextState, candidateId: proposed.result.candidate.id,
      decision: "apply", expectedRevision: 0, requestId: "stale" })).toThrow(DomainError);
  });
});

describe("set state", () => {
  const input = { date, planRowId: "squat", exercise: "스쿼트", kg: 60, reps: 8,
    rpe: 8, note: null, occurredAt: "2026-11-07T05:00:00Z", requestId: "set-1" };
  it("updates progress without changing targets", () => {
    // Given
    const state = activeDay();
    // When
    const result = logSet({ ...input, state });
    // Then
    expect(result.nextState.plan?.rows[0]?.completedSets).toBe(1);
    expect(result.nextState.plan?.rows[0]?.targetKg).toBeNull();
    expect(result.nextState.plan?.status).toBe("in_progress");
  });
  it("does not duplicate a replayed set", () => {
    // Given
    const recorded = logSet({ ...input, state: activeDay() });
    // When
    const result = logSet({ ...input, state: recorded.nextState });
    // Then
    expect(result.nextState.sets).toHaveLength(1);
    expect(result.nextState.revision).toBe(recorded.nextState.revision);
    expect(result.commitRequired).toBe(false);
  });
  it("rejects a set linked to a missing plan row", () => {
    // Given
    const state = activeDay();
    // When / Then
    expect(() => logSet({ ...input, state, planRowId: "missing" })).toThrow(DomainError);
  });
  it("rejects a record outside the KST ledger day", () => {
    // Given
    const state = activeDay();
    // When / Then
    expect(() => logSet({ ...input, state, occurredAt: "2026-11-07T15:00:00Z" })).toThrow(DomainError);
  });
  it("rejects the thirty-first set", () => {
    // Given
    const first = logSet({ ...input, state: activeDay() }).result.record;
    const state = { ...activeDay(), sets: Array.from({ length: 30 }, (_, i) => ({ ...first, id: `set-${i}` })) };
    // When / Then
    expect(() => logSet({ ...input, state, requestId: "overflow" })).toThrow(DomainError);
  });
});

describe("nutrition", () => {
  it("keeps pending estimates out of daily totals", () => {
    // Given
    const state = { ...emptyDay(date), pendingEstimates: [meal] };
    // When
    const result = nutrition(state);
    // Then
    expect(result.kcal).toBe(0);
    expect(result.macroEnergyPct).toBeNull();
    expect(result.targetKcal).toBeNull();
  });
  it("uses macro energy rather than gram ratios", () => {
    // Given
    const state = { ...emptyDay(date), meals: [{ ...meal, occurredAt: "2026-11-07T03:00:00Z", corrected: false }] };
    // When
    const result = nutrition(state);
    // Then
    expect(result.macroEnergyPct?.carb).toBeCloseTo(240 / 540 * 100);
    expect(result.macroEnergyPct?.fat).toBeCloseTo(180 / 540 * 100);
    expect(result.estimationDifferenceKcal).toBe(60);
  });
  it("corrects one meal without double counting", () => {
    // Given
    const state = { ...emptyDay(date), meals: [{ ...meal, occurredAt: "2026-11-07T03:00:00Z", corrected: false }] };
    // When
    const result = logMeal({ date, state, estimateId: meal.id, occurredAt: "2026-11-07T03:00:00Z",
      correction: { label: "Corrected", kcal: 450, macros: { carbG: 50, proteinG: 25, fatG: 15 } },
      requestId: "correct" });
    // Then
    expect(result.nextState.meals).toHaveLength(1);
    expect(result.result.daily.kcal).toBe(450);
    expect(result.result.meal.corrected).toBe(true);
  });
});

describe("reference search", () => {
  it("returns the supplied squat source at its original timestamp", () => {
    // Given / When
    const result = findClips("스쿼트 발목", 3);
    // Then
    expect(result.clips[0]?.timestampUrl).toBe("https://www.youtube.com/watch?v=l4ikp5rDWXw&t=81s");
    expect(result.indexedSegments).toBe(19);
  });
  it("returns empty results for an unknown exercise", () => {
    // Given / When
    const result = findClips("nonexistent-exercise", 3);
    // Then
    expect(result.clips).toEqual([]);
  });
});
