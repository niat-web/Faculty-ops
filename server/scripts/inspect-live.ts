// READ-ONLY snapshot of the live Atlas state, to ground the reconcile. No writes.
import "dotenv/config";
import mongoose from "mongoose";
import { Instructor, User } from "../src/models";
import { maybeDecrypt } from "../src/lib/crypto";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection;
  console.log("DB:", db.name);

  const totalInstr = await Instructor.countDocuments();
  const byStatus = await Instructor.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  const byDept = await Instructor.aggregate([{ $group: { _id: "$values.department", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  const unassigned = await Instructor.countDocuments({ currentManagerId: null });

  console.log("\n=== INSTRUCTORS ===", totalInstr);
  console.log("By status:", JSON.stringify(byStatus));
  console.log("Unassigned (no CM):", unassigned);
  console.log("\nBy department:");
  for (const d of byDept) console.log(`  ${d.n}\t${d._id ?? "(none)"}`);

  const byRole = await User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  console.log("\n=== USERS ===");
  console.log("By role:", JSON.stringify(byRole));
  const sm = await User.find({ role: "SENIOR_MANAGER" }).select("name email managerId").lean();
  const cm = await User.find({ role: "CAPABILITY_MANAGER" }).select("name email managerId active").lean();
  console.log("\nSenior Managers:", sm.map((s: any) => s.name));
  console.log("\nCapability Managers (", cm.length, "):");
  for (const c of cm as any[]) console.log(`  ${c.name}  active=${c.active}  mgr=${c.managerId ?? "—"}`);

  // Is there a "Rahul Attuluri" anywhere?
  const rahul = await User.find({ name: /rahul attuluri/i }).select("name role email").lean();
  console.log("\nRahul Attuluri user(s):", JSON.stringify(rahul));

  // sample instructor: show all stored value keys
  const sample: any = await Instructor.findOne({ "values.department": /Delivery Support/i }).lean()
    || await Instructor.findOne().lean();
  if (sample) {
    console.log("\n=== SAMPLE INSTRUCTOR ===", sample.employeeId, sample.name, "| status:", sample.status);
    const vals: Record<string, any> = {};
    for (const [k, v] of Object.entries(sample.values || {})) vals[k] = maybeDecrypt(v as any);
    console.log("value keys:", Object.keys(vals).sort().join(", "));
    console.log("values:", JSON.stringify(vals, null, 1));
    console.log("exit:", JSON.stringify(sample.exit));
    console.log("moduleStatus keys:", Object.keys(sample.moduleStatus || {}).length);
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
