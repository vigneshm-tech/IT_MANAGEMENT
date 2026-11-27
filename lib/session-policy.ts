/**
 * How long a sign-in lasts.
 *
 * One choice for the whole workspace, made under Settings → Security &
 * sessions. It is applied when a session is issued — the token carries its own
 * expiry — so changing it affects the next sign-in rather than pulling the rug
 * from under people who are already working.
 *
 * `0` means *until sign out*. A cookie cannot live forever: Chrome drops
 * anything past 400 days, so that is the longest life this can honestly offer.
 */

export type SessionTimeoutOption = {
  /** Minutes of life; 0 means until sign out. */
  minutes: number;
  label: string;
};

export const SESSION_TIMEOUT_OPTIONS: readonly SessionTimeoutOption[] = [
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
  { minutes: 10080, label: "7 days" },
  { minutes: 43200, label: "30 days" },
  { minutes: 0, label: "Until sign out" },
];

export const DEFAULT_SESSION_TIMEOUT_MINUTES = 720;

/** 400 days — the longest a browser will keep a cookie. */
export const SESSION_UNTIL_SIGNOUT_SECONDS = 400 * 24 * 60 * 60;

export function isSessionTimeoutOption(value: number): boolean {
  return SESSION_TIMEOUT_OPTIONS.some((option) => option.minutes === value);
}

/** Anything that is not one of the offered choices falls back to the default. */
export function normaliseSessionTimeoutMinutes(value: unknown): number {
  // `Number(null)` and `Number("")` are both 0, and 0 is a real choice here
  // (until sign out) — so absence has to be checked before converting.
  if (value === null || value === undefined || value === "") {
    return DEFAULT_SESSION_TIMEOUT_MINUTES;
  }
  const minutes = typeof value === "number" ? value : Number(value);
  return isSessionTimeoutOption(minutes) ? minutes : DEFAULT_SESSION_TIMEOUT_MINUTES;
}

/** Seconds a newly issued session should live for. */
export function sessionTtlSeconds(minutes: number): number {
  const choice = normaliseSessionTimeoutMinutes(minutes);
  return choice === 0 ? SESSION_UNTIL_SIGNOUT_SECONDS : choice * 60;
}

/** The two roles that may change it — the same rule the table's policy enforces. */
const POLICY_ROLES = new Set(["it_manager", "super_admin"]);

export function canManageSessionTimeout(role: string): boolean {
  return POLICY_ROLES.has(role);
}

export function sessionTimeoutLabel(minutes: number): string {
  const choice = normaliseSessionTimeoutMinutes(minutes);
  return SESSION_TIMEOUT_OPTIONS.find((option) => option.minutes === choice)!.label;
}
