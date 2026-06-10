import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDeleteItem, useItem, useRetryItem } from "../api";
import StatusBadge from "../components/StatusBadge";
import AuthImage from "../components/AuthImage";

export default function ItemDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, error } = useItem(id);
  const retry = useRetryItem();
  const del = useDeleteItem();
  const [showExtracted, setShowExtracted] = useState(false);

  if (isLoading) return <div className="empty">Carico…</div>;
  if (error) return <div className="empty">Errore: {(error as Error).message}</div>;
  if (!item) return <div className="empty">Non trovato.</div>;

  const onDelete = async () => {
    if (!confirm("Eliminare questo elemento?")) return;
    await del.mutateAsync(id);
    navigate("/");
  };

  return (
    <article className="detail">
      <Link to="/" className="back">
        ← Inbox
      </Link>

      <div className="detail-head">
        <StatusBadge status={item.status} />
        {item.category && <span className="cat">{item.category}</span>}
      </div>

      <h1 className="detail-title">{item.title || "Senza titolo"}</h1>

      {item.has_image && (
        <div className="detail-image">
          <AuthImage id={item.id} alt={item.title || "immagine"} className="full-image" />
        </div>
      )}

      {item.source_url && (
        <a className="source-link" href={item.source_url} target="_blank" rel="noreferrer">
          🔗 {item.source_url}
        </a>
      )}

      {item.status === "failed" && (
        <div className="failbox">
          <p>⚠ {item.error_message || "Arricchimento fallito."}</p>
          <button className="btn" disabled={retry.isPending} onClick={() => retry.mutate(id)}>
            {retry.isPending ? "Riprovo…" : "Riprova"}
          </button>
        </div>
      )}

      {item.summary && <p className="detail-summary">{item.summary}</p>}

      {item.key_points.length > 0 && (
        <section>
          <h2>Punti chiave</h2>
          <ul>
            {item.key_points.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </section>
      )}

      {item.deep_analysis && (
        <section>
          <h2>Approfondimento</h2>
          {item.deep_analysis.split("\n").filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}

      {item.related_ideas.length > 0 && (
        <section>
          <h2>Spunti correlati</h2>
          <ul>
            {item.related_ideas.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </section>
      )}

      {item.raw_text && item.content_type === "text" && (
        <section>
          <h2>Nota originale</h2>
          <p className="raw">{item.raw_text}</p>
        </section>
      )}

      {item.extracted_text && (
        <section>
          <button className="link-btn" onClick={() => setShowExtracted((v) => !v)}>
            {showExtracted ? "Nascondi" : "Mostra"} testo estratto
            {item.content_type === "image" ? " (OCR)" : ""}
          </button>
          {showExtracted && <pre className="extracted">{item.extracted_text}</pre>}
        </section>
      )}

      {item.tags.length > 0 && (
        <div className="tags">
          {item.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="detail-meta">
        <span>{new Date(item.created_at + "Z").toLocaleString()}</span>
        {item.model_used && <span> · {item.model_used}</span>}
        <span> · {item.source}</span>
      </div>

      <button className="btn btn-danger" disabled={del.isPending} onClick={onDelete}>
        {del.isPending ? "Elimino…" : "Elimina"}
      </button>
    </article>
  );
}
