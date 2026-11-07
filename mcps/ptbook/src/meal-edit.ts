import { z } from "zod";
import { DomainError, id, macros } from "./contracts.js";
import type { Env } from "./env.js";
import { verifyGrant } from "./media-auth.js";
import { logMeal } from "./meals.js";
import { loadDay, mutateDay } from "./store.js";
import { nutrition } from "./state.js";

export async function mealEditRoute(request: Request, env: Env) {
  const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type", "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const grant = await verifyGrant(request, env);
    if (grant.purpose !== "edit") throw new DomainError("INVALID_INPUT", "이 링크는 식사 수정용이 아니에요.");
    const store = { db: env.DB, identity: { kind: "sample" as const, subject: grant.sub } };
    if (request.method === "GET") {
      const state = await loadDay(store, grant.date);
      const meal = state.meals.find(item => item.id === grant.key);
      if (!meal) throw new DomainError("NOT_FOUND", "식사 기록을 찾지 못했어요.");
      return Response.json({ ok: true, meal, daily: nutrition(state) }, { headers });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
    const input = z.strictObject({ label: z.string().min(1).max(120), kcal: z.number().min(0).max(5000),
      macros, requestId: id }).parse(await request.json());
    const saved = await mutateDay(store, grant.date, state => {
      const meal = state.meals.find(item => item.id === grant.key);
      if (!meal) throw new DomainError("NOT_FOUND", "식사 기록을 찾지 못했어요.");
      return logMeal({ date: grant.date, state, estimateId: meal.id, occurredAt: meal.occurredAt,
        correction: { label: input.label, kcal: input.kcal, macros: input.macros }, requestId: input.requestId });
    });
    return Response.json({ ok: true, ...saved.result }, { headers });
  } catch (error) {
    const message = error instanceof DomainError ? error.message : "수정하지 못했어요. 다시 확인해주세요.";
    if (!(error instanceof Error)) throw error;
    return Response.json({ ok: false, error: { message } }, { status: 400, headers });
  }
}
