import { Buffer } from "node:buffer";
import { z } from "zod";
import { DomainError, type Identity } from "./contracts.js";
import type { Env } from "./env.js";
import { authorizeObject } from "./media-auth.js";
import { mediaManifest } from "./media-store.js";
import { estimateMeal, logMeal } from "./meals.js";
import { nutrition } from "./state.js";
import { loadDay, mutateDay } from "./store.js";
import { visionText } from "./vision.js";

const observations = z.strictObject({
  observations: z.array(z.strictObject({
    atSec: z.number().min(0), cue: z.string().min(1).max(300),
    confidence: z.enum(["low", "medium", "high"]),
  })).max(3),
  nextAction: z.string().min(1).max(300),
  limitations: z.array(z.string().max(300)).max(6),
});

export async function analyzeMedia(
  objectKey: string,
  context: { readonly env: Env; readonly identity: Identity },
) {
  await authorizeObject(objectKey, context.identity);
  const object = await context.env.MEDIA.get(`${objectKey}/manifest.json`);
  if (!object) throw new DomainError("NOT_FOUND", "아직 업로드되지 않았어요. 먼저 파일을 올려주세요.");
  const manifest = mediaManifest.parse(await object.json());
  const cached = await context.env.MEDIA.get(`${objectKey}/analysis.json`);
  if (cached) {
    const data = z.record(z.string(), z.json()).parse(await cached.json());
    if (manifest.kind === "meal") {
      const state = await loadDay({ db: context.env.DB, identity: context.identity }, manifest.date);
      return { ...data, daily: nutrition(state), cached: true };
    }
    return { ...data, cached: true };
  }
  if (manifest.kind === "meal") {
    const original = await context.env.MEDIA.get(`${objectKey}/original`);
    if (!original) throw new DomainError("NOT_FOUND", "사진 파일을 찾지 못했어요.");
    const imageData = `data:${manifest.mime};base64,${Buffer.from(await original.arrayBuffer()).toString("base64")}`;
    const saved = await mutateDay({ db: context.env.DB, identity: context.identity }, manifest.date, async state => {
      const estimated = await estimateMeal({
        date: manifest.date, state, description: null, requestId: `image-${manifest.id}`,
      }, context.env, imageData);
      const existing = estimated.nextState.meals.find(meal => meal.id === estimated.result.id);
      if (existing) return { result: { meal: existing, daily: nutrition(estimated.nextState) }, nextState: estimated.nextState };
      return logMeal({
        date: manifest.date, state: estimated.nextState, estimateId: estimated.result.id,
        occurredAt: manifest.uploadedAt, correction: null, requestId: crypto.randomUUID(),
      });
    });
    await context.env.MEDIA.put(`${objectKey}/analysis.json`, JSON.stringify(saved.result));
    return saved.result;
  }
  if (manifest.frames.length !== 6) throw new DomainError("UNSUPPORTED_MEDIA", "영상에서 추출한 6장면이 필요해요.");
  const images = await Promise.all(manifest.frames.map(async frame => {
    const image = await context.env.MEDIA.get(frame.key);
    if (!image) throw new DomainError("NOT_FOUND", "분석할 장면을 찾지 못했어요.");
    return `data:image/jpeg;base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  }));
  const text = await visionText({
    images,
    prompt: `Selected squat frames, in order, at seconds ${manifest.frames.map(frame => frame.atSec).join(", ")}. Analyze only visible posture, not identity, health or precise angles. Return valid JSON only, with all keys double-quoted: observations (at most 3 objects with atSec from the supplied timestamps, cue as a short Korean observation, confidence low/medium/high), nextAction (one short Korean next-set action), limitations (array). Do not treat knees past toes as inherently wrong. Do not claim full video analysis. Clothing can obscure posture.`,
  }, context.env);
  let raw: unknown;
  try { raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("UPSTREAM_ERROR", "분석 결과를 정리하지 못했어요. 다시 시도해주세요.", true);
    throw error;
  }
  const parsed = observations.safeParse(raw);
  if (!parsed.success) throw new DomainError("UPSTREAM_ERROR", "분석 결과를 정리하지 못했어요. 다시 시도해주세요.", true);
  const data = {
    objectKey, analysisId: crypto.randomUUID(), analyzedAt: new Date().toISOString(),
    model: context.env.PTBOOK_VISION_MODEL, cached: false, frames: manifest.frames.map(({ atSec }) => ({ atSec })),
    observations: parsed.data.observations,
    coaching: { text: parsed.data.nextAction, basis: "frames", model: context.env.PTBOOK_VISION_MODEL },
    limitations: parsed.data.limitations,
  };
  await context.env.MEDIA.put(`${objectKey}/analysis.json`, JSON.stringify(data), { httpMetadata: { contentType: "application/json" } });
  return data;
}
