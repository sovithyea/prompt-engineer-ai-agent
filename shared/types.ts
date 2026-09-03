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
  /** Present only when needsClarification is true. 1-2 items. */
  questions?: string[];
}

export interface RewriteRequest extends AnalyzeRequest {}

export interface RewriteResponse {
  rewritten: string;
  changes: string[];
  assumptions?: string[];
}

// --- Phase 1+ (not implemented this session) ---
// Declared now because CLAUDE.md requires this interface to exist before
// content/adapters/{claude,chatgpt,gemini}.ts are built.
export interface SiteAdapter {
  matches(): boolean;
  getInputEl(): HTMLElement | null;
  getText(): string;
  setText(text: string): void;
  getButtonAnchor(): HTMLElement | null;
}
