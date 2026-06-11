/** Placeholder cards shown while the inbox list is loading. */
export default function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="list" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="sk sk-thumb" />
          <div className="sk-body">
            <div className="sk sk-line" style={{ width: "40%" }} />
            <div className="sk sk-line" style={{ width: "85%" }} />
            <div className="sk sk-line" style={{ width: "60%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
