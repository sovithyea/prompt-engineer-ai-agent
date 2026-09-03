import type { ClarifyingAnswer } from "../shared/types";

// Runs inside its own <iframe> browsing context (see popover.ts) -- a
// genuinely separate document, not just a Shadow DOM. This is what
// actually isolates keystrokes from the host page's own JS, since a
// document-level keydown listener on the host page cannot see into a
// child iframe's document at all.
let parentOrigin = "*";
let questions: string[] = [];
let accentColor = "#d64545"; // Prompt Polish's own brand red -- overridden per-site by the init message

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function reportSize() {
  const rect = document.getElementById("popover")!.getBoundingClientRect();
  parent.postMessage({ type: "prompt-polish-size", height: Math.ceil(rect.height) }, parentOrigin);
}

function render() {
  const container = document.getElementById("popover")!;
  container.innerHTML = `
    ${questions
      .map((q, i) => `<div class="question">${escapeHtml(q)}</div><textarea data-index="${i}" placeholder="Type your answer..."></textarea>`)
      .join("")}
    <div class="actions">
      <button class="cancel" type="button">Skip</button>
      <button class="submit" type="button">Continue</button>
    </div>
  `;

  const textareas = Array.from(container.querySelectorAll<HTMLTextAreaElement>("textarea"));
  textareas[0]?.focus();

  const submitButton = container.querySelector<HTMLButtonElement>(".submit")!;
  submitButton.style.background = accentColor;

  container.querySelector(".cancel")!.addEventListener("click", () => {
    parent.postMessage({ type: "prompt-polish-cancel" }, parentOrigin);
  });

  submitButton.addEventListener("click", () => {
    const answers: ClarifyingAnswer[] = textareas.map((ta, i) => ({
      question: questions[i],
      answer: ta.value.trim(),
    }));
    parent.postMessage({ type: "prompt-polish-result", answers }, parentOrigin);
  });

  requestAnimationFrame(reportSize);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    parent.postMessage({ type: "prompt-polish-cancel" }, parentOrigin);
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "prompt-polish-init") {
    parentOrigin = event.origin;
    questions = event.data.questions;
    accentColor = event.data.accentColor ?? accentColor;
    render();
  }
});
