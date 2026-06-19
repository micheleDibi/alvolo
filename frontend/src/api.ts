import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getToken } from "./lib/auth";
import type { ItemDetail, ItemList } from "./types";
export type { ItemList } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail || detail;
    } catch {
      /* ignore non-json bodies */
    }
    throw new ApiError(resp.status, detail);
  }
  return resp;
}

// --- raw calls ------------------------------------------------------------ //
export async function listItems(): Promise<ItemList> {
  return (await apiFetch("/api/items")).json();
}

export async function getItem(id: string): Promise<ItemDetail> {
  return (await apiFetch(`/api/items/${id}`)).json();
}

export async function captureText(text: string) {
  return apiFetch("/api/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source: "app" }),
  });
}

export async function captureLink(url: string) {
  return apiFetch("/api/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, source: "app" }),
  });
}

export async function captureImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  form.append("source", "app");
  return apiFetch("/api/capture", { method: "POST", body: form });
}

export async function retryItem(id: string) {
  return apiFetch(`/api/items/${id}/retry`, { method: "POST" });
}

export async function deleteItem(id: string) {
  return apiFetch(`/api/items/${id}`, { method: "DELETE" });
}

export async function fetchImageObjectUrl(id: string): Promise<string> {
  const blob = await (await apiFetch(`/api/items/${id}/image`)).blob();
  return URL.createObjectURL(blob);
}

// --- React Query hooks ----------------------------------------------------- //
const PENDING = new Set(["capturing", "processing"]);

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: listItems,
    // Poll while anything is still being enriched; stop once everything settled.
    refetchInterval: (query) => {
      const data = query.state.data;
      const busy = data?.items.some((i) => PENDING.has(i.status));
      return busy ? 3000 : false;
    },
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ["item", id],
    queryFn: () => getItem(id),
    refetchInterval: (query) =>
      query.state.data && PENDING.has(query.state.data.status) ? 3000 : false,
  });
}

export function useInvalidateItems() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["items"] });
  };
}

export function useCaptureText() {
  const invalidate = useInvalidateItems();
  return useMutation({ mutationFn: captureText, onSuccess: invalidate });
}

export function useCaptureLink() {
  const invalidate = useInvalidateItems();
  return useMutation({ mutationFn: captureLink, onSuccess: invalidate });
}

export function useCaptureImage() {
  const invalidate = useInvalidateItems();
  return useMutation({ mutationFn: captureImage, onSuccess: invalidate });
}

export function useRetryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: retryItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item"] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteItem,
    // Optimistically drop the row, snapshot for rollback, reconcile when settled.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      const prev = qc.getQueryData<ItemList>(["items"]);
      if (prev) {
        qc.setQueryData<ItemList>(["items"], {
          ...prev,
          items: prev.items.filter((i) => i.id !== id),
          total: Math.max(0, prev.total - 1),
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["items"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
