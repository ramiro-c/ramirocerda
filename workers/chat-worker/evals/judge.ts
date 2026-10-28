/**
 * Simple LLM judge for faithfulness: given the retrieved context and Botardo's
 * answer, does the answer only state facts supported by the context, and is it
 * a decline ("no tengo ese dato")? Uses the generation endpoint with
 * temperature 0. Not counted as pipeline cost.
 */

import type { RetrievedChunk } from "../src/rag";

export interface JudgeVerdict {
  faithful: boolean;
  declined: boolean;
}

export const JUDGE_PROMPT = `You grade answers of Botardo, an assistant that must answer ONLY from the CONTEXT about Ramiro Cerdá.
Return strict JSON: {"faithful": boolean, "declined": boolean}
- faithful: true if every factual claim about Ramiro in the ANSWER is supported by the CONTEXT (generic politeness, offers to help and links present in the context are fine). false if it states any fact about Ramiro that is not in the CONTEXT.
- declined: true if the answer says it does not have that information or only answers about Ramiro's profile instead of answering.
Output only the JSON.`;

export async function judgeAnswer(opts: {
  fetchImpl: typeof fetch;
  endpoint: string;
  apiKey: string;
  model: string;
  question: string;
  answer: string;
  chunks: RetrievedChunk[];
}): Promise<JudgeVerdict | null> {
  const context = opts.chunks.map((c, i) => `[${i + 1}] ${String(c.metadata?.text ?? "")}`).join("\n\n") || "(empty)";
  try {
    const res = await opts.fetchImpl(opts.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        "x-opencode-session": "botardo-eval-judge",
        "User-Agent": "botardo-eval/1.0",
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: JUDGE_PROMPT },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${opts.question}\n\nANSWER: ${opts.answer}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<JudgeVerdict>;
    if (typeof parsed.faithful !== "boolean" || typeof parsed.declined !== "boolean") return null;
    return { faithful: parsed.faithful, declined: parsed.declined };
  } catch {
    return null;
  }
}
