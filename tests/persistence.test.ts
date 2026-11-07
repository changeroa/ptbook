import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { emptyDay } from "../mcps/ptbook/src/contracts.js";
import { loadDay, saveDay, type StateDatabase } from "../mcps/ptbook/src/store.js";

const databases: Database[] = [];
function fixture() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`CREATE TABLE ptbook_day_state (
    subject TEXT NOT NULL, day TEXT NOT NULL, revision INTEGER NOT NULL,
    payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(subject, day))`);
  const db: StateDatabase = {
    prepare: sql => ({
      bind: (...values) => ({
        first: async () => sqlite.query(sql).get(...values),
        run: async () => ({ meta: { changes: sqlite.query(sql).run(...values).changes } }),
      }),
    }),
  };
  return { db, identity: { kind: "sample" as const, subject: "guest-a" } };
}
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("D1 day-state contract", () => {
  it("retains a committed day across independent request contexts", async () => {
    // Given
    const context = fixture();
    const state = { ...emptyDay("2026-11-07"), revision: 1 };
    await saveDay(context, { state, expectedRevision: 0 });
    // When
    const restored = await loadDay({ ...context }, "2026-11-07");
    // Then
    expect(restored).toEqual(state);
  });
  it("isolates another authenticated guest", async () => {
    // Given
    const context = fixture();
    await saveDay(context, { state: { ...emptyDay("2026-11-07"), revision: 1 }, expectedRevision: 0 });
    // When
    const restored = await loadDay({ ...context, identity: { kind: "sample", subject: "guest-b" } }, "2026-11-07");
    // Then
    expect(restored.revision).toBe(0);
  });
  it("refuses a stale overwrite", async () => {
    // Given
    const context = fixture();
    await saveDay(context, { state: { ...emptyDay("2026-11-07"), revision: 2 }, expectedRevision: 0 });
    // When / Then
    await expect(saveDay(context, {
      state: { ...emptyDay("2026-11-07"), revision: 3 }, expectedRevision: 1,
    })).rejects.toThrow("The day changed");
  });
  it("preserves records when replacing the same day", async () => {
    // Given
    const context = fixture();
    const state = { ...emptyDay("2026-11-07"), revision: 1 };
    await saveDay(context, { state, expectedRevision: 0 });
    // When
    await saveDay(context, {
      state: { ...state, revision: 2, media: { squatKey: "media/owner/one", mealKey: null } },
      expectedRevision: 1,
    });
    // Then
    expect((await loadDay(context, "2026-11-07")).media.squatKey).toBe("media/owner/one");
  });
});
