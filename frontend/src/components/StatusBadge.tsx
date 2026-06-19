import type { ItemStatus } from "../types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<ItemStatus, string> = {
  capturing: "in coda",
  processing: "elaboro…",
  done: "pronto",
  failed: "errore",
  archived: "archiviato",
};

type BadgeVariant = "muted" | "brand" | "ok" | "danger" | "warn";

const VARIANT: Record<ItemStatus, BadgeVariant> = {
  capturing: "brand",
  processing: "brand",
  done: "ok",
  failed: "danger",
  archived: "muted",
};

export default function StatusBadge({ status }: { status: ItemStatus }) {
  const pending = status === "capturing" || status === "processing";
  return (
    <Badge variant={VARIANT[status]}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full bg-current", pending && "pulse-dot")}
        aria-hidden
      />
      {LABELS[status]}
    </Badge>
  );
}
