import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dateKey } from "./contracts.js";
import { analyzeMedia } from "./media-analysis.js";
import { mediaLink, OWNER_SAMPLE_KEY, type MediaContext } from "./media-auth.js";
import { reply, type Meta } from "./response.js";
import { loadDay } from "./store.js";

export async function mediaActions(context: MediaContext, date: string) {
  const state = await loadDay({ db: context.env.DB, identity: context.identity }, date);
  const upload = await mediaLink(context, { date, kind: "squat" });
  const sample = await mediaLink(context, { date, kind: "squat", objectKey: OWNER_SAMPLE_KEY });
  const analysis = state.media.squatKey
    ? await mediaLink(context, { date, kind: "squat", objectKey: state.media.squatKey }) : null;
  return {
    uploadUrl: upload.url,
    analysisUrl: analysis ? `${analysis.url}&auto=1` : null,
    sampleUrl: `${sample.url}&auto=1`,
    objectKey: state.media.squatKey,
  };
}

export function registerMediaTools(server: McpServer, context: MediaContext) {
  const meta: Meta = { dataMode: "live", source: "ptbook_private_r2",
    asOf: new Date().toISOString(), warnings: [], storage: "durable" };
  server.registerTool("create_upload_link", {
    description: "Issue a private 15-minute mobile upload link for a squat video or meal photo. Return the link immediately; do not wait for a file.",
    inputSchema: z.strictObject({ date: dateKey, kind: z.enum(["squat", "meal"]), objectKey: z.string().max(200).optional() }),
  }, input => reply(() => mediaLink(context, input), meta));
  server.registerTool("get_media_actions", {
    description: "Get signed upload, latest-video-analysis and owner-sample URLs for the set card. URLs directly open the working Worker page.",
    inputSchema: z.strictObject({ date: dateKey }),
  }, ({ date }) => reply(() => mediaActions(context, date), meta));
  server.registerTool("analyze_squat_video", {
    description: "Analyze your uploaded R2 objectKey with a 25s OpenAI limit. With no upload, return an upload link immediately. owner-squat-20261107 reads the approved sample cache.",
    inputSchema: z.strictObject({
      date: dateKey.optional(), objectKey: z.string().max(200).optional(),
      sample_id: z.literal("owner-squat-20261107").optional(),
    }),
  }, input => reply(async () => {
    const date = input.date ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const state = await loadDay({ db: context.env.DB, identity: context.identity }, date);
    const objectKey = input.objectKey ?? (input.sample_id ? OWNER_SAMPLE_KEY : state.media.squatKey);
    if (!objectKey) return { needsUpload: true, ...await mediaLink(context, { date, kind: "squat" }) };
    return analyzeMedia(objectKey, context);
  }, meta));
  server.registerTool("analyze_meal_photo", {
    description: "Analyze an uploaded meal photo and immediately record kcal/macros and daily totals. No confirmation step.",
    inputSchema: z.strictObject({ objectKey: z.string().max(200) }),
  }, ({ objectKey }) => reply(() => analyzeMedia(objectKey, context), { ...meta, dataMode: "estimated", source: "openai_vision" }));
}
