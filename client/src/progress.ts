// Tiny global in-flight-request tracker that drives the top loading bar.
// Every api call start()s and done()s; the bar shows whenever count > 0.
let active = 0;
const subs = new Set<(on: boolean) => void>();
const emit = () => { const on = active > 0; subs.forEach((f) => f(on)); };

export const progress = {
  start() { active++; emit(); },
  done() { active = Math.max(0, active - 1); emit(); },
  subscribe(fn: (on: boolean) => void) { subs.add(fn); fn(active > 0); return () => { subs.delete(fn); }; },
};
