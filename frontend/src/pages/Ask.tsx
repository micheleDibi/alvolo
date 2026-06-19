import { useState } from "react";
import { CalendarRange, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import AskBox from "../components/AskBox";
import { getDigest } from "../api";
import type { DigestResponse } from "../types";
import { Button } from "@/components/ui/button";

function Recap() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DigestResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setRes(await getDigest(7));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/60 glass p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-aurora text-white">
            <CalendarRange className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="font-display text-[15px] font-semibold text-foreground">
              Recap della settimana
            </p>
            <p className="text-xs text-muted-foreground">
              Un riassunto di cosa hai catturato negli ultimi 7 giorni.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={res ? "ghost" : "aurora"}
          disabled={busy}
          onClick={run}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {res ? "Rigenera" : "Genera"}
        </Button>
      </div>

      {err && (
        <p className="mt-3 flex items-center gap-2 text-sm text-rose-300" role="alert">
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />
          {err}
        </p>
      )}

      {res && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {res.item_count} elementi · ultimi {res.days} giorni
          </p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
            {res.recap}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Ask() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-gradient">
          Chiedi ad AlVolo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fai una domanda: cerco tra le tue catture e ti rispondo con le fonti.
        </p>
      </div>

      <Recap />

      <AskBox
        suggestions={[
          "Riassumi le idee di questa settimana",
          "Cosa avevo salvato sull'AI?",
          "Quali to-do ho in sospeso?",
        ]}
      />
    </div>
  );
}
