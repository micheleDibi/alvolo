import { useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Share2, Smartphone } from "lucide-react";
import { getToken, setToken } from "../lib/auth";

export default function Settings() {
  const [token, setTok] = useState(getToken());
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"token" | "endpoint" | null>(null);
  const [reveal, setReveal] = useState(false);

  const origin = window.location.origin;
  const captureUrl = `${origin}/api/capture`;

  const save = () => {
    setToken(token.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const copy = async (value: string, which: "token" | "endpoint") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="settings">
      <section>
        <h2>
          <KeyRound size={18} aria-hidden />
          Token di accesso
        </h2>
        <p className="muted small">
          Incolla qui il token (CAPTURE_TOKEN del server). Viene salvato solo su questo
          dispositivo.
        </p>
        <div className="input-wrap">
          <input
            className="input"
            type={reveal ? "text" : "password"}
            placeholder="token…"
            value={token}
            onChange={(e) => setTok(e.target.value)}
            autoComplete="off"
          />
          <button
            className="input-toggle"
            aria-label={reveal ? "Nascondi token" : "Mostra token"}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={save}>
            {saved ? <Check size={18} aria-hidden /> : null}
            {saved ? "Salvato" : "Salva token"}
          </button>
          {token && (
            <button className="btn btn-ghost" onClick={() => copy(token, "token")}>
              {copied === "token" ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
              {copied === "token" ? "Copiato" : "Copia token"}
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>
          <Smartphone size={18} aria-hidden />
          Installa sull'iPhone
        </h2>
        <ol className="howto">
          <li>Apri questa pagina in Safari.</li>
          <li>
            Tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>.
          </li>
          <li>Apri l'icona AlVolo: è a tutto schermo, come un'app.</li>
        </ol>
      </section>

      <section>
        <h2>
          <Share2 size={18} aria-hidden />
          Cattura dal menu Condividi (Shortcut)
        </h2>
        <p className="muted small">
          Crea uno Shortcut iOS che invia screenshot, link e testo a questo endpoint. Le
          istruzioni complete sono in <code>shortcut/AlVolo.md</code>.
        </p>
        <label className="field-label">Endpoint</label>
        <div className="row">
          <code className="code-pill">{captureUrl}</code>
          <button className="btn btn-ghost" onClick={() => copy(captureUrl, "endpoint")}>
            {copied === "endpoint" ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            {copied === "endpoint" ? "Copiato" : "Copia"}
          </button>
        </div>
        <label className="field-label">Header di autenticazione</label>
        <code className="code-pill">Authorization: Bearer &lt;token&gt;</code>
      </section>
    </div>
  );
}
