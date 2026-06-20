import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  KeyRound,
  Smartphone,
  Share2,
  Palette,
  Monitor,
  Sun,
  Moon,
  BarChart3,
  Download,
  ChevronRight,
  Bell,
} from "lucide-react";
import { getToken, setToken } from "../lib/auth";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";
import {
  getPushState,
  subscribePush,
  unsubscribePush,
  isPushSupported,
  type PushState,
} from "../lib/push";
import { exportData } from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Chiaro", icon: Sun },
  { value: "dark", label: "Scuro", icon: Moon },
];

const STEPS = [
  <>Apri questa pagina in Safari.</>,
  <>
    Tocca <b className="text-foreground">Condividi</b> →{" "}
    <b className="text-foreground">Aggiungi alla schermata Home</b>.
  </>,
  <>Apri l'icona AlVolo: è a tutto schermo, come un'app.</>,
];

export default function Settings() {
  const [token, setTok] = useState(getToken());
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    getPushState()
      .then(setPush)
      .catch(() => setPush({ enabled: false, subscribed: false }));
  }, []);

  const pickTheme = (v: ThemePref) => {
    setTheme(v);
    setThemePref(v);
  };

  const togglePush = async () => {
    if (!push) return;
    setPushBusy(true);
    try {
      if (push.subscribed) {
        await unsubscribePush();
        setPush({ ...push, subscribed: false });
      } else if (await subscribePush()) {
        setPush({ ...push, subscribed: true });
      }
    } catch {
      /* ignore */
    } finally {
      setPushBusy(false);
    }
  };

  const doExport = async (format: "json" | "markdown") => {
    try {
      const blob = await exportData(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "json" ? "alvolo-export.json" : "alvolo-export.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const origin = window.location.origin;
  const captureUrl = `${origin}/api/capture`;

  const save = () => {
    setToken(token.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-sky-300" aria-hidden />
            Aspetto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => pickTheme(t.value)}
                className={cn(
                  "press flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3",
                  theme === t.value
                    ? "border-brand/50 bg-elevated text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-5 w-5" aria-hidden />
                <span className="text-[13px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-sky-300" aria-hidden />
            Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isPushSupported() ? (
            <p className="text-[13px] text-muted-foreground">
              Le notifiche push non sono supportate da questo browser.
            </p>
          ) : push && !push.enabled ? (
            <p className="text-[13px] text-muted-foreground">
              Non configurate sul server (imposta le chiavi VAPID nel <code>.env</code>).
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                Avviso quando un elemento è pronto o scatta un promemoria.
              </p>
              <Button
                variant={push?.subscribed ? "ghost" : "aurora"}
                disabled={!push || pushBusy}
                onClick={togglePush}
              >
                {push?.subscribed ? "Disattiva" : "Attiva"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-sky-300" aria-hidden />
            Token di accesso
          </CardTitle>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Incolla qui il token (CAPTURE_TOKEN del server). Viene salvato solo su
            questo dispositivo.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              placeholder="token…"
              value={token}
              onChange={(e) => setTok(e.target.value)}
              autoComplete="off"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Nascondi token" : "Mostra token"}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground hover:text-foreground press"
            >
              {show ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="aurora" onClick={save}>
              {saved ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Salvato
                </>
              ) : (
                "Salva token"
              )}
            </Button>
            {token && (
              <Button variant="ghost" onClick={() => copy(token)}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    Copiato
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden />
                    Copia token
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-300" aria-hidden />
            Dati e statistiche
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link
            to="/stats"
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3 text-[15px] text-foreground press hover:border-white/15"
          >
            <span className="flex items-center gap-2.5">
              <BarChart3 className="h-4 w-4 text-sky-300" aria-hidden />
              Statistiche e costo AI
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={() => doExport("json")}>
              <Download className="h-4 w-4" aria-hidden />
              Esporta JSON
            </Button>
            <Button variant="ghost" onClick={() => doExport("markdown")}>
              <Download className="h-4 w-4" aria-hidden />
              Esporta Markdown
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-sky-300" aria-hidden />
            Installa sull'iPhone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-aurora text-[12px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="leading-relaxed text-foreground/90">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-sky-300" aria-hidden />
            Cattura dal menu Condividi (Shortcut)
          </CardTitle>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Crea uno Shortcut iOS che invia screenshot, link e testo a questo
            endpoint. Le istruzioni complete sono in{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-[12px] text-sky-300">
              shortcut/AlVolo.md
            </code>
            .
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">Endpoint</label>
          <div className="flex items-center gap-2.5">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground/90">
              {captureUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copia endpoint"
              onClick={() => copy(captureUrl)}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <label className="mt-2 text-xs font-medium text-muted-foreground">
            Header di autenticazione
          </label>
          <code className="break-all rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground/90">
            Authorization: Bearer &lt;token&gt;
          </code>
        </CardContent>
      </Card>
    </div>
  );
}
