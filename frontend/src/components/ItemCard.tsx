import { Link } from "react-router-dom";
import { Image as ImageIcon, Link2, PenLine, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ItemSummary } from "../types";
import StatusBadge from "./StatusBadge";
import AuthImage from "./AuthImage";

const TYPE_ICON: Record<string, LucideIcon> = {
  text: PenLine,
  link: Link2,
  image: ImageIcon,
};

export default function ItemCard({ item }: { item: ItemSummary }) {
  const pending = item.status === "capturing" || item.status === "processing";
  const title =
    item.title || (pending ? "Sto arricchendo…" : item.source_url || "Senza titolo");
  const TypeIcon = TYPE_ICON[item.content_type];

  return (
    <Link to={`/item/${item.id}`} className="card">
      {item.has_image && (
        <div className="card-thumb">
          <AuthImage id={item.id} alt={title} className="thumb" />
        </div>
      )}
      <div className="card-body">
        <div className="card-head">
          {TypeIcon && (
            <span className="type-ico" aria-hidden>
              <TypeIcon size={15} />
            </span>
          )}
          <StatusBadge status={item.status} />
        </div>
        <h3 className="card-title">{title}</h3>
        {item.summary && <p className="card-summary">{item.summary}</p>}
        {item.status === "failed" && item.error_message && (
          <p className="card-error">
            <TriangleAlert size={14} aria-hidden />
            {item.error_message}
          </p>
        )}
        {item.tags.length > 0 && (
          <div className="tags">
            {item.tags.slice(0, 4).map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
