import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyDay } from "../mcps/ptbook/src/contracts.js";
import { readDay, saveDay } from "../src/ledger.js";

const homes: string[] = [];
async function home() {
  const path = await mkdtemp(join(tmpdir(), "ptbook-ledger-"));
  homes.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(homes.splice(0).map(path => rm(path, { recursive: true })));
});

describe("Guuey home ledger", () => {
  it("reads the committed ledger through a fresh read", async () => {
    // Given
    const root = await home();
    const state = { ...emptyDay("2026-11-07"), revision: 1 };
    await saveDay(root, { state, expectedRevision: 0 });
    // When
    const result = await readDay(root, "2026-11-07");
    // Then
    expect(result).toEqual(state);
  });
  it("keeps another user's home empty", async () => {
    // Given
    const first = await home();
    const second = await home();
    await saveDay(first, { state: { ...emptyDay("2026-11-07"), revision: 1 }, expectedRevision: 0 });
    // When
    const result = await readDay(second, "2026-11-07");
    // Then
    expect(result.revision).toBe(0);
  });
  it("refuses a stale write instead of overwriting a newer ledger", async () => {
    // Given
    const root = await home();
    const state = { ...emptyDay("2026-11-07"), revision: 1 };
    await saveDay(root, { state, expectedRevision: 0 });
    // When / Then
    await expect(saveDay(root, { state, expectedRevision: 0 })).rejects.toThrow();
  });
  it("refuses a path in place of a date", async () => {
    // Given
    const root = await home();
    // When / Then
    await expect(readDay(root, "../../secret")).rejects.toThrow();
  });
});
