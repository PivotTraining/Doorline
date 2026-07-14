import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from "react";

// A finger/mouse signature pad. Draws with Pointer Events (works on touch
// and desktop), exports a trimmed PNG data URL. Parent calls ref.toDataURL()
// / ref.clear() / ref.isEmpty().
const SignaturePad = forwardRef(function SignaturePad({ height = 160 }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  // Size the canvas to its container at device pixel ratio for crisp lines.
  useEffect(() => {
    const c = canvasRef.current;
    const resize = () => {
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const down = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); canvasRef.current.setPointerCapture(e.pointerId); };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!dirty.current) { dirty.current = true; setEmpty(false); }
  };
  const up = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    isEmpty: () => !dirty.current,
    clear: () => {
      const c = canvasRef.current, ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      dirty.current = false; setEmpty(true);
    },
    toDataURL: () => (dirty.current ? canvasRef.current.toDataURL("image/png") : null),
  }));

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ width: "100%", height, border: "1px dashed var(--border)", borderRadius: 10, touchAction: "none", background: "#fff", display: "block" }}
      />
      {empty && <span className="muted" style={{ position: "absolute", left: 12, top: height / 2 - 10, pointerEvents: "none", fontSize: 13 }}>✍️ Sign here</span>}
    </div>
  );
});

export default SignaturePad;
