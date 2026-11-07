import { HTTPError, TimeoutError } from "ky";
import { z } from "zod";
import { DomainError, type DataMode } from "./contracts.js";

export type Meta = {
  readonly dataMode: DataMode;
  readonly source: string;
  readonly asOf: string;
  readonly warnings: readonly string[];
  readonly storage: "none" | "durable";
};

export async function reply<T>(work: () => T | Promise<T>, meta: Meta) {
  try {
    const body = { ok: true, data: await work(), meta };
    return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
  } catch (error) {
    let detail: DomainError;
    if (error instanceof DomainError) detail = error;
    else if (error instanceof z.ZodError) {
      detail = new DomainError("INVALID_INPUT", "The supplied data does not match the tool contract.");
    } else if (error instanceof TimeoutError) {
      detail = new DomainError("UPSTREAM_TIMEOUT", "Model request timed out.", true);
    } else if (error instanceof HTTPError) {
      detail = new DomainError("UPSTREAM_ERROR", `Model provider returned HTTP ${error.response.status}.`, true);
    } else if (error instanceof Error) {
      detail = new DomainError("UPSTREAM_ERROR", "The requested operation failed. No state was committed.", true);
    } else throw error;
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({
      ok: false, error: { code: detail.code, message: detail.message, retryable: detail.retryable },
    }) }] };
  }
}
