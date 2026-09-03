// chrome.storage.local (NOT .sync) -- avoids syncing the user's API key
// across their Google account/devices.

const API_KEY_STORAGE_KEY = "promptPolish.anthropicApiKey";

export async function getStoredApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  const value = result[API_KEY_STORAGE_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function setStoredApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey.trim() });
}

export async function clearStoredApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
}
