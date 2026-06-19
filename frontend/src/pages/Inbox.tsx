import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Lock,
  AlertTriangle,
  Sparkles,
  Plus,
  Search,
  X,
  Settings as SettingsIcon,
  SearchX,
} from "lucide-react";
import { useInfiniteItems, useMeta, useDeleteItem, usePatchItem, ApiError } from "../api";
import type { ItemSummary, ItemQuery } from "../types";
import ItemCard from "../components/ItemCard";
import SwipeableRow from "../components/SwipeableRow";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_CHIPS: { label: string; value?: string }[] = [
  { label: "Tutti", value: undefined },
  { label: "Pronti", value: "done" },
  { label: "Errori", value: "failed" },
  { label: "Archiviati", value: "archived" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "press shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-transparent bg-aurora text-white"
          : "border-border bg-elevated text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: typeof Lock;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-12 flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card/60 glass px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-elevated text-sky-300">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="font-display text-lg font-semibold text-foreground">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card/80 p-3">
      <Skeleton className="h-16 w-16 flex-none rounded-md" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-3.5 w-24 rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-full rounded" />
      </div>
    </div>
  );
}

export default function Inbox() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [todo, setTodo] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  // Debounce the search box into the query.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const query: ItemQuery = useMemo(
    () => ({ status: statusFilter, category, tag, q: q || undefined, has_todo: todo || undefined }),
    [statusFilter, category, tag, q, todo],
  );
  const hasFilter = Boolean(statusFilter || category || tag || q || todo);
  const inArchive = statusFilter === "archived";

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteItems(query);
  const meta = useMeta();
  const del = useDeleteItem();
  const patch = usePatchItem();

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  const archive = (item: ItemSummary) => {
    const prev = item.status;
    patch.mutate({ id: item.id, patch: { status: "archived" } });
    toast("Archiviato", {
      action: {
        label: "Annulla",
        onClick: () => patch.mutate({ id: item.id, patch: { status: prev } }),
      },
    });
  };

  const clearFilters = () => {
    setStatusFilter(undefined);
    setCategory(undefined);
    setTag(undefined);
    setTodo(false);
    setQInput("");
  };

  // Infinite scroll sentinel.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const FilterBar = (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Cerca nelle tue catture…"
          aria-label="Cerca"
          className="h-11 w-full rounded-full border border-input bg-surface pl-9 pr-9 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {qInput && (
          <button
            onClick={() => setQInput("")}
            aria-label="Pulisci ricerca"
            className="press absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_CHIPS.map((c) => (
          <Chip
            key={c.label}
            active={statusFilter === c.value}
            onClick={() => setStatusFilter(c.value)}
          >
            {c.label}
          </Chip>
        ))}
        <Chip active={todo} onClick={() => setTodo((v) => !v)}>
          Da fare
        </Chip>
        {(meta.data?.categories ?? []).map((c) => (
          <Chip
            key={`cat:${c.name}`}
            active={category === c.name}
            onClick={() => setCategory(category === c.name ? undefined : c.name)}
          >
            {c.name}
          </Chip>
        ))}
        {(meta.data?.tags ?? []).slice(0, 12).map((t) => (
          <Chip
            key={`tag:${t.name}`}
            active={tag === t.name}
            onClick={() => setTag(tag === t.name ? undefined : t.name)}
          >
            #{t.name}
          </Chip>
        ))}
      </div>
    </div>
  );

  // 401 has no useful filter bar.
  if (error instanceof ApiError && error.status === 401) {
    return (
      <EmptyState
        icon={Lock}
        title="Token mancante o non valido"
        hint="Aggiungi il tuo token di accesso per vedere e catturare gli elementi."
        action={
          <Link to="/settings" className={buttonVariants({ variant: "aurora" })}>
            <SettingsIcon className="h-4 w-4" aria-hidden />
            Vai alle Impostazioni
          </Link>
        }
      />
    );
  }

  return (
    <div>
      {FilterBar}

      {isLoading ? (
        <div className="space-y-3" aria-busy aria-label="Carico…">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Qualcosa è andato storto"
          hint={`Errore: ${(error as Error).message}`}
        />
      ) : items.length === 0 ? (
        hasFilter ? (
          <EmptyState
            icon={SearchX}
            title="Nessun risultato"
            hint="Nessun elemento corrisponde ai filtri attivi."
            action={
              <button
                onClick={clearFilters}
                className={buttonVariants({ variant: "ghost" })}
              >
                Pulisci filtri
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Niente qui, ancora."
            hint="Cattura uno screenshot, un link o un'idea al volo."
            action={
              <Link to="/capture" className={buttonVariants({ variant: "aurora" })}>
                <Plus className="h-4 w-4" aria-hidden />
                Cattura
              </Link>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <SwipeableRow
              key={item.id}
              onDelete={() => del.mutate(item.id)}
              onArchive={inArchive ? undefined : () => archive(item)}
            >
              <ItemCard item={item} index={Math.min(i, 8)} />
            </SwipeableRow>
          ))}
          <div ref={sentinel} className="h-8" aria-hidden />
          {isFetchingNextPage && (
            <p className="py-2 text-center text-sm text-muted-foreground">Carico altro…</p>
          )}
        </div>
      )}
    </div>
  );
}
