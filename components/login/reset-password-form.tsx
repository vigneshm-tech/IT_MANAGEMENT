"use client";

import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import {
  updatePasswordAction,
  type UpdatePasswordState,
} from "@/app/login/reset-password/actions";

const initialState: UpdatePasswordState = {};

const RULES = [
  "At least 8 characters",
  "A number and a capital letter",
  "Not a password you use elsewhere",
];

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);
  const [show, setShow] = useState(false);

  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef2f8] text-navy">
        <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <h1 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-navy">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-[13px] text-muted">
        Setting the password for <span className="font-medium text-navy">{email}</span>
      </p>

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="field-label">New password</span>
          <span className="relative block">
            <input
              name="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              autoFocus
              minLength={8}
              placeholder="••••••••••"
              className="field pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-navy"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>

        <label className="block">
          <span className="field-label">Confirm password</span>
          <input
            name="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••••"
            className="field"
          />
        </label>

        <ul className="space-y-1 text-[11.5px] text-muted">
          {RULES.map((rule) => (
            <li key={rule} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>

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
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-[13px] font-semibold text-navy transition hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save password"
          )}
        </button>
      </form>
    </div>
  );
}
