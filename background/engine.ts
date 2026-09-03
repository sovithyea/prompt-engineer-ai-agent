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

Respond with ONLY a JSON object, nothing else -- no markdown code fences, no commentary:
{"needsClarification": boolean, "questions": string[] | omitted}
"questions" must be omitted or empty when needsClarification is false, and contain 1-2 items when true.`;

const REWRITE_SYSTEM = `You are the REWRITE stage of Prompt Polish. You will be given the user's raw prompt, the target AI model, and (if applicable) answers to clarifying questions. Rewrite the prompt using that model's best-practice conventions:

- target = "claude": use XML tags to structure sections (e.g. <task>, <context>, <format>), and request step-by-step reasoning where appropriate.
- target = "gpt": use markdown headers/sections with clear role/task separation (e.g. "# Role", "# Task", "# Format").
- target = "gemini": be concise and front-load the single most important instruction in the first sentence before supporting detail.

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
