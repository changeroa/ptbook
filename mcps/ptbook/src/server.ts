import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dateKey, shortText, type Identity } from "./contracts.js";
import type { Env } from "./env.js";
import { findClips } from "./clips.js";
import { setFeedback } from "./coach.js";
import { registerDayTools } from "./day-tools.js";
import { reply, type Meta } from "./response.js";
import { getSleep } from "./sleep.js";
import { registerMediaTools } from "./media-tools.js";

export function createServer(context: { readonly env: Env; readonly identity: Identity; readonly origin: string }) {
  const server = new McpServer({ name: "ptbook", version: "0.2.0" });
  const meta: Meta = { dataMode: "live", source: "ptbook",
    asOf: new Date().toISOString(), warnings: [], storage: "none" };
  registerDayTools(server, context);
  registerMediaTools(server, context);
  server.registerTool("get_sleep", {
    description: "Read imported owner sleep or separate demo sleep for other users.",
    inputSchema: z.strictObject({ date: dateKey }),
  }, ({ date }) => reply(() => getSleep(date, context), {
    ...meta, dataMode: context.identity.kind === "owner" ? "imported" : "sample",
    source: context.identity.kind === "owner" ? "healine_d1_dump" : "illustrative_sleep_sample",
    asOf: context.identity.kind === "owner" ? context.env.PTBOOK_DUMP_AS_OF : meta.asOf,
  }));
  server.registerTool("find_reference_clips", {
    description: "Search 19 real bodybuilding video segments and return original timestamp links.",
    inputSchema: z.strictObject({ query: shortText, limit: z.number().int().min(1).max(3).default(1) }),
  }, input => reply(() => findClips(input.query, input.limit), { ...meta, dataMode: "imported", source: "youtube_public_captions" }));
  server.registerTool("set_feedback", {
    description: "Get one short next-set action from A.X K2 using the reported set.",
    inputSchema: z.strictObject({ text: z.string().min(1).max(2000) }),
  }, input => reply(() => setFeedback(input.text, context.env), { ...meta, source: "skt/a.ll/A.X-K2-ADOT" }));
  return server;
}
