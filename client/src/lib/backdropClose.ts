import { type MouseEvent } from "react";

/** Close on backdrop click only — not when the user drags out of the dialog (mousedown on backdrop). */
export function backdropClick(onClose: () => void) {
  return (e: MouseEvent) => { if (e.target === e.currentTarget) onClose(); };
}
