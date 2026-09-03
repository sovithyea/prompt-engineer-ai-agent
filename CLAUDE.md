# Prompt Polish — Browser Extension

Manifest V3 extension that adds an "enhance" button next to the input box on
claude.ai, chatgpt.com, and gemini.google.com. User drafts a rough prompt →
clicks enhance → extension asks up to 2 clarifying questions if the prompt is
too vague → rewrites it in place using the target model's best practices.

Built by Vith (Swinburne AI student, side project — keep scope lean,
coursework comes first this semester).

## Architecture decision: shared key behind a backend proxy

Originally this was extension-only (BYO-key, no backend) — see git history
(`e3b108c` onward) for that version. It changed because Vith wants to ship
this to real users without asking each of them to bring their own Anthropic
API key. Since anything shipped inside an extension bundle is readable by
whoever installs it, a shared key can never live client-side — it would be
extracted within minutes and usable by anyone, on Vith's bill.

The actual architecture now: a Cloudflare Worker (`server/`) holds the real
Anthropic key as a secret and exposes `POST /analyze` and `POST /rewrite`.
The extension's background service worker (`background/index.ts`) is a thin
relay — it forwards `EngineMessage`s to the Worker and returns the response,
holding no secret itself. `server/src/engine.ts` is what used to be
`background/engine.ts`: the ANALYZE_SYSTEM/REWRITE_SYSTEM prompts, retry/
timeout logic, and response validation all live there now. See
`server/README.md` for deploy steps and — importantly — the current
rate-limiting posture (there isn't one yet, by deliberate choice; read that
file before assuming it's safe to point people at this).

No per-user API key, no options-page settings, no `chrome.storage` at all
anymore — install and it just works.

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
prompt-polish/                  # the extension
├── manifest.json
├── background/
│   └── index.ts            # thin relay: forwards EngineMessages to server/, holds no secret
├── content/
│   ├── adapters/
│   │   ├── claude.ts
│   │   ├── chatgpt.ts
│   │   └── gemini.ts       # SiteAdapter interface lives in shared/types.ts, not a separate file
│   ├── inject.ts            # picks adapter, injects the Enhance button
│   ├── popover.ts            # iframe-isolated clarifying-question UI (see note below)
│   ├── popover-frame.{html,ts}
│   ├── fallback.ts            # manual paste-mode modal, shown if an adapter's selectors fail
│   ├── fallback-frame.{html,ts}
│   └── toast.ts                # inline error notification
├── options/
│   └── index.html               # static info page -- no settings, nothing to configure
└── shared/
    └── types.ts

server/                          # Cloudflare Worker holding the real API key -- see server/README.md
├── src/
│   ├── index.ts              # HTTP handler: POST /analyze, POST /rewrite, CORS
│   ├── engine.ts               # the actual ANALYZE_SYSTEM/REWRITE_SYSTEM logic (moved here from background/engine.ts)
│   └── types.ts
├── eval/                        # moved here from the extension's eval/ -- this is where the real logic lives now
└── wrangler.toml
```

Note on `popover.ts`/`popover-frame.ts`: the clarifying-question popover runs in an `<iframe>`, not a Shadow DOM, because Shadow DOM only isolates CSS -- it doesn't stop a host page's own keydown listeners from intercepting keystrokes meant for it (this broke typing into the popover on claude.ai during development). An iframe is a genuinely separate browsing context.

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
