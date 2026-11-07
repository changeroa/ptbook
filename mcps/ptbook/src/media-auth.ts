import { errors, jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { dateKey, DomainError, type Identity } from "./contracts.js";
import type { Env } from "./env.js";

export const OWNER_SAMPLE_KEY = "samples/owner-squat-20261107";
export type MediaContext = { readonly env: Env; readonly identity: Identity; readonly origin: string };
export const grantSchema = z.object({
  sub: z.string().min(1), key: z.string().max(200), date: dateKey,
  kind: z.enum(["squat", "meal"]), purpose: z.enum(["upload", "analyze"]),
  exp: z.number(), jti: z.string().uuid(),
});
export type MediaGrant = z.infer<typeof grantSchema>;

export async function subjectPrefix(subject: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
  return "media/" + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32) + "/";
}

export async function authorizeObject(key: string, identity: Identity) {
  if (key === OWNER_SAMPLE_KEY) return;
  const prefix = await subjectPrefix(identity.subject);
  if (!key.startsWith(prefix) || !z.string().uuid().safeParse(key.slice(prefix.length)).success) {
    throw new DomainError("NOT_FOUND", "이 영상은 현재 사용자에게 연결되어 있지 않아요.");
  }
}

export async function mediaLink(
  context: MediaContext,
  input: { readonly date: string; readonly kind: "squat" | "meal"; readonly objectKey?: string | undefined },
) {
  if (!context.env.PTBOOK_MEDIA_SIGNING_KEY) throw new DomainError("NOT_CONNECTED", "업로드 연결을 준비하고 있어요.");
  const mediaId = crypto.randomUUID();
  if (input.objectKey) await authorizeObject(input.objectKey, context.identity);
  const key = input.objectKey ?? (await subjectPrefix(context.identity.subject)) + mediaId;
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  const token = await new SignJWT({
    key, date: input.date, kind: input.kind, purpose: input.objectKey ? "analyze" : "upload",
  }).setProtectedHeader({ alg: "HS256" }).setIssuer("ptbook").setAudience("ptbook-media")
    .setSubject(context.identity.subject).setJti(mediaId).setIssuedAt().setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(context.env.PTBOOK_MEDIA_SIGNING_KEY));
  const query = new URLSearchParams({ token, kind: input.kind });
  if (input.objectKey) { query.set("objectKey", key); query.set("ready", "1"); }
  return { url: `${context.origin}/upload?${query}`, objectKey: key, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export async function verifyGrant(request: Request, env: Env): Promise<MediaGrant> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !env.PTBOOK_MEDIA_SIGNING_KEY) throw new DomainError("NOT_CONNECTED", "채팅에서 새 업로드 링크를 받아주세요.");
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.PTBOOK_MEDIA_SIGNING_KEY), {
      algorithms: ["HS256"], issuer: "ptbook", audience: "ptbook-media",
      requiredClaims: ["sub", "exp", "jti"],
    });
    return grantSchema.parse(payload);
  } catch (error) {
    if (error instanceof errors.JOSEError || error instanceof z.ZodError) {
      throw new DomainError("NOT_CONNECTED", "링크가 만료됐어요. 채팅에서 새 링크를 받아주세요.");
    }
    throw error;
  }
}
