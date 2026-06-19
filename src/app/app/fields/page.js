import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { FieldDefinition, Instructor } from "@/models/index.js";
import { canManageSchema } from "@/lib/rbac.js";
import PageHeader from "@/components/PageHeader.js";
import FieldManager from "@/components/FieldManager.js";
import AddFieldButton from "@/components/AddFieldButton.js";

export default async function FieldsPage() {
  const user = await getCurrentUser();
  if (!canManageSchema(user)) redirect("/app");

  await connectDB();
  const defs = await FieldDefinition.find().sort({ archivedAt: 1, module: 1, createdAt: 1 }).lean();
  const instructors = await Instructor.find().select("name employeeId").sort({ employeeId: 1 }).lean();

  // Value counts per field key — computed in the DB (avoids shipping every
  // instructor's `values` object to the server just to tally them).
  const countAgg = await Instructor.aggregate([
    { $project: { kv: { $objectToArray: { $ifNull: ["$values", {}] } } } },
    { $unwind: "$kv" },
    { $group: { _id: "$kv.k", n: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(countAgg.map((c) => [c._id, c.n]));

  return (
    <div className="space-y-5">
      <PageHeader title="Dynamic Fields" subtitle="Add or retire data fields without a developer — apply to all instructors or a single one. Deletions are archived, never destroyed.">
        <AddFieldButton instructors={instructors.map((i) => ({ id: String(i._id), name: i.name, employeeId: i.employeeId }))} />
      </PageHeader>
      <FieldManager
        isOps={user.role === "OPS_ADMIN"}
        fields={defs.map((f) => ({
          id: String(f._id), key: f.key, label: f.label, module: f.module, type: f.type,
          visibility: f.visibility, scope: f.scope,
          options: f.options || [], min: f.min ?? null, max: f.max ?? null, pattern: f.pattern || null,
          instructorName: instructors.find((i) => String(i._id) === String(f.instructorId))?.name || null,
          valueCount: counts[f.key] || 0,
          archivedAt: f.archivedAt ? new Date(f.archivedAt).toISOString() : null,
          archiveReason: f.archiveReason || null,
        }))}
      />
    </div>
  );
}
