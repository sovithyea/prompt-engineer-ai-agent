import type { ClarifyingAnswer } from "../shared/types";

const FRAME_WIDTH = 340;
const ESTIMATED_HEIGHT = 220; // refined once the frame reports its real rendered size

// Rendered in an <iframe> pointed at an extension-bundled page, NOT a
// Shadow DOM. Shadow DOM only isolates CSS -- it does not stop the host
// page's own document-level keydown listeners from intercepting keystrokes
// before they reach elements inside the shadow tree (this is exactly what
// broke typing into the popover on claude.ai, which redirects keystrokes
// to its own composer). A separate browsing context is the only thing
// that actually isolates keyboard events.
export function showClarifyingPopover(anchor: HTMLElement, questions: string[]): Promise<ClarifyingAnswer[]> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("content/popover-frame.html");
    iframe.style.cssText =
      `position: fixed; z-index: 2147483647; width: ${FRAME_WIDTH}px; height: ${ESTIMATED_HEIGHT}px; ` +
      "border: none; border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); background: transparent;";
    document.body.appendChild(iframe);

    const frameOrigin = new URL(chrome.runtime.getURL("")).origin;

    function position(height: number) {
      const margin = 20;
      const anchorRect = anchor.getBoundingClientRect();
      const spaceAbove = anchorRect.top;
      const top = spaceAbove >= height + margin ? anchorRect.top - height - margin : anchorRect.bottom + margin;

      const centerX = anchorRect.left + anchorRect.width / 2;
      const maxLeft = window.innerWidth - FRAME_WIDTH - margin;
      const left = Math.min(Math.max(margin, centerX - FRAME_WIDTH / 2), Math.max(margin, maxLeft));

      iframe.style.top = `${top}px`;
      iframe.style.left = `${left}px`;
    }
    position(ESTIMATED_HEIGHT);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type === "prompt-polish-size") {
        iframe.style.height = `${event.data.height}px`;
        position(event.data.height);
      } else if (event.data?.type === "prompt-polish-result") {
        cleanup();
        resolve(event.data.answers as ClarifyingAnswer[]);
      } else if (event.data?.type === "prompt-polish-cancel") {
        cleanup();
        resolve([]);
      }
    }
    window.addEventListener("message", onMessage);

    iframe.addEventListener("load", () => {
      iframe.contentWindow!.postMessage({ type: "prompt-polish-init", questions }, frameOrigin);
      iframe.focus();
    });
  });
}
