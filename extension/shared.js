// Shared helpers for the AlVolo browser extension (MV3).

/** Read the configured endpoint + token from sync storage. */
export async function getConfig() {
  const { endpoint = "", token = "" } = await chrome.storage.sync.get(["endpoint", "token"]);
  return { endpoint: endpoint.replace(/\/+$/, ""), token };
}

/** POST a capture to the configured AlVolo server. Throws on failure. */
export async function capture(payload) {
  const { endpoint, token } = await getConfig();
  if (!endpoint) throw new Error("Endpoint non configurato (apri le Opzioni).");
  const resp = await fetch(`${endpoint}/api/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...payload, source: "extension" }),
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`${resp.status} ${detail}`);
  }
  return resp.json();
}
