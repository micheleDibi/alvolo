import { Link } from "react-router-dom";
import {
  FileText,
  Link2,
  Image as ImageIcon,
  File as FileIcon,
  Mic,
  AlertTriangle,
  ListTodo,
} from "lucide-react";
import type { ContentType, ItemSummary } from "../types";
import StatusBadge from "./StatusBadge";
import AuthImage from "./AuthImage";

const TYPE_ICON: Record<ContentType, typeof FileText> = {
  text: FileText,
  link: Link2,
  image: ImageIcon,
  pdf: FileIcon,
  audio: Mic,
};

export default function ItemCard({
  item,
  index = 0,
}: {
  item: ItemSummary;
  index?: number;
}) {
  const pending = item.status === "capturing" || item.status === "processing";
  const title =
    item.title || (pending ? "Sto arricchendo…" : item.source_url || "Senza titolo");
  const TypeIcon = TYPE_ICON[item.content_type] ?? FileText;

  return (
    <Link
      to={`/item/${item.id}`}
      style={{ "--i": index } as React.CSSProperties}
      className="animate-in group flex gap-3 rounded-lg border border-border bg-card/80 glass p-3 press hover:border-white/15 hover:shadow-glow"
    >
      {item.has_image && (
        <AuthImage
          id={item.id}
          alt={title}
          className="h-16 w-16 flex-none rounded-md object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className="grid h-6 w-6 flex-none place-items-center rounded-md bg-aurora text-white"
            aria-hidden
          >
            <TypeIcon className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
          <StatusBadge status={item.status} />
          {item.action_items.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              <ListTodo className="h-3 w-3" aria-hidden />
              {item.action_items.length}
            </span>
          )}
        </div>

        <h3 className="font-display text-[16px] font-semibold leading-tight text-foreground">
          {title}
        </h3>

        {item.summary && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {item.summary}
          </p>
        )}

        {item.status === "failed" && item.error_message && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5 flex-none" aria-hidden />
            <span className="line-clamp-1">{item.error_message}</span>
          </p>
        )}

        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-sky-300"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
