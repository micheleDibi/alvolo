import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Image as ImageIcon, ImagePlus, X, Zap } from "lucide-react";
import { useCaptureImage, useCaptureLink, useCaptureText } from "../api";

const URL_RE = /^https?:\/\/\S+$/i;

export default function Capture() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const capText = useCaptureText();
  const capLink = useCaptureLink();
  const capImage = useCaptureImage();
  const busy = capText.isPending || capLink.isPending || capImage.isPending;

  const submit = async () => {
    setErr(null);
    try {
      if (file) {
        await capImage.mutateAsync(file);
      } else {
        const value = text.trim();
        if (!value) {
          setErr("Scrivi qualcosa, incolla un link o scegli un'immagine.");
          return;
        }
        if (URL_RE.test(value)) await capLink.mutateAsync(value);
        else await capText.mutateAsync(value);
      }
      navigate("/");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
    <h1 className="large-title">Cattura</h1>
    <div className="capture">
      <textarea
        className="capture-text"
        placeholder="Scrivi una nota, incolla un link…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        autoFocus
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      {file ? (
        <div className="file-chip">
          <span className="file-chip-name">
            <ImageIcon size={18} aria-hidden />
            <span>{file.name}</span>
          </span>
          <button
            className="icon-btn"
            aria-label="Rimuovi immagine"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost file-btn" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={18} aria-hidden />
          Scegli o scatta una foto
        </button>
      )}

      {err && (
        <p className="card-error">{err}</p>
      )}

      <button className="btn btn-primary big" disabled={busy} onClick={submit}>
        <Zap size={18} aria-hidden />
        {busy ? "Catturo…" : "Cattura al volo"}
      </button>
      <p className="muted small">
        Il salvataggio è istantaneo. L'AI arricchisce in background.
      </p>
    </div>
    </>
  );
}
