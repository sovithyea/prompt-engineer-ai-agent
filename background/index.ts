import type { EngineMessage, EngineMessageResponse } from "../shared/types";

// Deployed via server/ (a Cloudflare Worker). See server/README.md.
const BACKEND_URL = "https://prompt-polish-api.prompt-polish.workers.dev";

// First run: no API key to configure anymore (the shared backend holds
// it), but still worth a quick "here's how it works" landing page instead
// of leaving a first-time user to discover the button on their own.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

// No default_popup is set on the toolbar action, so clicking it does
// nothing by default -- wire it to open the info page instead.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: EngineMessage, _sender, sendResponse: (response: EngineMessageResponse) => void) => {
  handleMessage(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function handleMessage(message: EngineMessage): Promise<EngineMessageResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}/${message.type}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message.request),
    });

    const json: EngineMessageResponse = await res.json();
    if (!res.ok || !json.ok) {
      return { ok: false, error: !json.ok ? json.error : `Server error (${res.status})` };
    }
    return json;
  } catch {
    return { ok: false, error: "Could not reach Prompt Polish's server. Check your connection and try again." };
  }
}
