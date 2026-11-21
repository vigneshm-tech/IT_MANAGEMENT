import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientCodeError,
  clientFormError,
  clientNameError,
  clientTimestamps,
  deriveClientCode,
  normaliseClientCode,
} from "../lib/clients";
import {
  COUNTRIES,
  countryByDial,
  countryByIso,
  countryIsoError,
  formatPhone,
  mobileError,
  searchCountries,
} from "../lib/countries";

/* -------------------------------------------------------------------------- */
/*  Country codes                                                             */
/* -------------------------------------------------------------------------- */

test("the country list is complete, sorted and keyed by ISO code", () => {
  assert.ok(COUNTRIES.length > 200, `expected a full list, got ${COUNTRIES.length}`);
  assert.equal(new Set(COUNTRIES.map((country) => country.iso)).size, COUNTRIES.length);

  const india = countryByIso("in");
  assert.equal(india?.dial, "+91");
  assert.equal(india?.name, "India");
  assert.equal(countryByDial("+44")?.dial, "+44");
  assert.equal(countryByIso("zz"), undefined);
  // Multi-line rows in the source data must not be skipped.
  assert.equal(countryByIso("AE")?.dial, "+971");
  assert.equal(countryByIso("SA")?.dial, "+966");
  assert.equal(countryByIso("US")?.dial, "+1");
  assert.equal(countryIsoError(""), "Choose the country code for the mobile number.");
  assert.equal(countryIsoError("ZZ"), "Choose a country code from the list.");
  assert.equal(countryIsoError("IN"), null);
});

test("searching matches name, ISO code and dial code", () => {
  assert.equal(searchCountries("india")[0].iso, "IN");
  assert.equal(searchCountries("IN").some((country) => country.iso === "IN"), true);
  assert.ok(searchCountries("+971").some((country) => country.iso === "AE"));
  assert.ok(searchCountries("971").some((country) => country.iso === "AE"));
  assert.deepEqual(searchCountries("zzzzz"), []);
  // An empty query still opens with options rather than a blank list.
  assert.ok(searchCountries("", 10).length === 10);
});

test("mobile numbers keep digits only and are formatted with the dial code", () => {
  assert.equal(mobileError(""), null);
  assert.equal(mobileError("   "), null);
  assert.match(String(mobileError("12345")), /at least 6 digits/);
  assert.match(String(mobileError("1".repeat(16))), /at most 15 digits/);
  assert.equal(mobileError("+91 98400-12345"), null);
  assert.equal(formatPhone("IN", "9840012345"), "+91 98400 12345");
  assert.equal(formatPhone("IN", ""), "");
  assert.equal(formatPhone("ZZ", "9840012345"), "9840012345");
});

/* -------------------------------------------------------------------------- */
/*  Client fields                                                             */
/* -------------------------------------------------------------------------- */

const GOOD = {
  name: "Acme Manufacturing",
  code: "ACME",
  industry: "Manufacturing",
  primary: { name: "Ritu Shah", email: "ritu@acme.com", mobileCountry: "IN", mobile: "9840012345" },
  secondary: { name: "", email: "", mobileCountry: "IN", mobile: "" },
};

test("short codes are upper-cased and can be derived from the name", () => {
  assert.equal(normaliseClientCode(" acme "), "ACME");
  assert.equal(normaliseClientCode("acme/in-01"), "ACME/IN-01");
  assert.equal(normaliseClientCode("acme corp!"), "ACMECORP");
  assert.equal(deriveClientCode("Northwind Logistics"), "NORTHW");
  assert.equal(deriveClientCode("  Acme  "), "ACME");
  assert.equal(normaliseClientCode("x".repeat(40)).length, 20);
});

test("the client name and code rules match the form limits", () => {
  assert.match(String(clientNameError("A")), /at least 2 characters/);
  assert.match(String(clientNameError("x".repeat(161))), /under 160/);
  assert.equal(clientNameError("Acme Manufacturing"), null);
  assert.equal(clientCodeError(""), null);
  assert.equal(clientCodeError("ACME-01"), null);
  assert.match(String(clientCodeError("ACME CORP")), /letters, digits/);
});

