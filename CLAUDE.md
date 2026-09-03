# Prompt Polish — Browser Extension

Manifest V3 extension that adds an "enhance" button next to the input box on
claude.ai, chatgpt.com, and gemini.google.com. User drafts a rough prompt →
clicks enhance → extension asks up to 2 clarifying questions if the prompt is
too vague → rewrites it in place using the target model's best practices.

Built by Vith (Swinburne AI student, side project — keep scope lean,
coursework comes first this semester).

## Architecture decision: extension-only, no backend

The extension calls the Anthropic API directly from the background service
worker, using a key the user pastes into extension settings (stored in
`chrome.storage.local`). No server to build, host, or pay for.

**Gotcha:** api.anthropic.com blocks direct browser calls via CORS unless the
request includes header `anthropic-dangerous-direct-browser-access: true`.
This is fine for BYO-key personal use — the key never leaves the user's own
browser. It stops being fine the moment this ships to other people, because
their key would be visible in network requests to anyone inspecting the
extension. **If this ever becomes a public product, that's the trigger to add
a thin backend proxy that holds the key server-side.** Not needed for MVP.

## Core flow (state machine)

```
draft text
  → ANALYZE (is this specific enough to rewrite confidently?)
      → needs_clarification: true  → show ≤2 short questions inline
                                    → user answers → back to ANALYZE with answers
      → needs_clarification: false → REWRITE → insert result into the input box
```

Cap clarifying rounds at 1. If still vague after one round of answers, rewrite
with best-effort assumptions and list them in the changelog rather than
looping forever.

## Data contracts

```typescript
// shared/types.ts
interface AnalyzeRequest {
  rawPrompt: string;
  target: "claude" | "gpt" | "gemini";
  previousAnswers?: { question: string; answer: string }[];
}

interface AnalyzeResponse {
  needsClarification: boolean;
  questions?: string[]; // max 2, only if needsClarification
}

interface RewriteRequest extends AnalyzeRequest {}

interface RewriteResponse {
  rewritten: string;
  changes: string[]; // short bullet list of what changed and why
  assumptions?: string[]; // filled in if we skipped clarification
}
```

## Core engine (background service worker)

Two calls to Claude Haiku (cheap, fast, good enough for this task):

```typescript
// background/engine.ts
const ANALYZE_SYSTEM = `You are a prompt engineering expert. Decide if the
given prompt is specific enough to rewrite well, or too vague (missing
format, audience, scope, or constraints that would meaningfully change the
output). If too vague, write up to 2 short clarifying questions.
Output ONLY JSON: { "needsClarification": boolean, "questions": string[] }`;

const REWRITE_SYSTEM = `You are a prompt engineering expert. Rewrite the
prompt (using any Q&A context given) to be clear, specific, and well
structured. Preserve intent — don't add scope the user didn't ask for.
Apply target-model conventions:
  claude: XML tags for structure, explicit step-by-step where useful
  gpt: markdown headers, clear system/user separation cues
  gemini: concise, front-loaded instructions
Output ONLY JSON: { "rewritten": string, "changes": string[], "assumptions": string[] }`;

async function callClaude(system: string, userContent: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": await getStoredApiKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await res.json();
  return JSON.parse(data.content.find((b: any) => b.type === "text").text);
}
```

## Site adapters (content scripts)

Each site needs its own selector for the input box + a stable place to inject
the enhance button. These WILL break when sites redesign — isolate them so
one break doesn't take down the others.

```typescript
// content/adapters/types.ts
interface SiteAdapter {
  matches: () => boolean;
  getInputEl: () => HTMLElement | null; // textarea or contenteditable
  getText: () => string;
  setText: (text: string) => void;
  getButtonAnchor: () => HTMLElement | null; // where to inject the ✨ button
}
```

Build in this order — get one working end-to-end before adding the next:

1. **claude.ai** — contenteditable div, `data-testid` attributes are fairly
   stable
2. **chatgpt.com** — textarea with id, changes selectors often, expect
   maintenance
3. **gemini.google.com** — rich-text editor, trickiest of the three

Ship a manual fallback: if no adapter matches, show a popup UI with a
textarea instead of trying to inject into the page. Keeps the extension
useful even when a site redesign breaks the content script.

## Clarifying-questions UI

Render inside a Shadow DOM (avoids CSS collisions with host site) as a small
popover anchored to the enhance button. Plain DOM/vanilla JS, not React —
keep the content script bundle small.

## File structure

```
prompt-polish/
├── manifest.json
├── background/
│   ├── engine.ts        # analyze + rewrite calls
│   └── storage.ts        # API key get/set
├── content/
│   ├── adapters/
│   │   ├── claude.ts
│   │   ├── chatgpt.ts
│   │   ├── gemini.ts
│   │   └── types.ts
│   ├── inject.ts          # picks adapter, injects button
│   └── popover.ts         # shadow DOM clarifying-question UI
├── options/
│   └── index.html          # API key settings page
└── shared/
    └── types.ts
```

## Phased build plan

- **Phase 0** — core engine (`analyze`/`rewrite` functions) + a hand-written
  eval set of ~10 rough prompts with expected clarifying questions, to sanity
  check the system prompts before touching any UI
- **Phase 1** — claude.ai adapter only, full flow end-to-end, options page for
  API key
- **Phase 2** — chatgpt.com + gemini.google.com adapters
- **Phase 3** — polish: remember last-used target model, small history of
  recent rewrites, manual-fallback popup

## Open decisions to make in the first Claude Code session

- Vanilla JS/TS + esbuild for the extension bundle, or a lightweight
  framework — recommend vanilla given the small surface area
- Sync vs local storage for the API key (`chrome.storage.sync` would carry it
  across devices but syncs via Google — probably want `local` only)
- Whether "target model" is auto-detected from the site (claude.ai → claude)
  or user-selectable, for cases like drafting a Claude-flavored prompt while
  physically on chatgpt.com
