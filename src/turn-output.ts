export function terminalReply(message: { readonly subtype: string; readonly result?: string }) {
  const failed = message.subtype !== "success";
  const text = failed ? "" : message.result ?? "";
  return {
    text: text.trim() ? text : "결과를 표시하지 못했어요. 다시 조회해 주세요.",
    fallback: !text.trim(),
    forwardNative: !failed,
  };
}
