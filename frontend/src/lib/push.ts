import { pushKey, pushSubscribe, pushUnsubscribe } from "../api";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushState = { enabled: boolean; subscribed: boolean };

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return { enabled: false, subscribed: false };
  const cfg = await pushKey();
  if (!cfg.enabled || !cfg.key) return { enabled: false, subscribed: false };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { enabled: true, subscribed: Boolean(sub) };
}

/** Subscribe this device. Returns true on success. */
export async function subscribePush(): Promise<boolean> {
  const cfg = await pushKey();
  if (!cfg.enabled || !cfg.key) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(cfg.key) as BufferSource,
  });
  await pushSubscribe(sub.toJSON());
  return true;
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await pushUnsubscribe(sub.endpoint);
    await sub.unsubscribe();
  }
}
