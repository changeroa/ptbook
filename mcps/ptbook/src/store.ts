import { z } from "zod";
import { dayState, DomainError, emptyDay, type DayState, type Identity } from "./contracts.js";

export type StateDatabase = {
  prepare(sql: string): {
    bind(...values: (string | number)[]): {
      first(): Promise<unknown>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
};
export type StoreContext = { readonly db: StateDatabase; readonly identity: Identity };
const storedRow = z.object({ payload: z.string(), revision: z.number().int() });

export async function loadDay(context: StoreContext, date: string): Promise<DayState> {
  const row = await context.db.prepare(
    "SELECT payload, revision FROM ptbook_day_state WHERE subject = ? AND day = ?",
  ).bind(context.identity.subject, date).first();
  if (row === null) return emptyDay(date);
  const parsed = storedRow.parse(row);
  const state = dayState.parse(JSON.parse(parsed.payload));
  if (state.date !== date || state.revision !== parsed.revision) {
    throw new DomainError("INVALID_INPUT", "Stored day state is inconsistent.");
  }
  return state;
}

export async function saveDay(
  context: StoreContext,
  change: { readonly state: DayState; readonly expectedRevision: number },
) {
  if (change.state.revision === change.expectedRevision) return;
  const result = await context.db.prepare(`
    INSERT INTO ptbook_day_state (subject, day, revision, payload, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(subject, day) DO UPDATE SET
      revision = excluded.revision, payload = excluded.payload, updated_at = excluded.updated_at
    WHERE ptbook_day_state.revision = ?
  `).bind(context.identity.subject, change.state.date, change.state.revision,
    JSON.stringify(change.state), new Date().toISOString(), change.expectedRevision).run();
  if (result.meta.changes !== 1) {
    throw new DomainError("STALE_REVISION", "The day changed. Read it again before retrying.", true);
  }
}

export async function mutateDay<T>(
  context: StoreContext,
  date: string,
  compute: (state: DayState) => Promise<{ result: T; nextState: DayState }> | { result: T; nextState: DayState },
) {
  const state = await loadDay(context, date);
  const computed = await compute(state);
  await saveDay(context, { state: computed.nextState, expectedRevision: state.revision });
  return { result: computed.result, state: computed.nextState, saved: true };
}
