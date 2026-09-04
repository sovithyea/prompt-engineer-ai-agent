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

// Floats as its own box beside the composer via position: fixed, rather than
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
    // inherit rather than a hardcoded font -- picks up whatever font the
    // host page itself uses (its own licensed typeface, not one we can
    // legally bundle), and stays correct if a site ever changes it.
    "font-family: inherit; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);";
  return button;
}

function positionButtonBesideComposer(adapter: SiteAdapter, button: HTMLButtonElement) {
  const reference = adapter.getInputEl() ?? adapter.getButtonAnchor();
  if (!reference) return;

  const margin = 8;
  const referenceRect = reference.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  const centeredTop = referenceRect.top + (referenceRect.height - buttonRect.height) / 2;
  const maxTop = window.innerHeight - buttonRect.height - margin;
  const top = Math.min(Math.max(margin, centeredTop), Math.max(margin, maxTop));

  // Prefer floating just outside the composer's right edge; if there isn't
  // room (narrow viewport), fall back to just outside its left edge instead
  // of overlapping the box.
  const fitsOnRight = referenceRect.right + margin + buttonRect.width <= window.innerWidth - margin;
  const left = fitsOnRight
    ? referenceRect.right + margin
    : Math.max(margin, referenceRect.left - buttonRect.width - margin);

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

  // Nothing to enhance in an empty composer -- stay out of the way until the
  // user has actually drafted something. Hide before positioning, since a
  // hidden button measures 0x0 and would be placed wrong on the way back.
  const hasDraft = adapter.getText().length > 0;
  button.style.display = hasDraft ? "inline-block" : "none";
  if (!hasDraft) return;

  positionButtonBesideComposer(adapter, button);
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
  // Typing into a <textarea> (chatgpt.com) changes .value without mutating the
  // DOM, so the MutationObserver above never sees it -- listen for input
  // events too, in capture phase so host handlers can't stop them first.
  document.addEventListener("input", () => injectButton(adapter), true);
  injectButton(adapter);

  setTimeout(() => {
    if (!hasEverFoundAnchor) injectFallbackTrigger(adapter);
  }, FALLBACK_GRACE_PERIOD_MS);
}

main();
