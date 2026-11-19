"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";
import { visibleModules } from "@/lib/access";
import type { DemoAccount } from "@/lib/demo-users";
import { ROLE_BY_ID, ROLE_GROUPS, type RoleGroup, type RoleId } from "@/lib/roles";

const GROUP_ORDER: RoleGroup[] = [
  "it",
  "l2_support",
  "implementation",
  "development",
  "testing",
  "management",
];

const initialState: LoginState = {};

export function LoginForm({
  demoAccounts,
  demoMode,
  redirectTo,
}: {
  demoAccounts: DemoAccount[];
  demoMode: boolean;
  redirectTo: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selected, setSelected] = useState<RoleId | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<RoleGroup | "all">("all");
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return demoAccounts.filter((account) => {
      const role = ROLE_BY_ID[account.role];
      if (group !== "all" && role.group !== group) return false;
      if (!q) return true;
      return (
        role.label.toLowerCase().includes(q) ||
        account.name.toLowerCase().includes(q) ||
        account.email.toLowerCase().includes(q)
      );
    });
  }, [demoAccounts, group, query]);

  const selectedAccount = demoAccounts.find((a) => a.role === selected) ?? null;
  const selectedModules = selected ? visibleModules(selected) : [];

  function choose(account: DemoAccount) {
    setSelected(account.role);
    setEmail(account.email);
    setPassword(account.password);
  }

  function quickSignIn() {
    const account = selectedAccount;
    if (!account) return;
    setEmail(account.email);
    setPassword(account.password);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="glass w-full max-w-[460px] rounded-3xl p-7 sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-ink">Welcome back</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Sign in with your work account to continue.
          </p>
        </div>
        <span
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-wide ${
            demoMode
              ? "border-warning/30 bg-warning/10 text-warning"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${demoMode ? "bg-warning" : "bg-success"}`}
          />
          {demoMode ? "Demo mode" : "Supabase"}
        </span>
      </div>

      <form ref={formRef} action={formAction} className="mt-7 space-y-4" noValidate>
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-medium text-ink/80">
            Work email
          </label>
          <div className="group relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition group-focus-within:text-brand-soft"
              aria-hidden
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSelected(null);
              }}
              placeholder="you@company.com"
              aria-invalid={state.error ? true : undefined}
              className="w-full rounded-xl border border-line bg-surface/80 py-2.5 pl-10 pr-3 text-[13.5px] text-ink placeholder:text-muted/60 transition focus:border-brand/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-[12.5px] font-medium text-ink/80">
              Password
            </label>
            <span className="text-[11px] text-muted">Need access? Ask your IT Manager</span>
          </div>
          <div className="group relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition group-focus-within:text-brand-soft"
              aria-hidden
            />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setSelected(null);
              }}
              placeholder="••••••••••"
              className="w-full rounded-xl border border-line bg-surface/80 py-2.5 pl-10 pr-11 text-[13.5px] text-ink placeholder:text-muted/60 transition focus:border-brand/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition hover:bg-surface-3 hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {state.error && (
            <motion.div
              key="error"
              role="alert"
              aria-live="polite"
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                <span>{state.error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={pending}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand to-[#5b8cff] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(124,92,255,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </>
          )}
        </button>
      </form>

      {demoAccounts.length > 0 && (
        <div className="mt-6 border-t border-line/80 pt-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-brand-soft" aria-hidden />
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/80">
                Demo access
              </h3>
            </div>
            <span className="text-[11px] text-muted">15 roles · one click</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Pick a role to preview its modules. Password for all demo accounts:{" "}
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink/90">
              {demoAccounts[0]?.password}
            </code>
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roles"
                aria-label="Search demo roles"
                className="w-full rounded-lg border border-line bg-surface/70 py-1.5 pl-8 pr-2.5 text-[12px] text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none"
              />
            </div>
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value as RoleGroup | "all")}
              aria-label="Filter demo roles by team"
              className="rounded-lg border border-line bg-surface/70 px-2 py-1.5 text-[12px] text-ink focus:border-brand/60 focus:outline-none"
            >
              <option value="all">All teams</option>
              {GROUP_ORDER.map((key) => (
                <option key={key} value={key}>
                  {ROLE_GROUPS[key].label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-[196px] space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((account) => {
              const role = ROLE_BY_ID[account.role];
              const isSelected = selected === account.role;
              return (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => choose(account)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                    isSelected
                      ? "border-brand/60 bg-brand/12"
                      : "border-transparent bg-surface-2/60 hover:border-line hover:bg-surface-2"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: role.accent }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-ink">
                        {role.label}
                      </span>
                      <span className="block truncate text-[10.5px] text-muted">{account.name}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-brand-soft" aria-hidden />
                    ) : (
                      <span className="text-[10px] text-muted">
                        {visibleModules(account.role).length} mod
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-4 text-center text-[12px] text-muted">No roles match that search.</p>
            )}
          </div>

          <AnimatePresence>
            {selectedAccount && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-3 rounded-xl border border-brand/25 bg-brand/8 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11.5px] text-muted">
                    <span className="font-medium text-ink">{selectedModules.length} of 9</span> modules
                    visible
                  </p>
                  <span className="flex items-center gap-1">
                    {selectedModules.slice(0, 9).map((module) => (
                      <span
                        key={module.id}
                        title={module.title}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: module.accent }}
                      />
                    ))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={quickSignIn}
                  disabled={pending}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand/40 bg-brand/15 px-3 py-2 text-[12px] font-medium text-brand-soft transition hover:bg-brand/25 disabled:opacity-60"
                >
                  Continue as {ROLE_BY_ID[selectedAccount.role].label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-1.5 text-[10.5px] text-muted/80">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        Session protected with a signed, HTTP-only cookie
      </div>
    </motion.div>
  );
}
