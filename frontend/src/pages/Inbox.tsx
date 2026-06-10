import { Link } from "react-router-dom";
import { useItems } from "../api";
import { ApiError } from "../api";
import ItemCard from "../components/ItemCard";

export default function Inbox() {
  const { data, isLoading, error } = useItems();

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="empty">
        <p>🔒 Token mancante o non valido.</p>
        <Link to="/settings" className="btn">
          Vai alle Impostazioni
        </Link>
      </div>
    );
  }

  if (isLoading) return <div className="empty">Carico…</div>;

  if (error) return <div className="empty">Errore: {(error as Error).message}</div>;

  if (!data || data.items.length === 0) {
    return (
      <div className="empty">
        <p>Niente qui, ancora.</p>
        <p className="muted">Cattura uno screenshot, un link o un'idea al volo.</p>
        <Link to="/capture" className="btn">
          ＋ Cattura
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
