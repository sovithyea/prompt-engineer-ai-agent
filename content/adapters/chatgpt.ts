import type { SiteAdapter } from "../../shared/types";

// chatgpt.com's composer has changed shape more than once (plain <textarea>
// vs. a contenteditable div) -- these selectors are a best-effort guess,
// NOT verified against the live DOM. Check devtools and update this list
// first if the button fails to appear. Per CLAUDE.md: expect this one to
// need maintenance more than the others.
const INPUT_SELECTORS = [
  "#prompt-textarea",
  'div[contenteditable="true"]#prompt-textarea',
  'form textarea[data-testid="prompt-textarea"]',
];

const ANCHOR_SELECTORS = ['[data-testid="send-button"]', 'button[aria-label*="Send" i]'];

function queryFirst(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

// Directly setting .value on a React-controlled <textarea> doesn't fire
// React's onChange -- have to go through the native setter and dispatch a
// real "input" event so React's synthetic event system picks it up.
function setNativeTextareaValue(el: HTMLTextAreaElement, text: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  nativeSetter.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export const chatgptAdapter: SiteAdapter = {
  target: "gpt",
  matches() {
    return location.hostname === "chatgpt.com" || location.hostname === "chat.openai.com";
  },
  getInputEl() {
    return queryFirst(INPUT_SELECTORS);
  },
  getText() {
    const el = this.getInputEl();
    if (!el) return "";
    return el instanceof HTMLTextAreaElement ? el.value.trim() : (el.textContent?.trim() ?? "");
  },
  setText(text: string) {
    const el = this.getInputEl();
    if (!el) return;
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      setNativeTextareaValue(el, text);
    } else {
      // execCommand (deprecated but still functional in Chrome) fires real
      // "input" events, which a raw textContent assignment would not.
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, text);
    }
  },
  getButtonAnchor() {
    return queryFirst(ANCHOR_SELECTORS);
  },
};
