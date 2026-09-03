const TOAST_MARKER = "data-prompt-polish-toast";
const AUTO_DISMISS_MS = 8000;

// A plain floating div, not an iframe -- unlike the clarifying popover,
// this only displays a message we generated ourselves. There's no user
// keystrokes to isolate, so the extra isolation cost isn't needed here.
export function showErrorToast(message: string) {
  document.querySelectorAll(`[${TOAST_MARKER}]`).forEach((el) => el.remove());

  const toast = document.createElement("div");
  toast.setAttribute(TOAST_MARKER, "true");
  toast.style.cssText =
    "position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; max-width: 320px; " +
    "background: #fff; color: #1c1a18; border-left: 4px solid #d64545; border-radius: 8px; " +
    "box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); padding: 12px 16px; font-family: system-ui, sans-serif; " +
    "font-size: 13px; line-height: 1.45; display: flex; gap: 10px; align-items: flex-start;";

  const text = document.createElement("div");
  text.style.cssText = "flex: 1;";
  text.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Dismiss");
  closeButton.style.cssText =
    "background: none; border: none; cursor: pointer; font-size: 18px; line-height: 1; color: #6f6a65; padding: 0;";
  closeButton.addEventListener("click", () => toast.remove());

  toast.appendChild(text);
  toast.appendChild(closeButton);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), AUTO_DISMISS_MS);
}
