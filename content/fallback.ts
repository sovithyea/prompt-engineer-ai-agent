import type { SiteAdapter } from "../shared/types";

const TRIGGER_MARKER = "data-prompt-polish-fallback-trigger";

let triggerButton: HTMLButtonElement | null = null;
let modalBackdrop: HTMLDivElement | null = null;
let modalIframe: HTMLIFrameElement | null = null;
let onMessageHandler: ((event: MessageEvent) => void) | null = null;

// Shown when the adapter's own selectors can't find the composer -- keeps
// the extension usable via manual paste/copy instead of doing nothing
// silently when a site redesign breaks live injection.
export function injectFallbackTrigger(adapter: SiteAdapter) {
  if (document.querySelector(`[${TRIGGER_MARKER}]`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(TRIGGER_MARKER, "true");
  button.textContent = "✨ Prompt Polish (paste mode)";
  button.style.cssText =
    "position: fixed; bottom: 20px; right: 20px; z-index: 2147483646; padding: 10px 16px; border-radius: 999px; " +
    `border: none; background: ${adapter.accentColor}; color: #fff; font-size: 13px; font-weight: 600; ` +
    "cursor: pointer; font-family: system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);";
  button.addEventListener("click", () => openFallbackModal(adapter));
  document.body.appendChild(button);
  triggerButton = button;
}

export function removeFallbackTrigger() {
  triggerButton?.remove();
  triggerButton = null;
}

function openFallbackModal(adapter: SiteAdapter) {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = "position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, 0.4);";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeFallbackModal();
  });

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("content/fallback-frame.html");
  iframe.allow = "clipboard-write";
  iframe.style.cssText =
    "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, 92vw); " +
    "height: min(520px, 88vh); border: none; background: transparent;";

  const frameOrigin = new URL(chrome.runtime.getURL("")).origin;

  function onMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return;
    if (event.data?.type === "prompt-polish-fallback-close") {
      closeFallbackModal();
    }
  }
  onMessageHandler = onMessage;
  window.addEventListener("message", onMessage);

  iframe.addEventListener("load", () => {
    iframe.contentWindow!.postMessage(
      { type: "prompt-polish-fallback-init", target: adapter.target, accentColor: adapter.accentColor, siteName: location.hostname },
      frameOrigin,
    );
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(iframe);
  modalBackdrop = backdrop;
  modalIframe = iframe;
}

function closeFallbackModal() {
  if (onMessageHandler) window.removeEventListener("message", onMessageHandler);
  onMessageHandler = null;
  modalBackdrop?.remove();
  modalIframe?.remove();
  modalBackdrop = null;
  modalIframe = null;
}
