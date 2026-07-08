import { useEffect, useRef, useState } from "react";

const THRESHOLD = 64;

// Wrap a page's content to add a native-feeling pull-to-refresh gesture.
// Only engages when the page is scrolled to the very top, so it never
// hijacks normal scrolling once you're mid-page.
export default function PullToRefresh({ onRefresh, children }) {
  const [dist, setDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);

  useEffect(() => {
    const atTop = () => (document.scrollingElement || document.documentElement).scrollTop <= 0;
    const onStart = (e) => { startY.current = atTop() ? e.touches[0].clientY : null; };
    const onMove = (e) => {
      if (startY.current == null) return;
      const d = e.touches[0].clientY - startY.current;
      if (d > 0 && atTop()) setDist(Math.min(d, THRESHOLD * 1.6));
      else { startY.current = null; setDist(0); }
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      const shouldRefresh = dist >= THRESHOLD;
      startY.current = null;
      setDist(0);
      if (shouldRefresh) { setRefreshing(true); try { await onRefresh?.(); } finally { setRefreshing(false); } }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dist, onRefresh]);

  return (
    <div>
      {(dist > 0 || refreshing) && (
        <div className="pull-indicator" style={{ opacity: Math.min(1, dist / THRESHOLD) || (refreshing ? 1 : 0) }}>
          {refreshing ? "↻ Refreshing…" : dist >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}
      {children}
    </div>
  );
}
