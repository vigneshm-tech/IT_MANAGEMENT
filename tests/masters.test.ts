import assert from "node:assert/strict";
import { test } from "node:test";
import { clientTimestamps } from "../lib/clients";
import { industryNameError, normaliseIndustryName, INDUSTRY_SEED } from "../lib/industries";
import {
  customFieldModuleError,
  customFieldNameError,
  normaliseCustomFieldName,
  CUSTOM_FIELD_MODULE_OPTIONS,
} from "../lib/custom-fields";

/* -------------------------------------------------------------------------- */
/*  Industries                                                                */
/* -------------------------------------------------------------------------- */

const INDUSTRIES = [
  { id: "IND-1", name: "Manufacturing" },
  { id: "IND-2", name: "Healthcare" },
];

test("industry names are normalised before they are compared", () => {
  assert.equal(normaliseIndustryName("  Health   care "), "Health care");
  assert.equal(normaliseIndustryName("\tRetail\n"), "Retail");
});

test("the industry register rejects blanks, long names and duplicates", () => {
  assert.match(String(industryNameError(" a ")), /at least 2 characters/);
  assert.match(String(industryNameError("x".repeat(61))), /under 60/);
  assert.match(String(industryNameError(" manufacturing ", INDUSTRIES)), /already in the industry/);
  assert.equal(industryNameError("Logistics", INDUSTRIES), null);
  // Renaming a row to its own name is not a clash.
  assert.equal(industryNameError("manufacturing", INDUSTRIES, { ignoreId: "IND-1" }), null);
});

test("the industry seed covers the industries the client register used", () => {
  for (const name of ["Manufacturing", "Logistics", "Healthcare", "Retail"]) {
    assert.ok((INDUSTRY_SEED as readonly string[]).includes(name), `${name} missing from the seed`);
  }
});

/* -------------------------------------------------------------------------- */
/*  Custom fields                                                             */
/* -------------------------------------------------------------------------- */

const FIELDS = [
  { id: "CF-1", name: "Contract reference", module: "clients" },
  { id: "CF-2", name: "Contract reference", module: "tickets" },
];

test("custom field names are trimmed and unique inside a module", () => {
  assert.equal(normaliseCustomFieldName("  Contract    reference "), "Contract reference");
  assert.match(String(customFieldNameError(" a ")), /at least 2 characters/);
  assert.match(String(customFieldNameError("x".repeat(61))), /under 60/);

  assert.match(
    String(customFieldNameError("contract reference", FIELDS, { module: "clients" })),
    /already exists for Clients/,
  );
  // The same wording may exist for another module.
  assert.equal(customFieldNameError("Contract reference", FIELDS, { module: "servers" }), null);
  assert.equal(
    customFieldNameError("Contract reference", FIELDS, { module: "clients", ignoreId: "CF-1" }),
    null,
  );
});

test("a custom field must name a real module", () => {
  assert.match(String(customFieldModuleError("")), /Choose the module/);
  assert.match(String(customFieldModuleError("payroll")), /valid module/);
  assert.equal(customFieldModuleError("clients"), null);
  assert.ok(CUSTOM_FIELD_MODULE_OPTIONS.some((option) => option.value === "tickets"));
});

/* -------------------------------------------------------------------------- */
/*  Repository                                                                */
/* -------------------------------------------------------------------------- */

test("industries can be added, renamed, retired and deleted", async () => {
  const {
    createIndustry,
    deleteIndustry,
    listActiveIndustries,
    listIndustries,
    setIndustryStatus,
    updateIndustry,
  } = await import("../lib/records/repository");

  const user = {
    id: "test-user",
    name: "Test Manager",
    email: "test.manager@tasktornado.dev",
    role: "it_manager",
  } as never;

  const created = await createIndustry(user, "  Marine   engineering ");
  assert.equal(created.name, "Marine engineering");
  assert.equal(created.status, "active");
  assert.ok((await listActiveIndustries()).includes("Marine engineering"));

  assert.equal(await updateIndustry(created.id, "Marine services"), true);
  assert.equal(
    (await listIndustries()).find((industry) => industry.id === created.id)?.name,
    "Marine services",
  );

  assert.equal(await setIndustryStatus(created.id, "inactive"), true);
  assert.ok(!(await listActiveIndustries()).includes("Marine services"));

  assert.equal(await deleteIndustry(created.id), true);
  assert.equal(
    (await listIndustries()).find((industry) => industry.id === created.id),
    undefined,
  );
});

