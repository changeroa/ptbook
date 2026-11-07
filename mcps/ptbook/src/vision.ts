import ky from "ky";
import { z } from "zod";
import { DomainError, mealEstimate } from "./contracts.js";
import type { Env } from "./env.js";
import { axText } from "./coach.js";

export const mealSampleUrl = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=768&q=80";
export const media = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("sample"), id: z.string().min(1).max(80) }),
  z.strictObject({ kind: z.literal("user_file"), id: z.string().min(1).max(80) }),
]);
const response = z.object({
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

export async function visionText(
  request: { readonly prompt: string; readonly images: readonly string[] },
  env: Env,
) {
  if (!env.PTBOOK_OPENAI_KEY) throw new DomainError("NOT_CONNECTED", "OpenAI vision key has not been configured.");
  const result = response.parse(await ky.post("https://api.openai.com/v1/responses", {
    timeout: 30_000, retry: 0,
    headers: { authorization: `Bearer ${env.PTBOOK_OPENAI_KEY}` },
    json: {
      model: env.PTBOOK_VISION_MODEL,
      input: [{ role: "user", content: [
        { type: "input_text", text: request.prompt },
        ...request.images.map(image_url => ({ type: "input_image", image_url, detail: "low" })),
      ] }],
      max_output_tokens: 1200,
    },
  }).json<unknown>());
  const text = result.output.flatMap(item => item.content ?? [])
    .filter(item => item.type === "output_text").map(item => item.text ?? "").join("");
  if (!text) throw new DomainError("UPSTREAM_ERROR", "Vision provider returned no analysis.", true);
  return text;
}

export async function estimateImage(
  input: { readonly sample_id?: string; readonly image_url?: string; readonly description: string | null },
  env: Env,
) {
  if (input.sample_id !== undefined && input.sample_id !== "salad-demo") {
    throw new DomainError("UNSUPPORTED_MEDIA", "Available meal sample: salad-demo.");
  }
  if (input.image_url !== undefined && input.image_url !== mealSampleUrl) {
    throw new DomainError("UNSUPPORTED_MEDIA", "Only the allowlisted public demo image URL is supported. Use manual correction for your meal.");
  }
  if (input.sample_id === undefined && input.image_url === undefined && input.description === null) {
    throw new DomainError("UNSUPPORTED_MEDIA", "Provide a meal description or select salad-demo. File upload is not implemented.");
  }
  const shape = '{"label":string,"kcal":number,"macros":{"carbG":number,"proteinG":number,"fatG":number},"confidence":"low"|"medium","assumptions":string[]}';
  if (!env.PTBOOK_OPENAI_KEY && input.image_url && input.description === null) {
    throw new DomainError("UNSUPPORTED_MEDIA", "Image analysis is unavailable. Describe the food and portions for a text estimate.");
  }
  const text = env.PTBOOK_OPENAI_KEY && (input.sample_id !== undefined || input.image_url !== undefined)
    ? await visionText({
      prompt: `한국어로 이 샘플 식사 사진을 분석하세요. 음식 중량은 알 수 없으므로 가정과 낮거나 중간 신뢰도를 명시하세요. JSON 객체만 출력: ${shape}. 각 가정은 300자 이하. 사용자 설명: ${input.description ?? "없음"}`,
      images: [mealSampleUrl],
    }, env)
    : await axText({
      system: '사진을 보지 않은 한국어 영양 추정 도우미입니다. 음식과 분량 텍스트로 추정하세요. 응답은 JSON.parse가 파싱 가능한 단일 JSON 객체여야 합니다. 모든 키(특히 macros, carbG, proteinG, fatG)를 반드시 쌍따옴표로 감싸세요. 마크다운과 타입 표기는 금지합니다. 필드: label(문자열, 120자 이하), kcal(숫자), macros(객체: carbG, proteinG, fatG는 숫자), confidence("low" 또는 "medium"), assumptions(최대 8개 문자열 배열, 항목당 300자 이하). label과 assumptions에 텍스트 기반 추정임을 명시하세요. 의학적 처방을 하지 마세요.',
      text: input.description ?? "체험용 식사 예시: 현미밥 150g, 구운 닭가슴살 100g, 생채소 100g, 올리브유 5g. 실제 사용자의 식사가 아닙니다.",
    }, env);
  let parsed: unknown;
  try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("UPSTREAM_ERROR", "Meal estimate was not valid JSON. Enter food and portion manually.", true);
    throw error;
  }
  const estimate = mealEstimate.omit({ id: true }).safeParse(parsed);
  if (!estimate.success) throw new DomainError("UPSTREAM_ERROR", "Meal estimate had invalid nutrition fields. Enter food and portion manually.", true);
  return { id: crypto.randomUUID(), ...estimate.data };
}
