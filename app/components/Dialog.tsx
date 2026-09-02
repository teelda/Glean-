"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type DialogProps = {
  /** Screen-reader name; also rendered as the visible heading. */
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** "panel" is the right-anchored drawer; "modal" is centred. */
  variant?: "modal" | "panel";
  className?: string;
  closeLabel?: string;
};

/**
 * One dialog for every overlay in the app.
 *
 * Previously each overlay was a bare <div>: no role, no accessible name, no
 * Escape, no focus trap, the page scrolled underneath, and focus was dropped
 * on <body> when it closed.
 */
export function Dialog({ title, eyebrow, onClose, children, footer, variant = "modal", className = "", closeLabel }: DialogProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPad = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    const first = surfaceRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? surfaceRef.current)?.focus();

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPad;
      // Hand focus back to whatever opened the dialog.
      returnFocusTo.current?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(surfaceRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter(element => element.offsetParent !== null || element === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onClose]);

  return <div
    className={`overlay overlay-${variant}`}
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`${variant === "panel" ? "dialog-panel" : "modal"} ${className}`}
      onKeyDown={onKeyDown}
    >
      <header>
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button type="button" aria-label={closeLabel ?? `Close ${title.toLowerCase()}`} onClick={onClose}><X size={20}/></button>
      </header>
      {children}
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}
