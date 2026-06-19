const $ = (id) => document.getElementById(id);

async function load() {
  const { endpoint = "", token = "" } = await chrome.storage.sync.get(["endpoint", "token"]);
  $("endpoint").value = endpoint;
  $("token").value = token;
}

$("save").addEventListener("click", async () => {
  const endpoint = $("endpoint").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  await chrome.storage.sync.set({ endpoint, token });
  $("status").textContent = "Salvato ✓";
  setTimeout(() => ($("status").textContent = ""), 1500);
});

load();
