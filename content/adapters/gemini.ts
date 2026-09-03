import type { SiteAdapter } from "../../shared/types";

// gemini.google.com wraps a Quill-based (.ql-editor) or ProseMirror-based
// contenteditable surface inside a custom <rich-textarea> element.
// Selectors below are adapted from a real, working Gemini-interacting
// extension (github.com/LayneIns/Ask-Gemini-Extension) rather than
// guessed from scratch -- still not verified against our own live DOM,
// so check devtools first if the button fails to appear.
const INPUT_SELECTORS = [
  "rich-textarea .ql-editor",
  "rich-textarea .ProseMirror",
  "rich-textarea [contenteditable='true']",
  ".text-input-field [contenteditable='true']",
  ".input-area [contenteditable='true']",
  'div[contenteditable="true"][data-placeholder]',
  ".input-area textarea",
];

const ANCHOR_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
  ".send-button",
  'button[data-test-id="send-button"]',
];

function queryFirst(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// execCommand("insertText") silently strips newlines in Gemini's editor,
// collapsing a multi-paragraph rewrite onto one line -- confirmed in the
// reference extension's own comments. Build real <p> elements per line
// and insert as HTML instead, with a manual innerHTML+dispatch fallback
// if insertHTML is refused.
function setContentEditableText(el: HTMLElement, text: string) {
  el.focus();
  const html = text
    .split("\n")
    .map((line) => (line === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`))
    .join("");

  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
  const inserted = document.execCommand("insertHTML", false, html);

  if (!inserted) {
    el.innerHTML = html;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export const geminiAdapter: SiteAdapter = {
  target: "gemini",
  accentColor: "linear-gradient(135deg, #4285f4, #9b72cb, #d96570)", // Gemini's sparkle gradient
  matches() {
    return location.hostname === "gemini.google.com";
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
    if (el instanceof HTMLTextAreaElement) {
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      setContentEditableText(el, text);
    }
  },
  getButtonAnchor() {
    return queryFirst(ANCHOR_SELECTORS);
  },
};
