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

export interface SiteAdapter {
  matches(): boolean;
  getInputEl(): HTMLElement | null;
  getText(): string;
  setText(text: string): void;
  getButtonAnchor(): HTMLElement | null;
}

// Message-passing contract between content scripts and the background
// service worker -- content scripts don't hold the API key or call the
// engine directly, per the "extension-only, no backend" architecture.
export type EngineMessage =
  | { type: "analyze"; request: AnalyzeRequest }
  | { type: "rewrite"; request: RewriteRequest };

export type EngineMessageResponse =
  | { ok: true; data: AnalyzeResponse | RewriteResponse }
  | { ok: false; error: string };
