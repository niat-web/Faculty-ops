import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { Role } from "@/lib/enums.js";
import NewInstructorForm from "@/components/NewInstructorForm.js";

export default async function NewInstructorPage() {
  const user = await getCurrentUser();
  if (!canManageUsers(user)) redirect("/app");
  await connectDB();
  const cms = await User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name").sort({ name: 1 }).lean();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Add Instructor</h1>
      <NewInstructorForm cms={cms.map((c) => ({ id: String(c._id), name: c.name }))} />
    </div>
  );
}
