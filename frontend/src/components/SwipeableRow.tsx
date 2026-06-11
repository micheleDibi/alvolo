import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Trash2 } from "lucide-react";

const ACTION_W = 84; // width of the revealed "Elimina" action
const OPEN_SNAP = ACTION_W * 0.5; // drag past this → snap open
const FULL_SWIPE = 0.5; // drag past this fraction of the row width → delete

/**
 * iOS-style swipe-to-delete. Dragging the row right→left reveals a red "Elimina"
 * button; tapping it (or a long full swipe) deletes. Vertical scrolling and the
 * normal tap-through navigation of the wrapped row keep working.
 */
export default function SwipeableRow({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: ReactNode;
}) {
  const [tx, setTx] = useState(0); // current translateX, always <= 0
  const [animate, setAnimate] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);

  const rootRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null); // pointer that owns the gesture
  const startX = useRef(0);
  const startY = useRef(0);
  const baseTx = useRef(0);
  const width = useRef(0);
  const decided = useRef(false);
  const dragging = useRef(false);
  const moved = useRef(false);

  const close = () => {
    setAnimate(true);
    setTx(0);
  };

  const remove = () => {
    if (removing) return;
    const h = rootRef.current?.offsetHeight ?? 0;
    setAnimate(true);
    setTx(-width.current);
    setMaxH(h); // lock current height, then collapse to 0 next frame
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setRemoving(true);
        setMaxH(0);
      }),
    );
    window.setTimeout(onDelete, 280);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activeId.current !== null) return; // ignore extra fingers
    activeId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    baseTx.current = tx;
    width.current = rootRef.current?.offsetWidth ?? 320;
    decided.current = false;
    dragging.current = false;
    moved.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (removing || e.pointerId !== activeId.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!decided.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided.current = true;
      dragging.current = Math.abs(dx) > Math.abs(dy);
      if (dragging.current) {
        rootRef.current?.setPointerCapture?.(e.pointerId);
        setAnimate(false);
      }
    }
    if (!dragging.current) return;
    moved.current = true;
    let next = baseTx.current + dx;
    if (next > 0) next = next * 0.2; // rubber-band past the closed position
    if (next < -width.current) next = -width.current;
    setTx(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeId.current) return;
    activeId.current = null;
    if (!dragging.current || removing) return;
    dragging.current = false;
    setAnimate(true);
    if (tx <= -width.current * FULL_SWIPE) {
      remove();
    } else {
      setTx(tx <= -OPEN_SNAP ? -ACTION_W : 0);
    }
  };

  // Swallow the click that follows a drag, and let a tap close an open row.
  const onClickCapture = (ev: React.MouseEvent) => {
    if (moved.current) {
      ev.preventDefault();
      ev.stopPropagation();
      moved.current = false;
    } else if (tx !== 0) {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  };

  return (
    <div
      className={`swipe ${removing ? "removing" : ""}`}
      ref={rootRef}
      style={maxH !== undefined ? { maxHeight: maxH } : undefined}
    >
      <button
        className="swipe-action"
        style={{ width: ACTION_W }}
        tabIndex={-1}
        aria-label="Elimina"
        onClick={remove}
      >
        <Trash2 size={20} aria-hidden />
        <span>Elimina</span>
      </button>
      <div
        className="swipe-track"
        style={{
          transform: `translateX(${tx}px)`,
          transition: animate ? "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
