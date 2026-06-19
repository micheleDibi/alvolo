import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Link2,
  AlertTriangle,
  RotateCw,
  ListChecks,
  ListTodo,
  Sparkles,
  Lightbulb,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Check,
  Network,
  Trash2,
  Archive,
  ArchiveRestore,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { useDeleteItem, useItem, usePatchItem, useRetryItem } from "../api";
import type { ContentType } from "../types";
import StatusBadge from "../components/StatusBadge";
import AuthImage from "../components/AuthImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<ContentType, typeof FileText> = {
  text: FileText,
  link: Link2,
  image: ImageIcon,
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 text-center text-muted-foreground">{children}</div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof ListChecks;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-2 flex items-center gap-2 font-display text-[15px] font-semibold text-foreground">
      <Icon className="h-4 w-4 text-sky-300" aria-hidden />
      {children}
    </h2>
  );
}

export default function ItemDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, error } = useItem(id);
  const retry = useRetryItem();
  const del = useDeleteItem();
  const patch = usePatchItem();
  const [showExtracted, setShowExtracted] = useState(false);

  if (isLoading) return <Centered>Carico…</Centered>;
  if (error) return <Centered>Errore: {(error as Error).message}</Centered>;
  if (!item) return <Centered>Non trovato.</Centered>;

  const onDelete = async () => {
    if (!confirm("Eliminare questo elemento?")) return;
    await del.mutateAsync(id);
    navigate("/");
  };

  const archived = item.status === "archived";
  const onArchiveToggle = async () => {
    const prev = item.status;
    await patch.mutateAsync({
      id,
      patch: { status: archived ? "done" : "archived" },
    });
    if (!archived) {
      toast("Archiviato", {
        action: {
          label: "Annulla",
          onClick: () => patch.mutate({ id, patch: { status: prev } }),
        },
      });
    }
    navigate("/");
  };

  return (
    <article className="flex flex-col gap-4">
      <Link
        to="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Inbox
      </Link>

      <div className="flex items-center gap-2.5">
        <StatusBadge status={item.status} />
        {item.category && <Badge variant="muted">{item.category}</Badge>}
      </div>

      <h1 className="font-display text-[26px] font-bold leading-tight text-foreground">
        {item.title || "Senza titolo"}
      </h1>

      {item.has_image && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <AuthImage
            id={item.id}
            alt={item.title || "immagine"}
            className="max-h-[60vh] w-full rounded-none object-contain"
          />
        </div>
      )}

      {item.source_url && (
        <a
          className="inline-flex items-center gap-2 break-all text-sm text-brand hover:underline underline-offset-4"
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
        >
          <Link2 className="h-4 w-4 flex-none" aria-hidden />
          {item.source_url}
        </a>
      )}

      {item.status === "failed" && (
        <div className="flex flex-col gap-3 rounded-lg border border-rose-400/30 bg-rose-400/10 p-4">
          <p className="flex items-start gap-2 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
            {item.error_message || "Arricchimento fallito."}
          </p>
          <Button
            variant="default"
            size="sm"
            className="w-fit"
            disabled={retry.isPending}
            onClick={() => retry.mutate(id)}
          >
            <RotateCw
              className={cn("h-4 w-4", retry.isPending && "animate-spin")}
              aria-hidden
            />
            {retry.isPending ? "Riprovo…" : "Riprova"}
          </Button>
        </div>
      )}

      {item.summary && (
        <p className="text-[17px] leading-relaxed text-foreground/90">
          {item.summary}
        </p>
      )}

      {item.action_items.length > 0 && (
        <section>
          <SectionTitle icon={ListTodo}>Da fare</SectionTitle>
          <ul className="space-y-1">
            {item.action_items.map((a, i) => (
              <li key={i}>
                <button
                  onClick={() =>
                    patch.mutate({
                      id,
                      patch: { action_items: item.action_items.filter((_, j) => j !== i) },
                    })
                  }
                  className="group flex w-full items-start gap-2.5 rounded-md py-1 text-left text-[15px] leading-snug text-foreground/90 press"
                >
                  <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border border-border text-transparent transition group-hover:border-emerald-400 group-hover:text-emerald-400">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>{a}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.key_points.length > 0 && (
        <section>
          <SectionTitle icon={ListChecks}>Punti chiave</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-foreground/90 marker:text-sky-400">
            {item.key_points.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </section>
      )}

      {item.deep_analysis && (
        <section>
          <SectionTitle icon={Sparkles}>Approfondimento</SectionTitle>
          <div className="space-y-2 leading-relaxed text-foreground/90">
            {item.deep_analysis
              .split("\n")
              .filter(Boolean)
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        </section>
      )}

      {item.related_ideas.length > 0 && (
        <section>
          <SectionTitle icon={Lightbulb}>Spunti correlati</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-foreground/90 marker:text-sky-400">
            {item.related_ideas.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </section>
      )}

      {item.raw_text && item.content_type === "text" && (
        <section>
          <SectionTitle icon={ScrollText}>Nota originale</SectionTitle>
          <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">
            {item.raw_text}
          </p>
        </section>
      )}

      {item.extracted_text && (
        <section>
          <Button
            variant="link"
            size="none"
            className="gap-1.5"
            onClick={() => setShowExtracted((v) => !v)}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                showExtracted && "rotate-180",
              )}
              aria-hidden
            />
            {showExtracted ? "Nascondi" : "Mostra"} testo estratto
            {item.content_type === "image" ? " (OCR)" : ""}
          </Button>
          {showExtracted && (
            <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-[13px] leading-relaxed text-muted-foreground">
              {item.extracted_text}
            </pre>
          )}
        </section>
      )}

      {item.related.length > 0 && (
        <section>
          <SectionTitle icon={Network}>Correlati</SectionTitle>
          <div className="space-y-2">
            {item.related.map((r) => {
              const RIcon = TYPE_ICON[r.content_type] ?? FileText;
              return (
                <Link
                  key={r.id}
                  to={`/item/${r.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 glass px-3 py-2.5 press hover:border-white/15"
                >
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-elevated text-sky-300">
                    <RIcon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                    {r.title}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-brand/12 px-2.5 py-0.5 text-[11px] font-medium text-sky-300"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="tnum text-xs text-muted-foreground">
        <span>{new Date(item.created_at + "Z").toLocaleString()}</span>
        {item.model_used && <span> · {item.model_used}</span>}
        <span> · {item.source}</span>
      </div>

      <div className="flex gap-2.5">
        <Button
          variant="default"
          className="flex-1"
          disabled={patch.isPending}
          onClick={onArchiveToggle}
        >
          {archived ? (
            <>
              <ArchiveRestore className="h-4 w-4" aria-hidden />
              Ripristina
            </>
          ) : (
            <>
              <Archive className="h-4 w-4" aria-hidden />
              Archivia
            </>
          )}
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          disabled={del.isPending}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {del.isPending ? "Elimino…" : "Elimina"}
        </Button>
      </div>
    </article>
  );
}
