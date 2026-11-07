import { dayState, DomainError, type DayState, type MealRecord } from "./contracts.js";

export function checkDate(state: DayState, date: string): void {
  if (state.date !== date) throw new DomainError("INVALID_INPUT", "Ledger date does not match requested date.");
}

export function checkOccurredAt(occurredAt: string, date: string): void {
  const localDate = new Date(Date.parse(occurredAt) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (localDate !== date) throw new DomainError("INVALID_INPUT", "Record timestamp does not belong to this KST date.");
}

export function replay(state: DayState, request: { readonly id: string; readonly operation: string }) {
  const previous = state.requests.find(item => item.id === request.id);
  if (previous && previous.operation !== request.operation) {
    throw new DomainError("INVALID_INPUT", "Request ID is already used for another operation.");
  }
  return previous;
}

export function commit(
  state: DayState,
  request: { readonly id: string; readonly operation: string; readonly recordId: string | null },
): DayState {
  const nextState = { ...state, revision: state.revision + 1,
    requests: [...state.requests, request].slice(-64) };
  const parsed = dayState.safeParse(nextState);
  if (!parsed.success) throw new DomainError("STORAGE_LIMIT", "Day ledger exceeded its size or record limits.");
  return parsed.data;
}

export function nutrition(state: DayState, targetKcal: number | null = null) {
  const total = state.meals.reduce((sum, meal) => ({
    kcal: sum.kcal + meal.kcal,
    carbG: sum.carbG + meal.macros.carbG,
    proteinG: sum.proteinG + meal.macros.proteinG,
    fatG: sum.fatG + meal.macros.fatG,
  }), { kcal: 0, carbG: 0, proteinG: 0, fatG: 0 });
  const macroKcal = total.carbG * 4 + total.proteinG * 4 + total.fatG * 9;
  return {
    date: state.date, meals: state.meals, kcal: total.kcal, targetKcal,
    macros: { carbG: total.carbG, proteinG: total.proteinG, fatG: total.fatG },
    macroEnergyPct: macroKcal === 0 ? null : {
      carb: total.carbG * 4 / macroKcal * 100,
      protein: total.proteinG * 4 / macroKcal * 100,
      fat: total.fatG * 9 / macroKcal * 100,
    },
    macroKcal,
    estimationDifferenceKcal: total.kcal - macroKcal,
  };
}

export function upsertMeal(state: DayState, meal: MealRecord): DayState {
  const found = state.meals.some(item => item.id === meal.id);
  return { ...state,
    meals: found ? state.meals.map(item => item.id === meal.id ? meal : item) : [...state.meals, meal],
    pendingEstimates: state.pendingEstimates.filter(item => item.id !== meal.id),
  };
}
