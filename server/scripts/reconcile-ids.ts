/**
 * Fix Employee IDs for the 33 names the user supplied.
 *  - canonical ID = the REAL NW… id from Sheet31 if one exists, else the NWX-… placeholder.
 *  - if a name has duplicate records (NWX + real), keep the MORE COMPLETE row, set its id to the
 *    canonical id, and delete the other.
 *  - if a name has only the NWX record but a real id exists → rename it to the real id.
 *  - if genuinely blank in the sheet → keep the NWX placeholder (no blank ids).
 *
 * Default = DRY RUN. Pass --apply to commit.
 */
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import Papa from "papaparse";
import { Instructor } from "../src/models";

const APPLY = process.argv.includes("--apply");
const SHEET = "C:/Users/NxtWave/Downloads/Copy of NIAT Academics Master Data - Sheet31.csv";

const NWX: [string, string][] = [
  ["NWX-arati.yadav-2", "Arati Yadav"], ["NWX-aryan.vashishtha-16", "Aryan Vashishtha"], ["NWX-bhushan.patil-3", "Bhushan Patil"],
  ["NWX-biradar.maheshwari-13", "Biradar Maheshwari"], ["NWX-bolladi.keerthi-26", "Bolladi Keerthi"], ["NWX-chaitali.charandas.daware-33", "Chaitali Charandas Daware"],
  ["NWX-chanamallu.kaushik.raj-4", "CHANAMALLU KAUSHIK RAJ"], ["NWX-dangeti.saatwik.prasad.babu-19", "Dangeti Saatwik Prasad Babu"], ["NWX-devika.rani.j-5", "Devika Rani J"],
  ["NWX-dheeksha.devaraj-30", "Dheeksha Devaraj"], ["NWX-dr.mahender.reddy-1", "Dr. Mahender Reddy"], ["NWX-govindwar.naga.lasya-32", "Govindwar Naga Lasya"],
  ["NWX-jaimin.maheshbhai.damor-18", "Jaimin Maheshbhai Damor"], ["NWX-janamoni.shyamala-6", "Janamoni Shyamala"], ["NWX-jersan.jayabandi-24", "Jersan Jayabandi"],
  ["NWX-kancham.guru.yogeswar-31", "Kancham Guru Yogeswar"], ["NWX-kaushik.gohain.bora-27", "Kaushik Gohain Bora"], ["NWX-kavya.chalamalasetty-25", "Kavya Chalamalasetty"],
  ["NWX-killada.sai.kumar-14", "KILLADA SAI KUMAR"], ["NWX-koppuravuri.m.v.sivanaga.satyanarayana-21", "Koppuravuri M V Sivanaga Satyanarayana"], ["NWX-m.pavan.kalyan.varma-20", "M Pavan Kalyan Varma"],
  ["NWX-partha.jyoti.cheleng-7", "Partha Jyoti Cheleng"], ["NWX-pavan.mittapalli-29", "Pavan Mittapalli"], ["NWX-prashant.sahu-8", "Prashant Sahu"],
  ["NWX-pruthvi.m.c-23", "Pruthvi M C"], ["NWX-raavi.varun.guptha-22", "Raavi Varun Guptha"], ["NWX-reddem.yaswanthreddy-9", "Reddem Yaswanthreddy"],
  ["NWX-sandeep.patro-10", "Sandeep Patro"], ["NWX-sayantani.banerjee-17", "Sayantani Banerjee"], ["NWX-shiwali-11", "Shiwali"],
  ["NWX-shruti.sharma-15", "Shruti Sharma"], ["NWX-sneha.tripathi-12", "Sneha Tripathi"], ["NWX-yuvasri.venkat-28", "Yuvasri venkat"],
];

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function score(r: any): number {
  let s = 0;
  if (r.email) s++; if (r.campus) s++; if (r.uid) s++; if (r.currentManagerId) s++;
  s += Object.keys(r.values || {}).length;
  const ex = r.exit || {}; for (const k of ["typeOfExit", "reason", "detailedReason", "lastWorkingDay"]) if (ex[k]) s++;
  return s;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log(`\nID RECONCILE ${APPLY ? ">>> APPLY <<<" : "(dry run)"}  db=${mongoose.connection.name}\n${"=".repeat(60)}`);

  // Real NW… ids from Sheet31 (skip blank / NA / NWX). name(normalized) → real id.
  const rows = (Papa.parse(fs.readFileSync(SHEET, "utf8"), { skipEmptyLines: true }).data as string[][]).slice(1);
  const realMap = new Map<string, string>();
  for (const r of rows) {
    const id = String(r[0] || "").trim(); const nm = norm(r[1] || "");
    if (nm && /^NW\d/i.test(id) && !realMap.has(nm)) realMap.set(nm, id.toUpperCase());
  }

  // Load all instructors, group by normalized name.
  const all: any[] = await Instructor.find().select("employeeId name email campus uid currentManagerId values exit").lean();
  const byName = new Map<string, any[]>();
  for (const r of all) { const k = norm(r.name); (byName.get(k) || byName.set(k, []).get(k)!).push(r); }

  let renames = 0, deletes = 0, creates = 0, noops = 0;
  const ops: any[] = [];

  for (const [nwxId, name] of NWX) {
    const key = norm(name);
    const real = realMap.get(key);
    const canonical = real || nwxId;
    const recs = (byName.get(key) || []).slice().sort((a, b) => score(b) - score(a));

    if (recs.length === 0) {
      creates++;
      console.log(`  + CREATE ${canonical}  ${name}`);
      if (APPLY) ops.push({ insertOne: { document: { employeeId: canonical, name, status: "ONBOARDING", values: {} } } });
      continue;
    }
    const survivor = recs[0];
    const losers = recs.slice(1);
    for (const l of losers) {
      deletes++;
      console.log(`  - DELETE dup ${l.employeeId}  ${name}  (score ${score(l)} < ${score(survivor)})`);
      if (APPLY) ops.push({ deleteOne: { filter: { _id: l._id } } });
    }
    if (survivor.employeeId !== canonical) {
      renames++;
      console.log(`  ~ RENAME ${survivor.employeeId} → ${canonical}  ${name}${real ? "  (real id)" : "  (NWX placeholder)"}`);
      if (APPLY) ops.push({ updateOne: { filter: { _id: survivor._id }, update: { $set: { employeeId: canonical } } } });
    } else {
      noops++;
    }
  }

  console.log(`\nSUMMARY: renames=${renames}, dup deletes=${deletes}, creates=${creates}, already-ok=${noops}`);
  if (APPLY && ops.length) {
    // Deletes must run before renames (avoid unique-id collision when a survivor takes a loser's real id).
    const dels = ops.filter((o) => o.deleteOne);
    const rest = ops.filter((o) => !o.deleteOne);
    if (dels.length) await Instructor.bulkWrite(dels, { ordered: false });
    if (rest.length) { try { await Instructor.bulkWrite(rest, { ordered: false }); } catch (e: any) { console.log("rename/insert skips:", (e?.writeErrors || []).length); } }
    console.log(`✓ applied (${dels.length} deletes, ${rest.length} renames/creates)`);
  } else if (!APPLY) {
    console.log(`(dry run) — re-run with --apply to commit.`);
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
