import { captureText, captureLink } from "../api";

// Offline capture queue for text/link notes (images/audio need connectivity).
// Persisted in localStorage and replayed when the device comes back online.

const KEY = "alvolo_offline_queue";

type Pending = { kind: "text" | "link"; value: string };

function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(q: Pending[]): void {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function enqueue(p: Pending): void {
  const q = read();
  q.push(p);
  write(q);
}

export function queuedCount(): number {
  return read().length;
}

/** Replay queued captures; returns how many were sent. Stops on the first failure. */
export async function flushQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  let q = read();
  let sent = 0;
  while (q.length) {
    const p = q[0];
    try {
      if (p.kind === "link") await captureLink(p.value);
      else await captureText(p.value);
    } catch {
      break; // still offline / server down — try again later
    }
    sent++;
    q = q.slice(1);
    write(q);
  }
  return sent;
}
