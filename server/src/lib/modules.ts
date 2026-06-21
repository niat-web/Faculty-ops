// Admin-definable field modules (sections). Seeds the original 7 builtins once, then
// lets Ops add their own. Fields reference a module by `key`.
import { FieldModule } from "../models";
import { MODULE_LABEL, MODULE_ORDER } from "../enums";

let seeded = false;
export async function seedFieldModules() {
  if (seeded) return;
  if ((await FieldModule.countDocuments()) === 0) {
    await FieldModule.insertMany(MODULE_ORDER.map((key, i) => ({ key, label: MODULE_LABEL[key], order: i, builtin: true })));
  }
  seeded = true;
}

export async function listModules() {
  await seedFieldModules();
  const mods = await FieldModule.find().sort({ order: 1 }).lean();
  return mods.map((m: any) => ({ key: m.key, label: m.label, order: m.order, builtin: !!m.builtin }));
}

export async function moduleExists(key: string) {
  await seedFieldModules();
  return !!(await FieldModule.exists({ key }));
}

// Normalise a label into an enum-style module key (e.g. "Research Output" → "RESEARCH_OUTPUT").
export function moduleKeyFromLabel(label: string) {
  return String(label || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
