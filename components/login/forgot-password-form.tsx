"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import {
  requestPasswordResetAction,
  type ResetRequestState,
} from "@/app/login/forgot-password/actions";

const initialState: ResetRequestState = {};

export function ForgotPasswordForm({ demoMode }: { demoMode: boolean }) {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );
  const [email, setEmail] = useState("");

  if (state.sent) {
    return (
      <div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef2f8] text-navy">
          <MailCheck className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-navy">
          Check your inbox
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-body">
          {demoMode ? (
            <>
              This preview runs without mail delivery. In production, a reset link is
              emailed to <span className="font-medium text-navy">{state.email}</span> and
              stays valid for one hour.
            </>
          ) : (
            <>
              If <span className="font-medium text-navy">{state.email}</span> belongs to an
              account, a reset link is on its way. It expires in one hour and can only be
              used once.
            </>
          )}
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Nothing arrived? Check the spam folder, then ask IT to confirm the address on
          your profile.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-navy hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-navy">
        Reset password
      </h1>
      <p className="mt-1.5 text-[13px] text-muted">
        We&apos;ll email a one-time link to your work address.
      </p>

      <form action={formAction} className="mt-7 space-y-4" noValidate>
        <label className="block">
          <span className="field-label">Work email</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            aria-invalid={state.error ? true : undefined}
            className="field"
          />
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
              Sending link…
            </>
          ) : (
            <>
              Email reset link
              <ArrowRight
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                aria-hidden
              />
            </>
          )}
        </button>
      </form>

      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-navy hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to sign in
      </Link>
    </div>
  );
}
