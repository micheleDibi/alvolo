import { capture, getConfig } from "./shared.js";

const $ = (id) => document.getElementById(id);
let tab = null;

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("page").textContent = tab ? `${tab.title}\n${tab.url}` : "(nessuna scheda)";
  const { endpoint } = await getConfig();
  if (!endpoint) {
    $("status").innerHTML = '⚠️ Configura l\'endpoint nelle Impostazioni.';
  }
}

function setStatus(msg, ok) {
  $("status").textContent = msg;
  $("status").style.color = ok ? "#34d399" : "#f87171";
}

async function run(payload, btn) {
  btn.disabled = true;
  setStatus("Salvo…", true);
  try {
    await capture(payload);
    setStatus("Salvato ✓ — chiudo…", true);
    setTimeout(() => window.close(), 700);
  } catch (e) {
    setStatus(String(e.message || e), false);
    btn.disabled = false;
  }
}

$("savePage").addEventListener("click", (e) => {
  const note = $("note").value.trim();
  const payload = { url: tab?.url };
  if (note) payload.text = `${note}\n\n— ${tab?.url}`;
  // If there's a note, capture it as text (with link); otherwise capture the link.
  run(note ? { text: payload.text } : { url: tab?.url }, e.target);
});

$("saveNote").addEventListener("click", (e) => {
  const note = $("note").value.trim();
  if (!note) return setStatus("Scrivi una nota prima.", false);
  run({ text: note }, e.target);
});

$("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
