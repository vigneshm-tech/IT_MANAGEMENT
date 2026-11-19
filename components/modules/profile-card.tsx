import { BadgeCheck, Fingerprint, Mail, ShieldCheck, Timer } from "lucide-react";
import { RoleBadge } from "@/components/role-badge";
import type { SessionUser } from "@/lib/auth/session";
import { ROLE_BY_ID, ROLE_GROUPS } from "@/lib/roles";

export function ProfileCard({ user }: { user: SessionUser }) {
  const role = ROLE_BY_ID[user.role];
  const group = ROLE_GROUPS[role.group];
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <section className="rounded-2xl border border-line/70 bg-surface/50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-accent text-[17px] font-semibold text-white">
            {initials}
          </span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{user.name}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
              <Mail className="h-3 w-3" aria-hidden />
              {user.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RoleBadge role={user.role} size="sm" />
              <span
                className="rounded-full border px-2 py-0.5 text-[10.5px]"
                style={{
                  borderColor: `${group.accent}40`,
                  backgroundColor: `${group.accent}12`,
                  color: group.accent,
                }}
              >
                {group.label}
              </span>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11.5px] sm:w-[260px]">
          <div>
            <dt className="flex items-center gap-1 text-muted">
              <Fingerprint className="h-3 w-3" aria-hidden />
              Provider
            </dt>
            <dd className="mt-0.5 font-medium capitalize text-ink">{user.provider}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted">
              <BadgeCheck className="h-3 w-3" aria-hidden />
              Tier
            </dt>
            <dd className="mt-0.5 font-medium capitalize text-ink">{role.level}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted">
              <Timer className="h-3 w-3" aria-hidden />
              Session expires
            </dt>
            <dd className="mt-0.5 font-medium text-ink">
              {new Date(user.expiresAt * 1000).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Access source
            </dt>
            <dd className="mt-0.5 font-medium text-ink">Role registry</dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 rounded-xl border border-line/70 bg-base/40 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted">
        Roles are assigned by your IT Manager and stored with your employee profile. Changing a role
        takes effect on the next sign-in and is re-checked on every request.
      </p>
    </section>
  );
}
