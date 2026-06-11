import { Link } from "react-router-dom";
import { Inbox as InboxIcon, KeyRound, Plus } from "lucide-react";
import { useItems, useDeleteItem } from "../api";
import { ApiError } from "../api";
import ItemCard from "../components/ItemCard";
import SwipeableRow from "../components/SwipeableRow";
import SkeletonList from "../components/Skeleton";

export default function Inbox() {
  const { data, isLoading, error } = useItems();
  const del = useDeleteItem();

  if (error instanceof ApiError && error.status === 401) {
    return (
      <>
        <h1 className="large-title">Inbox</h1>
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
      </>
    );
  }

  return (
    <>
      <h1 className="large-title">Inbox</h1>
      {isLoading ? (
        <SkeletonList />
      ) : error ? (
        <div className="empty">Errore: {(error as Error).message}</div>
      ) : !data || data.items.length === 0 ? (
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
      ) : (
        <div className="list">
          {data.items.map((item) => (
            <SwipeableRow key={item.id} onDelete={() => del.mutate(item.id)}>
              <ItemCard item={item} />
            </SwipeableRow>
          ))}
        </div>
      )}
    </>
  );
}
