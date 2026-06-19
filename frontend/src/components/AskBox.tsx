import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Loader2, FileText, AlertTriangle } from "lucide-react";
import { ask, askItem } from "../api";
import type { AskResponse } from "../types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function AskBox({
  itemId,
  placeholder,
  suggestions,
}: {
  itemId?: string;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      setRes(itemId ? await askItem(itemId, text) : await ask(text));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={2}
        placeholder={placeholder ?? "Chiedi qualcosa alla tua inbox…"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send(q);
          }
        }}
      />

      {suggestions && !res && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s);
                send(s);
              }}
              className="press rounded-full border border-border bg-elevated px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <Button
        variant="aurora"
        size="lg"
        className="w-full"
        disabled={busy || !q.trim()}
        onClick={() => send(q)}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Penso…
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" aria-hidden />
            Chiedi
          </>
        )}
      </Button>

      {err && (
        <p className="flex items-center gap-2 text-sm text-rose-300" role="alert">
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />
          {err}
        </p>
      )}

      {res && (
        <div className="rounded-lg border border-border bg-card/70 glass p-4">
          <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">
            {res.answer}
          </p>
          {!itemId && res.sources.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Fonti</p>
              <div className="flex flex-col gap-1.5">
                {res.sources.map((s) => (
                  <Link
                    key={s.id}
                    to={`/item/${s.id}`}
                    className="flex items-center gap-2 text-sm text-brand hover:underline underline-offset-4"
                  >
                    <FileText className="h-3.5 w-3.5 flex-none" aria-hidden />
                    <span className="truncate">{s.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
