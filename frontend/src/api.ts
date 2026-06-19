import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { getToken } from "./lib/auth";
import type {
  AskResponse,
  DigestResponse,
  ItemDetail,
  ItemList,
  ItemPatch,
  ItemQuery,
  Meta,
  StatsResponse,
} from "./types";
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
export async function listItems(
  query: ItemQuery = {},
  offset = 0,
  limit = 30,
): Promise<ItemList> {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  p.set("offset", String(offset));
  if (query.status) p.set("status", query.status);
  if (query.category) p.set("category", query.category);
  if (query.tag) p.set("tag", query.tag);
  if (query.q) p.set("q", query.q);
  if (query.has_todo) p.set("has_todo", "true");
  if (query.snoozed) p.set("snoozed", "true");
  if (query.sort) p.set("sort", query.sort);
  return (await apiFetch(`/api/items?${p.toString()}`)).json();
}

export async function fetchMeta(): Promise<Meta> {
  return (await apiFetch("/api/items/meta")).json();
}

export async function getItem(id: string): Promise<ItemDetail> {
  return (await apiFetch(`/api/items/${id}`)).json();
}

export async function patchItem(id: string, patch: ItemPatch): Promise<ItemDetail> {
  return (
    await apiFetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  ).json();
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

export async function fetchFileObjectUrl(id: string): Promise<string> {
  const blob = await (await apiFetch(`/api/items/${id}/file`)).blob();
  return URL.createObjectURL(blob);
}

export async function ask(question: string): Promise<AskResponse> {
  return (
    await apiFetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    })
  ).json();
}

export async function askItem(id: string, question?: string): Promise<AskResponse> {
  return (
    await apiFetch(`/api/items/${id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    })
  ).json();
}

export async function getDigest(days = 7): Promise<DigestResponse> {
  return (await apiFetch(`/api/digest?days=${days}`)).json();
}

export async function getStats(): Promise<StatsResponse> {
  return (await apiFetch("/api/stats")).json();
}

export async function exportData(format: "json" | "markdown"): Promise<Blob> {
  return (await apiFetch(`/api/export?format=${format}`)).blob();
}

// --- React Query hooks ----------------------------------------------------- //
const PENDING = new Set(["capturing", "processing"]);
const PAGE = 30;

/** Drop an item from every cached items list (infinite caches across all filters). */
function dropItemEverywhere(qc: QueryClient, id: string) {
  qc.setQueriesData<InfiniteData<ItemList>>({ queryKey: ["items"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((pg) => ({
        ...pg,
        items: pg.items.filter((i) => i.id !== id),
        total: Math.max(0, pg.total - 1),
      })),
    };
  });
}

export function useInfiniteItems(query: ItemQuery = {}) {
  return useInfiniteQuery({
    queryKey: ["items", query],
    queryFn: ({ pageParam }) => listItems(query, pageParam as number, PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    // Poll while anything is still being enriched; stop once everything settled.
    refetchInterval: (q) => {
      const pages = q.state.data?.pages;
      const busy = pages?.some((p) => p.items.some((i) => PENDING.has(i.status)));
      return busy ? 3000 : false;
    },
  });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: fetchMeta, staleTime: 10_000 });
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
    qc.invalidateQueries({ queryKey: ["meta"] });
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

/** Partial update (archive/unarchive, light edits). Archiving optimistically drops the row. */
export function usePatchItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemPatch }) => patchItem(id, patch),
    onMutate: async ({ id, patch }) => {
      if (patch.status === "archived") {
        await qc.cancelQueries({ queryKey: ["items"] });
        dropItemEverywhere(qc, id);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      qc.invalidateQueries({ queryKey: ["item"] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteItem,
    // Optimistically drop the row; invalidation on settle reconciles with the server.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      dropItemEverywhere(qc, id);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
    },
  });
}
