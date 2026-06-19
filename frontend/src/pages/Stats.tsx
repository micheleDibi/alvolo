import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { getStats } from "../api";
import type { StatsResponse } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  capturing: "in coda",
  processing: "elaboro",
  done: "pronti",
  failed: "errori",
  archived: "archiviati",
};

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 glass p-3 text-center">
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export default function Stats() {
  const [s, setS] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then(setS)
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err)
    return <div className="mt-12 text-center text-muted-foreground">Errore: {err}</div>;

  if (!s)
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-40 rounded" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );

  const maxDay = Math.max(1, ...s.per_day.map((d) => d.count));

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/settings"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Impostazioni
      </Link>

      <h1 className="font-display text-2xl font-bold tracking-tight text-gradient">
        Statistiche
      </h1>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Elementi" value={fmt(s.total)} />
        <Kpi label="Token AI" value={fmt(s.tokens_input + s.tokens_output)} />
        <Kpi label="Costo AI" value={`$${s.estimated_cost_usd.toFixed(2)}`} hint="stima" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-300" aria-hidden />
            Catture · ultimi 14 giorni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-28 items-end gap-1">
            {s.per_day.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-aurora"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count ? 3 : 0 }}
                  title={`${d.date}: ${d.count}`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per stato</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(s.by_status).map(([k, v]) => (
            <span
              key={k}
              className="rounded-full bg-elevated px-3 py-1 text-[13px] text-foreground"
            >
              {STATUS_LABEL[k] || k}: <b>{v}</b>
            </span>
          ))}
        </CardContent>
      </Card>

      {s.top_categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Categorie principali</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {s.top_categories.map((c) => {
              const max = s.top_categories[0].count || 1;
              return (
                <div key={c.name} className="flex items-center gap-2">
                  <span className="w-24 flex-none truncate text-[13px] text-muted-foreground">
                    {c.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-aurora"
                      style={{ width: `${(c.count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 flex-none text-right text-[13px] text-foreground">
                    {c.count}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
