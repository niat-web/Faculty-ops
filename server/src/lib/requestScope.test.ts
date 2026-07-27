import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "../enums";
import { requestsListScope, canCommentOnRequest } from "./requestScope";

test("INSTRUCTOR cannot list edit requests", () => {
  assert.equal(requestsListScope({ id: "1", role: Role.INSTRUCTOR, email: "i@x.in", name: "I", managerId: null }), null);
});

test("OPS_ADMIN sees all requests", () => {
  const s = requestsListScope({ id: "1", role: Role.OPS_ADMIN, email: "o@x.in", name: "O", managerId: null }, "PENDING");
  assert.deepEqual(s, { q: { status: "PENDING" }, bq: { status: "PENDING" } });
});

test("CAPABILITY_MANAGER scoped to own requests", () => {
  const s = requestsListScope({ id: "cm1", role: Role.CAPABILITY_MANAGER, email: "c@x.in", name: "C", managerId: "sm1" });
  assert.deepEqual(s, { q: { requesterId: "cm1" }, bq: { requesterId: "cm1" } });
});

test("comment allowed for requester and approver only", () => {
  const req = { requesterId: "a", approverId: "b" };
  assert.equal(canCommentOnRequest({ id: "a", role: Role.CAPABILITY_MANAGER, email: "", name: "", managerId: null }, req), true);
  assert.equal(canCommentOnRequest({ id: "b", role: Role.SENIOR_MANAGER, email: "", name: "", managerId: null }, req), true);
  assert.equal(canCommentOnRequest({ id: "x", role: Role.INSTRUCTOR, email: "", name: "", managerId: null }, req), false);
  assert.equal(canCommentOnRequest({ id: "ops", role: Role.OPS_ADMIN, email: "", name: "", managerId: null }, req), true);
});
