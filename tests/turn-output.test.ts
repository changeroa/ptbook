import { describe, expect, it } from "bun:test";
import { terminalReply } from "../src/turn-output.js";

describe("native terminal reply", () => {
  it("preserves a successful reply", () => {
    expect(terminalReply({ subtype: "success", result: "done" }))
      .toEqual({ text: "done", fallback: false, forwardNative: true });
  });
  it("supplies visible text for an empty successful turn", () => {
    const reply = terminalReply({ subtype: "success", result: " \n " });
    expect(reply.text.trim().length).toBeGreaterThan(0);
    expect(reply.fallback).toBe(true);
    expect(reply.forwardNative).toBe(true);
  });
  it("does not forward an SDK error terminal that can discard the reply", () => {
    const reply = terminalReply({ subtype: "error_during_execution" });
    expect(reply.text.trim().length).toBeGreaterThan(0);
    expect(reply.fallback).toBe(true);
    expect(reply.forwardNative).toBe(false);
  });
});
