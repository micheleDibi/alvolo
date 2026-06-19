// Context-menu entry points: save the current page, a link, or a text selection.
import { capture } from "./shared.js";

const MENUS = [
  { id: "alvolo-page", title: "Salva questa pagina in AlVolo", contexts: ["page"] },
  { id: "alvolo-link", title: "Salva il link in AlVolo", contexts: ["link"] },
  { id: "alvolo-selection", title: "Salva la selezione in AlVolo", contexts: ["selection"] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create(m);
  });
});

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title,
    message,
  });
}

async function handle(info, tab) {
  try {
    if (info.menuItemId === "alvolo-link" && info.linkUrl) {
      await capture({ url: info.linkUrl });
    } else if (info.menuItemId === "alvolo-selection" && info.selectionText) {
      const src = tab?.url ? `\n\n— da ${tab.url}` : "";
      await capture({ text: info.selectionText + src });
    } else {
      await capture({ url: info.pageUrl || tab?.url });
    }
    notify("Salvato in AlVolo ✈️", "L'AI lo arricchirà in background.");
  } catch (e) {
    notify("Errore", String(e.message || e));
  }
}

chrome.contextMenus.onClicked.addListener(handle);
