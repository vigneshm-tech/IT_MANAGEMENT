import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut, ShieldCheck, Timer } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { listApiKeys } from "@/lib/api/keys";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Security & sessions" };

export default async function SecuritySettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const keys = await listApiKeys(user.id);
  const activeKeys = keys.filter(
    (key) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date()),
  );
  const expires = new Date(user.expiresAt * 1000);
  const issued = new Date(user.issuedAt * 1000);

  return (
    <div className="space-y-5">
      <PageHeader title="Security & sessions">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="security" />
          <p className="text-[12px] text-muted">Session, password and API keys</p>
        </div>
      </PageHeader>

      <section className="border-y border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-navy-soft" aria-hidden />
            <div>
              <p className="text-[12.5px] text-body">
                Signed in as <span className="font-medium text-navy">{user.email}</span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {user.email} · {user.title}
              </p>
            </div>
          </div>
          <StatusPill status="active" label="This session" />
        </div>

        <dl className="grid grid-cols-1 gap-x-10 gap-y-4 px-4 py-4 text-[12px] sm:grid-cols-3 sm:px-5">
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
              Started
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 text-body">
              <Timer className="h-3 w-3 text-muted" aria-hidden />
              {formatDateTime(issued)}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
              Expires
            </dt>
            <dd className="mt-1 text-body">{formatDateTime(expires)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
              Sign-in method
            </dt>
            <dd className="mt-1 text-body">
              Email and password
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
          <p className="text-[11.5px] text-muted">Signing out ends this session on this device.</p>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </section>

      <section className="border-y border-line bg-surface px-4 py-4 sm:px-5">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          Password
        </h2>
        <p className="mt-1 text-[11.5px] text-muted">
          {user.provider === "supabase"
            ? "A reset link is valid for one hour."
            : "Password changes are not available for this account."}
        </p>
        {user.provider === "supabase" && (
          <Link
            href="/login/forgot-password"
            className="mt-2 inline-block text-[11.5px] text-navy underline underline-offset-2"
          >
            Send a reset link
          </Link>
        )}
      </section>

      <section className="border-y border-line bg-surface px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              API keys
            </h2>
            <p className="mt-1 text-[11.5px] text-muted">
              {activeKeys.length === 0
                ? "No active keys"
                : `${activeKeys.length} active ${activeKeys.length === 1 ? "key" : "keys"}`}
            </p>
          </div>
          <Link
            href="/modules/settings/developers"
            className="text-[11.5px] text-navy underline underline-offset-2"
          >
            Manage keys
          </Link>
        </div>
      </section>
    </div>
  );
}
