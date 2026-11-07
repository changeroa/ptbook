import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import registry from "../ggui/registry.json";
import planBlueprint from "../ggui/blueprints/plan-a/ggui.ui.json";
import sleepBlueprint from "../ggui/blueprints/sleep-b/ggui.ui.json";
import setBlueprint from "../ggui/blueprints/set-b/ggui.ui.json";
import videoBlueprint from "../ggui/blueprints/video-a/ggui.ui.json";
import dietBlueprint from "../ggui/blueprints/diet-a/ggui.ui.json";

const blueprints = {
  "plan-A": planBlueprint, "sleep-B": sleepBlueprint, "set-B": setBlueprint,
  "video-A": videoBlueprint, "diet-A": dietBlueprint,
} as const;

export function createLedger() {
  return createSdkMcpServer({
    name: "ledger", version: "0.2.0",
    tools: [
      tool("read_blueprint", "Read an exact bundled GGUI contract. All workout and meal data is stored by ptbook MCP in D1, not home files.",
        { variant: z.enum(["plan-A", "sleep-B", "set-B", "video-A", "diet-A"]) },
        async ({ variant }) => ({
          content: [{ type: "text", text: JSON.stringify({
            variant, intent: registry.entries[variant].intent,
            blueprintDraft: { contract: blueprints[variant].contract, variance: registry.entries[variant].variance },
          }) }],
        })),
    ],
  });
}
