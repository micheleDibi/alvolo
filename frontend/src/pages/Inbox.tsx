import { Link } from "react-router-dom";
import { Lock, AlertTriangle, Sparkles, Plus, Settings as SettingsIcon } from "lucide-react";
import { useItems } from "../api";
import { ApiError } from "../api";
import ItemCard from "../components/ItemCard";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";

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
  const { data, isLoading, error } = useItems();

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

  if (isLoading)
    return (
      <div className="space-y-3" aria-busy aria-label="Carico…">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );

  if (error)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Qualcosa è andato storto"
        hint={`Errore: ${(error as Error).message}`}
      />
    );

  if (!data || data.items.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-3">
      {data.items.map((item, i) => (
        <ItemCard key={item.id} item={item} index={i} />
      ))}
    </div>
  );
}
