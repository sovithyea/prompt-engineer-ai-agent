// Mirrors shared/types.ts in the extension project. Kept as a separate copy
// rather than a shared package -- the Worker and the extension are built
// and deployed independently, and this is a handful of small interfaces,
// not worth the tooling cost of a shared workspace package.
export type Target = "claude" | "gpt" | "gemini";

export interface ClarifyingAnswer {
  question: string;
  answer: string;
}

export interface AnalyzeRequest {
  rawPrompt: string;
  target: Target;
  previousAnswers?: ClarifyingAnswer[];
}

export interface AnalyzeResponse {
  needsClarification: boolean;
  questions?: string[];
}

export interface RewriteRequest extends AnalyzeRequest {}

export interface RewriteResponse {
  rewritten: string;
  changes: string[];
  assumptions?: string[];
}
