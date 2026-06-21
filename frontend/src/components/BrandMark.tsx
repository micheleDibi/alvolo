/** AlVolo brand mark — a paper airplane ("al volo"). Uses currentColor (white on
 * the gradient chip); the two-tone faces give the origami fold without extra strokes. */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M84 18 L47 52 L44 84 Z" fill="currentColor" fillOpacity="0.82" />
      <path d="M84 18 L14 40 L47 52 Z" fill="currentColor" />
    </svg>
  );
}
