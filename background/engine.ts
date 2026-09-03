import type { AnalyzeRequest, AnalyzeResponse, RewriteRequest, RewriteResponse } from "../shared/types";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export class EngineError extends Error {
  raw?: unknown;
  constructor(message: string, raw?: unknown) {
    super(message);
    this.name = "EngineError";
    this.raw = raw;
  }
}

const ANALYZE_SYSTEM = `You are the ANALYZE stage of Prompt Polish, a browser extension that helps users write better prompts for AI models. You will be given a user's rough draft prompt (and possibly answers to earlier clarifying questions) and the AI model they intend to send it to.

Decide whether the draft prompt is specific enough to rewrite well, or whether it is too vague and needs clarification first.

A prompt needs clarification if, without more information, a rewrite would have to guess at things like: the intended audience, the desired output format or length, the tone, the scope of the task, or missing source content/context the prompt refers to but doesn't include.

A prompt does NOT need clarification just because it could theoretically be more detailed -- only flag it if a reasonable rewrite would otherwise have to invent important facts.

If previousAnswers are provided, treat them as already answered. Do not ask about anything already covered by previousAnswers. There is at most one round of clarification -- if previousAnswers is present and non-empty, prefer needsClarification: false unless the prompt is still fundamentally unusable.

Ask at most 2 clarifying questions. Each must be short, specific, and answerable in one sentence.

The draft prompt may be written in any language. That alone is never a reason for clarification -- do not spend a question asking what language to use. If you do need to ask something, write your questions in the SAME language as the draft prompt, so the user can read them naturally.

Respond with ONLY a JSON object, nothing else -- no markdown code fences, no commentary:
{"needsClarification": boolean, "questions": string[] | omitted}
"questions" must be omitted or empty when needsClarification is false, and contain 1-2 items when true.`;

const REWRITE_SYSTEM = `You are the REWRITE stage of Prompt Polish. You will be given the user's raw prompt, the target AI model, and (if applicable) answers to clarifying questions. Rewrite the prompt using that model's current best-practice conventions:

- target = "claude": Be explicit and specific -- state constraints, context, and desired output structure directly rather than implying them. When a constraint matters for a non-obvious reason, briefly say why (Claude uses stated motivation to generalize correctly to edge cases you didn't spell out). Use XML tags (e.g. <task>, <context>, <format>) when the prompt mixes multiple kinds of content -- instructions plus reference material plus examples -- but skip them for a genuinely simple, single-purpose prompt. Request step-by-step reasoning only for tasks with multiple dependent parts. State what the output SHOULD contain rather than listing things to avoid. Don't invent an elaborate persona/role unless the task specifically calls for one -- it's rarely necessary.
- target = "gpt": Structure with Markdown headers separating distinct sections (e.g. "# Role", "# Instructions", "# Examples", "# Context"), and always give the model a concrete role/identity at the top -- without one it defaults to a generic assistant voice. State exact output format requirements (length, structure, style). Order content with stable, reusable instructions first and the variable, request-specific details last. Add one or two few-shot examples only if the desired output shape is unusual or hard to pin down in words alone.
- target = "gemini": Be precise, direct, and concise -- Gemini responds better to shorter prompts than Claude or GPT do. Two different orderings depending on the prompt: if it's a plain instruction with no reference material to process, front-load the instruction, role, and output format right at the start. If it includes substantial background/reference material (a document to summarize, data to analyze, text to transform), put ALL of that material first and place the actual instruction or question at the very end, after the material -- Gemini grounds better in supplied content when the ask comes after it, not before it. Use consistent XML tags or Markdown headings to separate instructions from context. Include at least one concrete example when the desired output format isn't obvious from the instruction alone -- Gemini benefits more from a short example than from an equivalent amount of extra prose.

If the draft prompt is written in a language other than English, write the rewritten prompt in that SAME language -- do not translate it to English. Apply the same target-model structural conventions above regardless of language; only the wording stays in the language the user wrote in. Translating without being asked could change meaning or tone the user didn't intend.

Incorporate the user's answers to clarifying questions as concrete details in the rewritten prompt -- do not append a Q&A transcript.

If you must assume anything not stated (only for details that don't materially change the outcome), list each assumption explicitly.

Respond with ONLY a JSON object, nothing else -- no markdown code fences, no commentary:
{"rewritten": string, "changes": string[], "assumptions": string[] | omitted}
"changes" is 3-6 short bullets summarizing what changed and why. Omit or leave "assumptions" empty if none were made.`;

async function callClaude(apiKey: string, system: string, userMessage: string): Promise<unknown> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new EngineError(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data: any = await res.json();
  const block = data?.content?.[0];
  if (!block || block.type !== "text" || typeof block.text !== "string") {
    throw new EngineError("Unexpected Anthropic response shape (no text block)", data);
  }
  return parseJsonResponse(block.text);
}

function parseJsonResponse(text: string): unknown {
  // Minimal safety over a naive JSON.parse: strip ```json fences the model
  // sometimes adds despite instructions, and surface the raw text on
  // failure so eval runs are debuggable instead of an opaque SyntaxError.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new EngineError(`Failed to parse model output as JSON: ${(err as Error).message}`, text);
  }
}

function buildUserMessage(request: AnalyzeRequest): string {
  const lines = [`Target model: ${request.target}`, `Draft prompt:\n${request.rawPrompt}`];
  if (request.previousAnswers?.length) {
    lines.push("Previous clarifying Q&A:");
    for (const qa of request.previousAnswers) lines.push(`Q: ${qa.question}\nA: ${qa.answer}`);
  }
  return lines.join("\n\n");
}

function validateAnalyzeResponse(parsed: unknown): AnalyzeResponse {
  const obj = parsed as any;
  if (typeof obj !== "object" || obj === null || typeof obj.needsClarification !== "boolean") {
    throw new EngineError("Malformed AnalyzeResponse", parsed);
  }
  if (obj.needsClarification) {
    if (!Array.isArray(obj.questions) || obj.questions.length < 1 || obj.questions.length > 2) {
      throw new EngineError("AnalyzeResponse.questions must have 1-2 items when needsClarification is true", parsed);
    }
  }
  return { needsClarification: obj.needsClarification, questions: obj.questions };
}

function validateRewriteResponse(parsed: unknown): RewriteResponse {
  const obj = parsed as any;
  if (typeof obj !== "object" || obj === null || typeof obj.rewritten !== "string" || !Array.isArray(obj.changes)) {
    throw new EngineError("Malformed RewriteResponse", parsed);
  }
  return { rewritten: obj.rewritten, changes: obj.changes, assumptions: obj.assumptions };
}

export async function analyze(request: AnalyzeRequest, apiKey: string): Promise<AnalyzeResponse> {
  const parsed = await callClaude(apiKey, ANALYZE_SYSTEM, buildUserMessage(request));
  return validateAnalyzeResponse(parsed);
}

export async function rewrite(request: RewriteRequest, apiKey: string): Promise<RewriteResponse> {
  const parsed = await callClaude(apiKey, REWRITE_SYSTEM, buildUserMessage(request));
  return validateRewriteResponse(parsed);
}
