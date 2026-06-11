import { Link } from "react-router-dom";
import { Inbox as InboxIcon, KeyRound, Plus } from "lucide-react";
import { useItems } from "../api";
import { ApiError } from "../api";
import ItemCard from "../components/ItemCard";
import SkeletonList from "../components/Skeleton";

export default function Inbox() {
  const { data, isLoading, error } = useItems();

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="empty">
        <span className="empty-ico">
          <KeyRound size={26} aria-hidden />
        </span>
        <p className="empty-title">Token mancante o non valido</p>
        <p className="muted">Inseriscilo nelle Impostazioni per vedere la tua inbox.</p>
        <Link to="/settings" className="btn btn-primary">
          Vai alle Impostazioni
        </Link>
      </div>
    );
  }

  if (isLoading) return <SkeletonList />;

  if (error) return <div className="empty">Errore: {(error as Error).message}</div>;

  if (!data || data.items.length === 0) {
    return (
      <div className="empty">
        <span className="empty-ico">
          <InboxIcon size={26} aria-hidden />
        </span>
        <p className="empty-title">Niente qui, ancora</p>
        <p className="muted">Cattura uno screenshot, un link o un'idea al volo.</p>
        <Link to="/capture" className="btn btn-primary">
          <Plus size={18} aria-hidden />
          Cattura
        </Link>
      </div>
    );
  }

  return (
    <div className="list">
      {data.items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
