import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

// One buffered field edit (not yet submitted).
export type BatchItem = {
  instructorId: string;
  instructorName: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
};

type BatchEditCtx = {
  active: boolean;                       // batch-edit mode on?
  scopedIds: string[];                   // instructors the current batch is scoped to (from multi-select)
  items: BatchItem[];                    // buffered edits
  count: number;
  start: (instructorIds: string[]) => void;
  cancel: () => void;
  /** Buffer (or update / clear) one field edit. Pass newValue === oldValue to drop it. */
  setEdit: (item: BatchItem) => void;
  /** Current buffered value for a field, or undefined if none. */
  getEdit: (instructorId: string, fieldKey: string) => BatchItem | undefined;
  /** Submit the whole batch with a single reason. Returns the new batch id. */
  submit: (reason: string) => Promise<{ id: string; count: number; instructors: number }>;
};

const Ctx = createContext<BatchEditCtx | null>(null);
const keyOf = (instructorId: string, fieldKey: string) => `${instructorId}::${fieldKey}`;

export function BatchEditProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [scopedIds, setScopedIds] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, BatchItem>>({});

  const start = useCallback((instructorIds: string[]) => {
    setScopedIds(instructorIds);
    setMap({});
    setActive(true);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    setScopedIds([]);
    setMap({});
  }, []);

  const setEdit = useCallback((item: BatchItem) => {
    setMap((m) => {
      const k = keyOf(item.instructorId, item.fieldKey);
      const next = { ...m };
      // Reverting to the original value removes the buffered change entirely.
      if (String(item.newValue ?? "") === String(item.oldValue ?? "")) delete next[k];
      else next[k] = item;
      return next;
    });
  }, []);

  const getEdit = useCallback((instructorId: string, fieldKey: string) => map[keyOf(instructorId, fieldKey)], [map]);

  const items = useMemo(() => Object.values(map), [map]);

  const submit = useCallback(async (reason: string) => {
    const payload = items.map((it) => ({ instructorId: it.instructorId, fieldKey: it.fieldKey, newValue: it.newValue }));
    const r = await api.post("/requests/batch", { reason, items: payload });
    const instructors = new Set(items.map((i) => i.instructorId)).size;
    const count = items.length;
    setActive(false);
    setScopedIds([]);
    setMap({});
    return { id: r.id, count, instructors };
  }, [items]);

  const value: BatchEditCtx = { active, scopedIds, items, count: items.length, start, cancel, setEdit, getEdit, submit };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBatchEdit() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBatchEdit must be used within BatchEditProvider");
  return ctx;
}
