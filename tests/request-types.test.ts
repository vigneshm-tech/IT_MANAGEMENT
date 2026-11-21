import assert from "node:assert/strict";
import { test } from "node:test";
import {
  freeRequestTypeId,
  isActiveRequestType,
  normaliseRequestTypeName,
  requestTypeLabel,
  requestTypeLabels,
  requestTypeNameError,
  requestTypeOptions,
  requestTypeSlug,
  REQUEST_TYPE_LEGACY_IDS,
  REQUEST_TYPE_SEED,
} from "../lib/request-types";
import { approvalItems, requestItem } from "../lib/approvals/history";
import type { ApprovalRecord } from "../lib/records/repository";

const REGISTER = [
  { id: "change", name: "Change" },
  { id: "access", name: "Access" },
  { id: "patch", name: "Patch exception" },
  { id: "purchase", name: "Purchase" },
];

function approval(id: string, category: string): ApprovalRecord {
  return {
    id,
    title: `Request ${id}`,
    category,
    requesterId: "u-arun",
    requesterName: "Arun Prakash",
    requesterRole: "it_engineer",
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    note: "",
    createdAt: "2026-11-10T10:00:00.000Z",
  };
}

test("request type names are trimmed and their inner runs collapsed", () => {
  assert.equal(normaliseRequestTypeName("  Vendor   onboarding "), "Vendor onboarding");
  assert.equal(normaliseRequestTypeName("\tFirewall\n"), "Firewall");
});

test("a request type id is a slug of its name", () => {
  assert.equal(requestTypeSlug("Vendor onboarding"), "vendor-onboarding");
  assert.equal(requestTypeSlug("  Café & Bakery!  "), "cafe-bakery");
  assert.equal(requestTypeSlug("!!!"), "");
});

test("a new type takes the first free id, so neighbours never collide", () => {
  assert.equal(freeRequestTypeId("Vendor onboarding", REGISTER), "vendor-onboarding");
  assert.equal(
    freeRequestTypeId("Access", REGISTER),
    "access-2",
    "an existing id must not be reused",
  );
  assert.equal(freeRequestTypeId("   ", REGISTER), "request-type");
});

test("the register rejects short, long and duplicate names but allows a self-rename", () => {
  assert.match(String(requestTypeNameError(" a ")), /at least 2 characters/);
  assert.match(String(requestTypeNameError("x".repeat(41))), /under 40/);
  assert.match(String(requestTypeNameError(" access ", REGISTER)), /already in the register/);
  assert.equal(requestTypeNameError("Vendor onboarding", REGISTER), null);
  // Renaming a row to its own name (any casing) is not a clash.
  assert.equal(requestTypeNameError("ACCESS", REGISTER, { ignoreId: "access" }), null);
});

test("the form only offers active types, in register order", () => {
  const options = requestTypeOptions([
    { id: "change", name: "Change", status: "active" },
    { id: "purchase", name: "Purchase", status: "inactive" },
    { id: "vendor-onboarding", name: "Vendor onboarding", status: "active" },
  ]);
  assert.deepEqual(options, [
    { value: "change", label: "Change" },
    { value: "vendor-onboarding", label: "Vendor onboarding" },
  ]);
});

test("an inactive or unknown id is not offered by the form", () => {
  const types = [
    { id: "change", name: "Change", status: "active" },
    { id: "purchase", name: "Purchase", status: "inactive" },
  ];
  assert.equal(isActiveRequestType("change", types), true);
  assert.equal(isActiveRequestType("purchase", types), false);
  assert.equal(isActiveRequestType("retired-type", types), false);
});

test("a stored id resolves to the register's current wording", () => {
  const renamed = [{ id: "purchase", name: "Hardware purchase" }];
  assert.equal(requestTypeLabel("purchase", renamed), "Hardware purchase");
  // Without the row (deleted type) the id is humanised rather than left blank.
  assert.equal(requestTypeLabel("vendor-onboarding"), "Vendor onboarding");
  assert.equal(requestTypeLabel("change", REGISTER), "Change");
  assert.equal(requestTypeLabel(""), "Request");
});

test("a label map is built from the register, one entry per id", () => {
  assert.deepEqual(requestTypeLabels(REGISTER), {
    change: "Change",
    access: "Access",
    patch: "Patch exception",
    purchase: "Purchase",
  });
});

test("the seeds keep the ids approvals were already filed under", () => {
  assert.deepEqual(REQUEST_TYPE_LEGACY_IDS, ["change", "access", "patch", "purchase"]);
  assert.deepEqual(
    REQUEST_TYPE_SEED.map((type) => type.name),
    ["Change", "Access", "Patch exception", "Purchase"],
  );
});

test("renaming a type relabels the approvals filed under it, without touching them", () => {
  const stored = approval("AP-1", "purchase");
  const labels = requestTypeLabels([{ id: "purchase", name: "Hardware purchase" }]);

  assert.equal(stored.category, "purchase", "the stored id must not change on rename");
  assert.equal(requestItem(stored).type, "Purchase", "no register still reads sensibly");
  assert.equal(requestItem(stored, labels).type, "Hardware purchase");
});

test("a type added in Masters shows on the ledger under its own name", () => {
  const labels = requestTypeLabels([{ id: "vendor-onboarding", name: "Vendor onboarding" }]);
  const items = approvalItems([approval("AP-7", "vendor-onboarding")], [], labels);
  assert.equal(items[0].type, "Vendor onboarding");
});
