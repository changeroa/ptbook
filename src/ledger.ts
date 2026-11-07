import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { dateKey, dayState, DomainError, emptyDay, type DayState } from "../mcps/ptbook/src/contracts.js";

export async function readDay(home: string, date: string): Promise<DayState> {
  const key = dateKey.parse(date);
  try {
    const state = dayState.parse(JSON.parse(await readFile(join(home, "ptbook", "days", `${key}.json`), "utf8")));
    if (state.date !== key) throw new DomainError("INVALID_INPUT", "Saved ledger date is inconsistent.");
    return state;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyDay(key);
    throw error;
  }
}

export async function saveDay(home: string, input: { readonly state: DayState; readonly expectedRevision: number }) {
  const state = dayState.parse(input.state);
  const previous = await readDay(home, state.date);
  if (previous.revision !== input.expectedRevision || state.revision !== previous.revision + 1) {
    throw new DomainError("STALE_REVISION", "Read the ledger again before saving. Expected one revision increment.");
  }
  const directory = join(home, "ptbook", "days");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${state.date}.json`);
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  const saved = await readDay(home, state.date);
  if (saved.revision !== state.revision || JSON.stringify(saved) !== JSON.stringify(state)) {
    throw new DomainError("STALE_REVISION", "Ledger readback did not match the requested save.");
  }
  return saved;
}

export function createLedger(home: string) {
  const respond = async (work: () => Promise<DayState>) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, state: await work(),
        storage: "Guuey per-user home; durable for signed-in users, temporary for guests" }) }] };
    } catch (error) {
      if (error instanceof DomainError || error instanceof z.ZodError) {
        return { isError: true, content: [{ type: "text" as const,
          text: JSON.stringify({ ok: false, error: error.message }) }] };
      }
      throw error;
    }
  };
  return createSdkMcpServer({
    name: "ledger",
    version: "0.1.0",
    tools: [
      tool("read_day", "Read your own KST-date plan/set/meal ledger from Guuey home. Always read before computing mutations.",
        { date: dateKey }, ({ date }) => respond(() => readDay(home, date))),
      tool("save_day", "Atomically save a Worker nextState, then read it back. One active writer. Guests have temporary storage.",
        { state: dayState, expectedRevision: z.number().int().min(0) },
        input => respond(() => saveDay(home, input))),
    ],
  });
}
