import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchImageObjectUrl } from "../api";

/**
 * <img> can't carry an Authorization header, so we fetch the image through the
 * authenticated API client and render it from an object URL.
 */
export default function AuthImage({
  id,
  alt,
  className,
}: {
  id: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchImageObjectUrl(id)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setSrc(u);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (failed)
    return (
      <div
        className={cn(
          "skeleton grid aspect-[4/3] w-full place-items-center text-muted-foreground after:hidden",
          className,
        )}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
      </div>
    );
  if (!src) return <div className={cn("skeleton aspect-[4/3] w-full", className)} />;
  return <img src={src} alt={alt} className={cn("block", className)} loading="lazy" />;
}
