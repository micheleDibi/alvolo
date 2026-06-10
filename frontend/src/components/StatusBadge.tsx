import type { ItemStatus } from "../types";

const LABELS: Record<ItemStatus, string> = {
  capturing: "in coda",
  processing: "elaboro…",
  done: "pronto",
  failed: "errore",
  archived: "archiviato",
};

export default function StatusBadge({ status }: { status: ItemStatus }) {
  const pending = status === "capturing" || status === "processing";
  return (
    <span className={`badge badge-${status}`}>
      {pending && <span className="spinner" aria-hidden />}
      {LABELS[status]}
    </span>
  );
}
