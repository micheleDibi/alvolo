import { useEffect, useState } from "react";
import { fetchFileObjectUrl } from "../api";

/** Audio can't carry an auth header on a bare <audio src>, so fetch it as a blob. */
export default function AudioPlayer({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchFileObjectUrl(id)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setSrc(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (!src) return <div className="skeleton h-12 w-full rounded-lg" />;
  return <audio controls src={src} className="w-full" />;
}