test("custom fields keep their module and can move between modules", async () => {
  const {
    createCustomField,
    deleteCustomField,
    listCustomFields,
    setCustomFieldStatus,
    updateCustomField,
  } = await import("../lib/records/repository");

  const user = {
    id: "test-user",
    name: "Test Manager",
    email: "test.manager@tasktornado.dev",
    role: "it_manager",
  } as never;

  const created = await createCustomField(user, "  Contract   reference ", "clients");
  assert.equal(created.name, "Contract reference");
  assert.equal(created.module, "clients");
  assert.match(created.id, /^CF-\d+$/);

  assert.equal(await updateCustomField(created.id, "Contract reference", "tickets"), true);
  const moved = (await listCustomFields()).find((field) => field.id === created.id);
  assert.equal(moved?.module, "tickets");

  assert.equal(await setCustomFieldStatus(created.id, "inactive"), true);
  assert.equal(
    (await listCustomFields()).find((field) => field.id === created.id)?.status,
    "inactive",
  );

  assert.equal(await deleteCustomField(created.id), true);
  assert.equal(
    (await listCustomFields()).find((field) => field.id === created.id),
    undefined,
  );
});

test("editing a client rewrites its fields and moves the last-update stamp", async () => {
  const { createClientRecord, listClients, updateClientRecord } = await import(
    "../lib/records/repository"
  );

  const user = {
    id: "test-user",
    name: "Test Manager",
    email: "test.manager@tasktornado.dev",
    role: "it_manager",
  } as never;

  const created = await createClientRecord(user, {
    name: "Harbour Freight",
    code: "HBF",
    industry: "Logistics",
    primary: {
      name: "Sana Ali",
      email: "sana@harbour.example",
      mobileCountry: "IN",
      mobile: "9876500022",
    },
    secondary: { name: "", email: "", mobileCountry: "IN", mobile: "" },
    ownerRole: "l2_support_lead",
    assignedUserId: "u-l2-lead",
    assignedUserName: "Karthik Raman",
  });

  const createdAt = created.createdAt;
  const firstUpdate = created.updatedAt;

  assert.equal(
    await updateClientRecord(created.id, {
      name: "Harbour Freight Co",
      code: "HBF",
      industry: "Marine services",
      primary: {
        name: "Sana Ali",
        email: "sana@harbour.example",
        mobileCountry: "AE",
        mobile: "501234567",
      },
      secondary: {
        name: "Omar Khan",
        email: "omar@harbour.example",
        mobileCountry: "IN",
        mobile: "9876500033",
      },
      ownerRole: "l2_support_manager",
      assignedUserId: "u-l2-manager",
      assignedUserName: "Divya Suresh",
    }),
    true,
  );

  const stored = (await listClients()).find((client) => client.id === created.id);
  assert.equal(stored?.name, "Harbour Freight Co");
  assert.equal(stored?.industry, "Marine services");
  assert.equal(stored?.primary.mobileCountry, "AE");
  assert.equal(stored?.secondary.name, "Omar Khan");
  assert.equal(stored?.assignedUserName, "Divya Suresh");
  // The demo store hands back the same object, so compare against the values
  // captured before the edit.
  assert.equal(stored?.createdAt, createdAt, "the created stamp never moves");
  assert.ok(
    new Date(String(stored?.updatedAt)) > new Date(firstUpdate),
    "the last update moves past the created stamp",
  );
  assert.equal(clientTimestamps(String(stored?.createdAt), String(stored?.updatedAt)).touched, true);

  assert.equal(await updateClientRecord("CL-9999", stored as never), false);
});
