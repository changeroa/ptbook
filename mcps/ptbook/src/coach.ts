import ky from "ky";
import { z } from "zod";
import { DomainError } from "./contracts.js";
import type { Env } from "./env.js";

const completion = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
});

export async function axText(
  prompt: { readonly system: string; readonly text: string },
  env: Env,
) {
  if (!env.PTBOOK_AX_KEY) throw new DomainError("NOT_CONNECTED", "A.X K2 key has not been configured.");
  const raw = await ky.post("https://agent-os-biz.adot.ai/oba/v1/chat/completions", {
    headers: { authorization: `Bearer ${env.PTBOOK_AX_KEY}` },
    timeout: 20_000, retry: 0,
    json: {
      model: "skt/a.ll/A.X-K2-ADOT",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.text },
      ],
      max_tokens: 1000,
    },
  }).json<unknown>();
  const result = completion.parse(raw).choices[0];
  if (!result) throw new DomainError("UPSTREAM_ERROR", "A.X returned no response text.", true);
  return result.message.content;
}

export async function setFeedback(text: string, env: Env) {
  const response = await axText({
    system: "너는 한국어 운동 코치다. 사용자가 보고한 기록만 근거로 300자 이하로 답한다. 영상을 보지 않았으면 자세를 봤다고 하지 않는다. 관찰과 추정을 구분하고 다음 세트 행동 한 가지를 제안한다. 통증이면 중단을 권한다. 의료 진단이나 임의 중량 증량을 하지 않는다.",
    text,
  }, env);
  return { text: response.slice(0, 300), basis: "self_report", model: "ax-k2",
    limitations: ["사용자가 입력한 기록을 근거로 작성했으며 자세를 직접 관찰한 결과가 아닙니다."] };
}
