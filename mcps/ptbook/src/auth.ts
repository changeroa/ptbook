import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { Identity } from "./contracts.js";
import type { Env } from "./env.js";

const keys = createRemoteJWKSet(new URL("https://id.guuey.com/.well-known/jwks.json"));

export async function authenticate(request: Request, env: Env): Promise<Identity | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  // The operator credential is for private curl verification, never Guuey guest traffic.
  if (env.PTBOOK_ADMIN_TOKEN && token === env.PTBOOK_ADMIN_TOKEN) {
    return { kind: "owner", subject: "operator" };
  }
  if (!env.PTBOOK_APP_ID) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      issuer: "https://id.guuey.com",
      audience: `${new URL(request.url).origin}/mcp/`,
      requiredClaims: ["exp", "sub", "app_id"],
    });
    if (payload["app_id"] !== env.PTBOOK_APP_ID || !payload.sub) return null;
    const owner = payload.sub === env.PTBOOK_OWNER_SUB &&
      payload["issuerAuthMode"] === "native-pool";
    return { kind: owner ? "owner" : "sample", subject: payload.sub };
  } catch (error) {
    if (error instanceof errors.JOSEError || error instanceof TypeError) return null;
    throw error;
  }
}
