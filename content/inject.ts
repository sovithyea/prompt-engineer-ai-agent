import { claudeAdapter } from "./adapters/claude";
import { chatgptAdapter } from "./adapters/chatgpt";
import { geminiAdapter } from "./adapters/gemini";
import { showClarifyingPopover } from "./popover";
import { showErrorToast } from "./toast";
import { injectFallbackTrigger, removeFallbackTrigger } from "./fallback";
import type {
  SiteAdapter,
  AnalyzeResponse,
  RewriteResponse,
  ClarifyingAnswer,
  EngineMessage,
  EngineMessageResponse,
} from "../shared/types";

const ADAPTERS: SiteAdapter[] = [claudeAdapter, chatgptAdapter, geminiAdapter];
const BUTTON_MARKER = "data-prompt-polish-button";
const BUTTON_LABEL = "Enhance Prompt";

function findAdapter(): SiteAdapter | null {
  return ADAPTERS.find((adapter) => adapter.matches()) ?? null;
}

function sendEngineMessage(message: EngineMessage): Promise<EngineMessageResponse> {
  return chrome.runtime.sendMessage(message);
}

async function runAnalyze(
  adapter: SiteAdapter,
  rawPrompt: string,
  previousAnswers?: ClarifyingAnswer[],
): Promise<AnalyzeResponse> {
  const response = await sendEngineMessage({
    type: "analyze",
    request: { rawPrompt, target: adapter.target, previousAnswers },
  });
  if (!response.ok) throw new Error(response.error);
  return response.data as AnalyzeResponse;
}

async function runRewrite(
  adapter: SiteAdapter,
  rawPrompt: string,
  previousAnswers?: ClarifyingAnswer[],
): Promise<RewriteResponse> {
  const response = await sendEngineMessage({
    type: "rewrite",
    request: { rawPrompt, target: adapter.target, previousAnswers },
  });
  if (!response.ok) throw new Error(response.error);
  return response.data as RewriteResponse;
}

// Floats as its own box above the composer via position: fixed, rather than
// being appended inline into the host page's icon row -- decouples us from
// that row's cramped flex layout entirely.
function createButton(adapter: SiteAdapter): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = BUTTON_LABEL;
  button.setAttribute(BUTTON_MARKER, "true");
  button.style.cssText =
    "position: fixed; z-index: 2147483647; padding: 8px 14px; border-radius: 8px; border: none; " +
    `background: ${adapter.accentColor}; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; ` +
    "font-family: system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);";
  return button;
}

function positionButtonAboveComposer(adapter: SiteAdapter, button: HTMLButtonElement) {
  const reference = adapter.getInputEl() ?? adapter.getButtonAnchor();
  if (!reference) return;

  const margin = 8;
  const referenceRect = reference.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  const top = Math.max(margin, referenceRect.top - buttonRect.height - margin);
  const maxLeft = window.innerWidth - buttonRect.width - margin;
  const left = Math.min(Math.max(margin, referenceRect.left), Math.max(margin, maxLeft));

  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
}

// Cap clarifying rounds at 1, per CLAUDE.md's state machine: if still vague
// after one round of answers, rewrite anyway with best-effort assumptions
// rather than looping.
async function handleEnhanceClick(adapter: SiteAdapter, button: HTMLButtonElement) {
  const rawPrompt = adapter.getText();
  if (!rawPrompt) return;

  button.disabled = true;
  button.textContent = "Thinking...";

  try {
    let previousAnswers: ClarifyingAnswer[] | undefined;
    const analyzeResult = await runAnalyze(adapter, rawPrompt);

    if (analyzeResult.needsClarification && analyzeResult.questions?.length) {
      // Anchor to the composer itself so the popover centers over "the
      // main box" with a clear gap above it, rather than a small button.
      const composerAnchor = adapter.getInputEl() ?? adapter.getButtonAnchor() ?? button;
      const answers = await showClarifyingPopover(composerAnchor, analyzeResult.questions, adapter.accentColor);
      if (answers.length) previousAnswers = answers;
    }

    const rewriteResult = await runRewrite(adapter, rawPrompt, previousAnswers);
    adapter.setText(rewriteResult.rewritten);
  } catch (err) {
    console.error("[Prompt Polish]", err);
    showErrorToast(err instanceof Error ? err.message : "Prompt Polish failed to enhance this prompt.");
  } finally {
    button.disabled = false;
    button.textContent = BUTTON_LABEL;
  }
}

let hasEverFoundAnchor = false;

function injectButton(adapter: SiteAdapter) {
  const anchor = adapter.getButtonAnchor();
  if (!anchor) return;

  hasEverFoundAnchor = true;
  removeFallbackTrigger();

  let button = document.querySelector<HTMLButtonElement>(`[${BUTTON_MARKER}]`);
  if (!button) {
    button = createButton(adapter);
    button.addEventListener("click", () => handleEnhanceClick(adapter, button!));
    document.body.appendChild(button);
  }
  positionButtonAboveComposer(adapter, button);
}

// If the adapter's selectors never find a composer within a few seconds --
// most likely the site redesigned and broke them -- fall back to a manual
// paste/copy modal instead of leaving the extension silently doing nothing.
const FALLBACK_GRACE_PERIOD_MS = 6000;

function main() {
  const adapter = findAdapter();
  if (!adapter) return; // manifest content_scripts only match sites with an adapter

  // claude.ai is a client-rendered SPA -- the composer can be torn down
  // and remounted on navigation, so keep re-checking rather than injecting once.
  const observer = new MutationObserver(() => injectButton(adapter));
  observer.observe(document.body, { childList: true, subtree: true });
  // Reposition on resize (viewport changed) and DOM mutations (composer
  // grew/shrank) -- but NOT on scroll, which fired constantly (including
  // from scrolling inside the composer itself) and made the button visibly
  // drift instead of staying anchored in place.
  window.addEventListener("resize", () => injectButton(adapter));
  injectButton(adapter);

  setTimeout(() => {
    if (!hasEverFoundAnchor) injectFallbackTrigger(adapter);
  }, FALLBACK_GRACE_PERIOD_MS);
}

main();