test("a complete client passes and each bad field is caught", () => {
  assert.equal(clientFormError(GOOD), null);

  assert.match(String(clientFormError({ ...GOOD, name: "A" })), /client name/);
  assert.match(
    String(
      clientFormError({
        ...GOOD,
        primary: { ...GOOD.primary, email: "ritu@" },
      }),
    ),
    /Primary contact: enter a valid email address/,
  );
  assert.match(
    String(
      clientFormError({
        ...GOOD,
        secondary: { name: "Vikram", email: "", mobileCountry: "IN", mobile: "12" },
      }),
    ),
    /Secondary contact: enter a mobile number/,
  );
  assert.match(
    String(
      clientFormError({
        ...GOOD,
        primary: { ...GOOD.primary, mobileCountry: "ZZ" },
      }),
    ),
    /choose a country code from the list/,
  );
});

test("contacts are optional, but a half-filled one is still checked", () => {
  assert.equal(
    clientFormError({
      ...GOOD,
      primary: { name: "", email: "", mobileCountry: "IN", mobile: "" },
      secondary: { name: "", email: "", mobileCountry: "IN", mobile: "" },
    }),
    null,
  );
});

test("created and last-update stamps read the same until something changes", () => {
  const created = "2026-11-01T10:00:00Z";
  const fresh = clientTimestamps(created, created);
  assert.equal(fresh.touched, false);
  assert.match(fresh.created, /01 Nov 2026/);

  const edited = clientTimestamps(created, "2026-11-09T15:30:00Z");
  assert.equal(edited.touched, true);
  assert.notEqual(edited.created, edited.updated);
  assert.match(clientTimestamps("nope", "nope").created, /—/);
});

/* -------------------------------------------------------------------------- */
/*  Repository                                                                */
/* -------------------------------------------------------------------------- */

test("a client is stored with both contacts and automatic timestamps", async () => {
  const { createClientRecord, listClients } = await import("../lib/records/repository");
  const user = {
    id: "test-user",
    name: "Test Manager",
    email: "test.manager@tasktornado.dev",
    role: "it_manager",
  } as never;

  const created = await createClientRecord(user, {
    name: "Bluewave Marine",
    code: "BWM",
    industry: "Shipping",
    primary: {
      name: "Latha Menon",
      email: "latha@bluewave.example",
      mobileCountry: "IN",
      mobile: "9876500011",
    },
    secondary: {
      name: "Kiran Das",
      email: "kiran@bluewave.example",
      mobileCountry: "AE",
      mobile: "501234567",
    },
    ownerRole: "l2_support_lead",
    assignedUserId: "u-l2-engineer",
    assignedUserName: "Nisha Verma",
  });

  assert.match(created.id, /^CL-\d+$/);
  assert.equal(created.name, "Bluewave Marine");
  assert.equal(created.code, "BWM");
  assert.equal(created.status, "active");
  assert.equal(created.primary.mobile, "9876500011");
  assert.equal(created.secondary.mobileCountry, "AE");
  assert.equal(created.assignedUserName, "Nisha Verma");
  assert.ok(created.createdAt);
  assert.equal(created.createdAt, created.updatedAt);

  const stored = (await listClients()).find((client) => client.id === created.id);
  assert.equal(stored?.primary.name, "Latha Menon");
  assert.equal(stored?.secondary.email, "kiran@bluewave.example");
  assert.equal(clientTimestamps(created.createdAt, created.updatedAt).touched, false);
});

test("assignable users come from the directory without the hidden account", async () => {
  const { listAssignableUsers } = await import("../lib/records/repository");
  const people = await listAssignableUsers();

  assert.ok(people.length > 5);
  assert.ok(people.every((person) => person.id && person.name));
  assert.ok(!people.some((person) => person.id === "u-super-admin"));
  assert.ok(people.some((person) => person.name === "Meera Raghavan"));
});
