import { HTTPError, TimeoutError } from "ky";
import { z } from "zod";
import uploadPage from "../assets/upload.html";
import { DomainError } from "./contracts.js";
import type { Env } from "./env.js";
import { analyzeMedia } from "./media-analysis.js";
import { verifyGrant } from "./media-auth.js";
import { storeUpload } from "./media-store.js";

export async function mediaRoute(request: Request, env: Env): Promise<Response> {
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff" };
  try {
    const grant = await verifyGrant(request, env);
    const path = new URL(request.url).pathname;
    if (path === "/upload" && request.method === "GET") {
      return new Response(uploadPage, { headers: { ...headers,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      } });
    }
    if (path === "/upload" && request.method === "POST") {
      return Response.json(await storeUpload(request, env, grant), { headers });
    }
    if (path === "/media/analyze" && request.method === "POST") {
      const input = z.strictObject({ objectKey: z.string().max(200) }).parse(await request.json());
      if (input.objectKey !== grant.key) throw new DomainError("NOT_FOUND", "이 링크에 연결된 파일이 아니에요.");
      const data = await analyzeMedia(input.objectKey, { env, identity: { kind: "sample", subject: grant.sub } });
      return Response.json({ ok: true, data }, { headers });
    }
    return new Response("Method not allowed", { status: 405, headers });
  } catch (error) {
    let message: string;
    let status = 400;
    if (error instanceof DomainError) {
      message = error.message;
      if (error.code === "NOT_CONNECTED") status = 401;
    } else if (error instanceof TimeoutError) {
      message = "분석이 25초를 넘겼어요. 다시 시도해주세요.";
      status = 504;
    } else if (error instanceof HTTPError) {
      message = "분석 서버가 응답하지 않았어요. 잠시 후 다시 시도해주세요.";
      status = 502;
    } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
      message = "파일과 입력값을 확인해주세요.";
    } else if (error instanceof Error) {
      message = "처리하지 못했어요. 다시 시도해주세요.";
      status = 500;
    } else throw error;
    if (request.method === "GET") return new Response(message, { status, headers });
    return Response.json({ ok: false, error: { message } }, { status, headers });
  }
}
