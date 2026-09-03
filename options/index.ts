import { getStoredApiKey, setStoredApiKey } from "../background/storage";

const input = document.getElementById("api-key") as HTMLInputElement;
const status = document.getElementById("status") as HTMLDivElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;

async function load() {
  const key = await getStoredApiKey();
  if (key) input.value = key;
}

saveButton.addEventListener("click", async () => {
  await setStoredApiKey(input.value);
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});

load();
