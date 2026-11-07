import { z } from "zod";
import { DomainError, sleep, type Identity, type Sleep } from "./contracts.js";
import type { Env } from "./env.js";

const stage = z.object({
  start_time: z.iso.datetime({ offset: true }),
  end_time: z.iso.datetime({ offset: true }),
  stage: z.enum(["awake", "light", "deep", "rem", "unknown"]),
});
const rowSchema = z.object({
  totalMinutes: z.number().nullable(),
  deepMinutes: z.number().nullable(),
  remMinutes: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
  stagesJson: z.string().nullable(),
});

export async function getSleep(
  date: string,
  context: { readonly env: Env; readonly identity: Identity },
): Promise<Sleep> {
  if (context.identity.kind === "sample") {
    return { date, totalMinutes: 320, deepMinutes: 65, remMinutes: 70,
      efficiencyPct: 88, stages: null };
  }
  if (date < "2026-11-01" || date > "2026-11-07") {
    throw new DomainError("NOT_FOUND", "Imported sleep covers only 2026-11-01 through 2026-11-07 KST.");
  }
  if (!context.env.PTBOOK_HEALINE_SUB) {
    throw new DomainError("NOT_CONNECTED", "Owner's Healine mapping has not been configured.");
  }
  const raw = await context.env.DB.prepare(`
    SELECT s.sleep_total_duration_minutes AS totalMinutes,
           s.sleep_deep_minutes AS deepMinutes, s.sleep_rem_minutes AS remMinutes,
           s.sleep_efficiency_score AS efficiencyPct, s.sleep_stages AS stagesJson
    FROM sleep_details s JOIN event_record e ON e.id = s.record_id
    JOIN data_source d ON d.id = e.data_source_id
    WHERE d.user_id = ? AND date(e.end_datetime, '+9 hours') = ?
      AND e.category = 'sleep' AND (s.is_nap = 0 OR s.is_nap IS NULL)
    ORDER BY e.end_datetime DESC LIMIT 1
  `).bind(context.env.PTBOOK_HEALINE_SUB, date).first();
  if (!raw) throw new DomainError("NOT_FOUND", "There is no imported sleep record for this date.");
  const row = rowSchema.parse(raw);
  const stages = row.stagesJson === null ? null : z.array(stage).parse(JSON.parse(row.stagesJson)).map(item => ({
    start: new Date(item.start_time).toISOString(),
    end: new Date(item.end_time).toISOString(),
    stage: item.stage,
  }));
  return sleep.parse({ date, totalMinutes: row.totalMinutes, deepMinutes: row.deepMinutes,
    remMinutes: row.remMinutes, efficiencyPct: row.efficiencyPct, stages });
}
