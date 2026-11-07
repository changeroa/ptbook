import { createMcpHandler } from "agents/mcp/server";
import { authenticate } from "./auth.js";
import type { Env } from "./env.js";
import { createServer } from "./server.js";

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/health") {
      return Response.json({ service: "ptbook", version: "0.1.0", transport: "streamable-http" });
    }
    if (path !== "/mcp/") return new Response("Not found", { status: 404 });
    const identity = await authenticate(request, env);
    if (!identity) {
      return new Response("Unauthorized", { status: 401,
        headers: { "www-authenticate": 'Bearer realm="ptbook"' } });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 128 * 1024) {
      return new Response("Request too large", { status: 413 });
    }
    return createMcpHandler(() => createServer({ env, identity }), {
      route: "/mcp/", responseMode: "json", corsOptions: false,
    })(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
