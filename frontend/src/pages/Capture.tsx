import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImagePlus, X, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { useCaptureImage, useCaptureLink, useCaptureText } from "../api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-4">
      <Textarea
        placeholder="Scrivi una nota, incolla un link…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        autoFocus
        className="min-h-[160px] text-[17px] leading-relaxed"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card glass px-4 py-3">
          <span className="flex min-w-0 items-center gap-2.5 text-sm">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-aurora text-white">
              <ImagePlus className="h-4 w-4" aria-hidden />
            </span>
            <span className="truncate text-foreground">{file.name}</span>
          </span>
          <Button
            variant="link"
            size="none"
            className="flex-none gap-1 text-muted-foreground hover:text-rose-300"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            <X className="h-4 w-4" aria-hidden />
            rimuovi
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="h-14 justify-start gap-3 border-dashed text-muted-foreground hover:text-foreground"
          onClick={() => fileRef.current?.click()}
        >
          <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-elevated text-sky-300">
            <ImagePlus className="h-4 w-4" aria-hidden />
          </span>
          Scegli un'immagine o un PDF
        </Button>
      )}

      {err && (
        <p className="flex items-center gap-2 text-sm text-rose-300" role="alert">
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />
          {err}
        </p>
      )}

      <Button
        variant="aurora"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={submit}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Catturo…
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" aria-hidden />
            Cattura al volo
          </>
        )}
      </Button>

      <p className="text-center text-[13px] text-muted-foreground">
        Il salvataggio è istantaneo. L'AI arricchisce in background.
      </p>
    </div>
  );
}
