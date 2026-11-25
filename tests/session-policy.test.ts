import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  SESSION_TIMEOUT_OPTIONS,
  SESSION_UNTIL_SIGNOUT_SECONDS,
  canManageSessionTimeout,
  normaliseSessionTimeoutMinutes,
  sessionTimeoutLabel,
  sessionTtlSeconds,
} from "@/lib/session-policy";
import { decodeSession, encodeSession } from "@/lib/auth/token";

const user = {
  id: "u-it-manager",
  email: "it.manager@tasktornado.dev",
  name: "Meera Raghavan",
  role: "it_manager" as const,
  title: "IT Manager",
  provider: "demo" as const,
};

test("the offered lives run from an hour to until sign out", () => {
  const labels = SESSION_TIMEOUT_OPTIONS.map((option) => option.label);
  assert.deepEqual(labels.slice(0, 3), ["1 hour", "4 hours", "8 hours"]);
  assert.equal(labels.at(-1), "Until sign out");
  assert.ok(SESSION_TIMEOUT_OPTIONS.some((option) => option.minutes === 0));
  assert.equal(DEFAULT_SESSION_TIMEOUT_MINUTES, 720, "12 hours, as before this setting");
});

test("only offered values survive, anything else falls back to 12 hours", () => {
  assert.equal(normaliseSessionTimeoutMinutes(60), 60);
  assert.equal(normaliseSessionTimeoutMinutes("43200"), 43200);
  assert.equal(normaliseSessionTimeoutMinutes(0), 0);
  for (const junk of [15, -1, 999999, "soon", null, undefined, Number.NaN]) {
    assert.equal(normaliseSessionTimeoutMinutes(junk), DEFAULT_SESSION_TIMEOUT_MINUTES);
  }
});

test("seconds follow the choice, and until-sign-out is the browser maximum", () => {
  assert.equal(sessionTtlSeconds(60), 3600);
  assert.equal(sessionTtlSeconds(720), 43_200);
  assert.equal(sessionTtlSeconds(10_080), 604_800);
  assert.equal(sessionTtlSeconds(0), SESSION_UNTIL_SIGNOUT_SECONDS);
  assert.equal(SESSION_UNTIL_SIGNOUT_SECONDS, 400 * 86_400, "400 days");
});

test("labels read the way a person would say them", () => {
  assert.equal(sessionTimeoutLabel(720), "12 hours");
  assert.equal(sessionTimeoutLabel(0), "Until sign out");
  assert.equal(sessionTimeoutLabel(1234), "12 hours", "unknown values show the default");
});

test("only the IT Manager and the super admin may change it", () => {
  assert.equal(canManageSessionTimeout("it_manager"), true);
  assert.equal(canManageSessionTimeout("super_admin"), true);
  for (const role of ["it_engineer", "management", "technician", "requestor"]) {
    assert.equal(canManageSessionTimeout(role), false, role);
  }
});

test("the issued token carries the chosen lifetime", () => {
  const issuedAt = new Date();
  const hour = decodeSession(encodeSession(user, issuedAt, 3600));
  assert.ok(hour);
  assert.equal(hour.expiresAt - hour.issuedAt, 3600);

  const day = decodeSession(encodeSession(user, issuedAt, 86_400));
  assert.ok(day);
  assert.equal(day.expiresAt - day.issuedAt, 86_400);

  const forever = decodeSession(encodeSession(user, issuedAt, SESSION_UNTIL_SIGNOUT_SECONDS));
  assert.ok(forever);
  assert.equal(forever.expiresAt - forever.issuedAt, SESSION_UNTIL_SIGNOUT_SECONDS);
});

test("a token issued before the setting existed still round-trips at 12 hours", () => {
  const issuedAt = new Date();
  const token = decodeSession(encodeSession(user, issuedAt));
  assert.ok(token);
  assert.equal(token.expiresAt - token.issuedAt, 12 * 3600);
});

test("the longest option is still a live session tomorrow", () => {
  const now = new Date();
  const token = decodeSession(encodeSession(user, now, sessionTtlSeconds(0)));
  assert.ok(token);
  assert.ok(token.expiresAt * 1000 > now.getTime() + 399 * 86_400_000);
});
