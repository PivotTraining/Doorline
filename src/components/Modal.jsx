import { useEffect } from "react";

// Lightweight modal. Click backdrop or press Escape to close.
export default function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal="true">
        <div className="head">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}
