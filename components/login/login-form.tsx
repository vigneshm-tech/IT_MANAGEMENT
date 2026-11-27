"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";
import type { DemoAccount } from "@/lib/demo-users";
import { roleOf, type RoleId } from "@/lib/roles";

const initialState: LoginState = {};

export function LoginForm({
  demoAccounts,
  redirectTo,
}: {
  demoAccounts: DemoAccount[];
  redirectTo: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [previewRole, setPreviewRole] = useState<RoleId | "">("");

  function fillPreview(role: RoleId | "") {
    setPreviewRole(role);
    const account = demoAccounts.find((candidate) => candidate.role === role);
    if (!account) return;
    setEmail(account.email);
    setPassword(account.password);
  }

  return (
    <div className="w-full max-w-[384px]">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-navy">
        Sign in
      </h1>
      <p className="mt-1.5 text-[13px] text-muted">
        Use your organisation account to continue.
      </p>

      <form action={formAction} className="mt-7 space-y-4" noValidate>
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <label className="block">
          <span className="field-label">Work email</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setPreviewRole("");
            }}
            placeholder="you@company.com"
            aria-invalid={state.error ? true : undefined}
            className="field"
          />
        </label>

        <label className="block">
          <span className="field-label flex items-center justify-between">
            <span>Password</span>
            <Link
              href="/login/forgot-password"
              className="text-[11.5px] font-medium normal-case tracking-normal text-navy hover:underline"
            >
              Forgot password?
            </Link>
          </span>
          <span className="relative block">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPreviewRole("");
              }}
              placeholder="••••••••••"
              className="field pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-navy"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>

        {state.error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-[#f2d3d0] bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="group flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-[13px] font-semibold text-navy transition hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                aria-hidden
              />
            </>
          )}
        </button>
      </form>

      {demoAccounts.length > 0 && (
        <div className="mt-7 border-t border-line pt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              Preview access
            </p>
            <code className="font-mono text-[10.5px] text-muted">{demoAccounts[0]?.password}</code>
          </div>
          <select
            value={previewRole}
            onChange={(event) => fillPreview(event.target.value as RoleId | "")}
            aria-label="Fill credentials for a role"
            className="field mt-2"
          >
            <option value="">Choose a role…</option>
            {demoAccounts.map((account) => (
              <option key={account.role} value={account.role}>
                {roleOf(account.role).label} · {account.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11.5px] text-muted">
            Fills the form above with that account.
          </p>
        </div>
      )}
    </div>
  );
}
