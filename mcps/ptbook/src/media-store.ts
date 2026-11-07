import { z } from "zod";
import { dateKey, DomainError, isoTime } from "./contracts.js";
import type { Env } from "./env.js";
import type { MediaGrant } from "./media-auth.js";
import { commit } from "./state.js";
import { mutateDay } from "./store.js";

export const mediaManifest = z.strictObject({
  version: z.literal(1), id: z.string().uuid(), key: z.string().max(200),
  subject: z.string(), date: dateKey, kind: z.enum(["squat", "meal"]),
  fileName: z.string().max(200), mime: z.string(), size: z.number().int().positive(),
  duration: z.number().positive().nullable(), uploadedAt: isoTime,
  frames: z.array(z.strictObject({ key: z.string().max(250), atSec: z.number().min(0) })).max(6),
});
export type MediaManifest = z.infer<typeof mediaManifest>;

export async function storeUpload(request: Request, env: Env, grant: MediaGrant) {
  if (grant.purpose !== "upload") throw new DomainError("INVALID_INPUT", "이 링크는 분석 전용이에요.");
  const existing = await env.MEDIA.get(`${grant.key}/manifest.json`);
  if (existing) {
    const stored = mediaManifest.parse(await existing.json());
    return { ok: true, objectKey: grant.key, kind: stored.kind, uploadedAt: stored.uploadedAt };
  }
  if (Number(request.headers.get("content-length") ?? 0) > 56 * 1024 * 1024) {
    throw new DomainError("STORAGE_LIMIT", "영상은 50MB 이하로 올려주세요.");
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new DomainError("INVALID_INPUT", "파일을 선택해주세요.");
  const maxBytes = (grant.kind === "squat" ? 50 : 10) * 1024 * 1024;
  if (file.size === 0 || file.size > maxBytes) throw new DomainError("STORAGE_LIMIT", "파일 용량을 확인해주세요.");
  const allowed = grant.kind === "squat"
    ? ["video/mp4", "video/quicktime"] : ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new DomainError("UNSUPPORTED_MEDIA", "MP4/MOV 영상 또는 JPG/PNG/WebP 사진을 선택해주세요.");
  const duration = grant.kind === "squat" ? z.number().positive().finite().parse(Number(form.get("duration"))) : null;
  const frames: { key: string; atSec: number }[] = [];
  const files: { key: string; file: File }[] = [];
  if (grant.kind === "squat") {
    const times = z.array(z.number().min(0)).length(6).parse(JSON.parse(String(form.get("frameTimes"))));
    for (const [index, atSec] of times.entries()) {
      const frame = form.get(`frame${index}`);
      if (!(frame instanceof File) || frame.type !== "image/jpeg" || frame.size === 0 || frame.size > 1024 * 1024) {
        throw new DomainError("UNSUPPORTED_MEDIA", "영상에서 6장면을 추출하지 못했어요. 다시 선택해주세요.");
      }
      if (duration === null || atSec > duration) throw new DomainError("INVALID_INPUT", "프레임 시간이 영상 길이를 벗어났어요.");
      const key = `${grant.key}/frame-${index}.jpg`;
      frames.push({ key, atSec });
      files.push({ key, file: frame });
    }
  }
  const uploadedAt = new Date().toISOString();
  const manifest: MediaManifest = {
    version: 1, id: grant.jti, key: grant.key, subject: grant.sub, date: grant.date, kind: grant.kind,
    fileName: file.name.slice(0, 200), mime: file.type, size: file.size, duration, uploadedAt, frames,
  };
  await env.MEDIA.put(`${grant.key}/original`, file, { httpMetadata: { contentType: file.type } });
  await Promise.all(files.map(frame => env.MEDIA.put(frame.key, frame.file, { httpMetadata: { contentType: "image/jpeg" } })));
  await env.MEDIA.put(`${grant.key}/manifest.json`, JSON.stringify(manifest), { httpMetadata: { contentType: "application/json" } });
  await mutateDay({ db: env.DB, identity: { kind: "sample", subject: grant.sub } }, grant.date, state => {
    const media = { ...state.media, [grant.kind === "squat" ? "squatKey" : "mealKey"]: grant.key };
    return { result: media, nextState: commit({ ...state, media }, {
      id: grant.jti, operation: "upload_media", recordId: grant.key,
    }) };
  });
  return { ok: true, objectKey: grant.key, kind: grant.kind, uploadedAt };
}
