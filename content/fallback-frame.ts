import type { AnalyzeResponse, ClarifyingAnswer, EngineMessage, EngineMessageResponse, RewriteResponse, Target } from "../shared/types";

let parentOrigin = "*";
let target: Target = "claude";
let hasAskedOnce = false;

const draftEl = document.getElementById("draft") as HTMLTextAreaElement;
const hintEl = document.getElementById("hint") as HTMLParagraphElement;
const questionsEl = document.getElementById("questions") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const resultEl = document.getElementById("result") as HTMLTextAreaElement;
const enhanceButton = document.getElementById("enhance") as HTMLButtonElement;
const copyButton = document.getElementById("copy") as HTMLButtonElement;
const closeButton = document.getElementById("close") as HTMLButtonElement;

function sendEngineMessage(message: EngineMessage): Promise<EngineMessageResponse> {
  return chrome.runtime.sendMessage(message);
}

function setStatus(text: string, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#d64545" : "#6f6a65";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderQuestions(questions: string[]) {
  questionsEl.innerHTML = questions
    .map((q, i) => `<div class="question">${escapeHtml(q)}</div><textarea class="answer" data-index="${i}" placeholder="Type your answer..."></textarea>`)
    .join("");
}

// Reads and clears any answer boxes currently on screen (from a prior
// clarification round), pairing each with its question text.
function collectPendingAnswers(): ClarifyingAnswer[] | null {
  const labels = Array.from(questionsEl.querySelectorAll(".question")).map((el) => el.textContent ?? "");
  const textareas = Array.from(questionsEl.querySelectorAll<HTMLTextAreaElement>("textarea"));
  if (!textareas.length) return null;
  const answers = textareas.map((ta, i) => ({ question: labels[i], answer: ta.value.trim() }));
  questionsEl.innerHTML = "";
  return answers;
}

function showResult(rewritten: string) {
  resultEl.value = rewritten;
  resultEl.hidden = false;
  copyButton.hidden = false;
  setStatus("Done — copy the result below and paste it in.");
}

async function handleEnhance() {
  const rawPrompt = draftEl.value.trim();
  if (!rawPrompt) return;

  const answeredThisRound = collectPendingAnswers();

  enhanceButton.disabled = true;
  setStatus("Thinking...");
  resultEl.hidden = true;
  copyButton.hidden = true;

  try {
    if (!hasAskedOnce) {
      hasAskedOnce = true;
      const analyzeResponse = await sendEngineMessage({ type: "analyze", request: { rawPrompt, target } });
      if (!analyzeResponse.ok) throw new Error(analyzeResponse.error);
      const analyzeResult = analyzeResponse.data as AnalyzeResponse;

      if (analyzeResult.needsClarification && analyzeResult.questions?.length) {
        renderQuestions(analyzeResult.questions);
        setStatus("Answer above, then click Continue.");
        enhanceButton.textContent = "Continue";
        return;
      }
    }

    const rewriteResponse = await sendEngineMessage({
      type: "rewrite",
      request: { rawPrompt, target, previousAnswers: answeredThisRound ?? undefined },
    });
    if (!rewriteResponse.ok) throw new Error(rewriteResponse.error);
    showResult((rewriteResponse.data as RewriteResponse).rewritten);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Something went wrong.", true);
  } finally {
    enhanceButton.disabled = false;
  }
}

enhanceButton.addEventListener("click", handleEnhance);

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultEl.value);
  const original = copyButton.textContent;
  copyButton.textContent = "Copied!";
  setTimeout(() => {
    copyButton.textContent = original;
  }, 1500);
});

closeButton.addEventListener("click", () => {
  parent.postMessage({ type: "prompt-polish-fallback-close" }, parentOrigin);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    parent.postMessage({ type: "prompt-polish-fallback-close" }, parentOrigin);
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "prompt-polish-fallback-init") {
    parentOrigin = event.origin;
    target = event.data.target;
    enhanceButton.style.background = event.data.accentColor;
    if (event.data.siteName) {
      hintEl.textContent = `Couldn't find the message box on ${event.data.siteName} automatically. Paste your rough prompt below, then copy the result back in yourself.`;
    }
  }
});
