import type { SiteAdapter } from "../../shared/types";

// claude.ai's composer is a ProseMirror-based contenteditable div. These
// selectors are a best-effort guess at a resilient pattern (ordered most-
// to least-specific) -- NOT verified against the live DOM. Check devtools
// on claude.ai and update this list first if the button fails to appear.
const INPUT_SELECTORS = [
  '[data-testid="chat-input"] div[contenteditable="true"]',
  'div.ProseMirror[contenteditable="true"]',
  'div[contenteditable="true"][aria-label*="Claude" i]',
];

const ANCHOR_SELECTORS = [
  '[data-testid="chat-input-actions"]',
  'form:has([data-testid="chat-input"]) [data-testid="send-button"]',
  'button[aria-label*="Send" i]',
];

function queryFirst(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

export const claudeAdapter: SiteAdapter = {
  target: "claude",
  accentColor: "#d97757", // Anthropic's brand terracotta/orange
  matches() {
    return location.hostname === "claude.ai";
  },
  getInputEl() {
    return queryFirst(INPUT_SELECTORS);
  },
  getText() {
    return this.getInputEl()?.textContent?.trim() ?? "";
  },
  setText(text: string) {
    const el = this.getInputEl();
    if (!el) return;
    el.focus();
    // execCommand (deprecated but still functional in Chrome) is used
    // instead of setting textContent directly because ProseMirror/React
    // listen for real "input" events -- a raw textContent assignment
    // doesn't fire them and the editor's internal state goes stale.
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);
  },
  getButtonAnchor() {
    return queryFirst(ANCHOR_SELECTORS);
  },
};
