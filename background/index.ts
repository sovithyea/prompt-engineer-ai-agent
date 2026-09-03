import { analyze, rewrite, EngineError } from "./engine";
import { getStoredApiKey } from "./storage";
import type { EngineMessage, EngineMessageResponse } from "../shared/types";

// First run: send the user straight to the options page to paste their API
// key, rather than leaving them to discover it's needed only after clicking
// Enhance and getting an error.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

// No default_popup is set on the toolbar action, so clicking it does
// nothing by default -- wire it to open options directly instead.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: EngineMessage, _sender, sendResponse: (response: EngineMessageResponse) => void) => {
  handleMessage(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function handleMessage(message: EngineMessage): Promise<EngineMessageResponse> {
  const apiKey = await getStoredApiKey();
  if (!apiKey) {
    return { ok: false, error: "No Anthropic API key set. Open the extension's options page to add one." };
  }

  try {
    if (message.type === "analyze") {
      return { ok: true, data: await analyze(message.request, apiKey) };
    }
    return { ok: true, data: await rewrite(message.request, apiKey) };
  } catch (err) {
    const errorMessage = err instanceof EngineError ? err.message : "Prompt Polish hit an unexpected error.";
    return { ok: false, error: errorMessage };
  }
}
