"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { CountryCodeField } from "@/components/ui/country-code-field";
import { CustomFields } from "@/components/ui/custom-fields";
import type { FormState } from "@/lib/forms";
import { VISIBLE_ROLES } from "@/lib/roles";
import type {
  AssignableUser,
  ClientRecord,
  CustomFieldRecord,
} from "@/lib/records/repository";
import type { FormState as ClientFormState } from "@/lib/forms";

const NAME_MAX = 160;
const CODE_MAX = 20;
const INDUSTRY_MAX = 80;
const CONTACT_MAX = 80;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">{title}</h2>
        <p className="mt-1 text-[11.5px] text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MobileFields({
  prefix,
  label,
  country,
  mobile,
}: {
  prefix: "primary" | "secondary";
  label: string;
  country: string;
  mobile: string;
}) {
  return (
    <div>
      <label htmlFor={`${prefix}Mobile`} className="field-label">
        {label} mobile
      </label>
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
        <CountryCodeField
          id={`${prefix}Country`}
          name={`${prefix}Country`}
          label={`${label} country code`}
          defaultValue={country}
        />
        <input
          id={`${prefix}Mobile`}
          name={`${prefix}Mobile`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={20}
          defaultValue={mobile}
          placeholder="98400 12345"
          className="field"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        Pick the country code, then the number without it. Digits only are stored.
      </p>
    </div>
  );
}

/**
 * Full-page client form — every client field, no popup. The same component
 * creates (blank defaults) and edits (record defaults, hidden id).
 */
export function ClientForm({
  people,
  industries,
  customFields = [],
  customValues = {},
  client,
  action,
  submitLabel = "Save client",
}: {
  people: AssignableUser[];
  /** Active industry names from Masters. */
  industries: string[];
  /** Masters → Custom fields filed under this module, active only. */
  customFields?: CustomFieldRecord[];
  /** Existing answers, keyed by field id. */
  customValues?: Record<string, string>;
  /** Present when editing an existing record. */
  client?: ClientRecord;
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const industryOptions =
    client?.industry && !industries.includes(client.industry)
      ? [client.industry, ...industries]
      : industries;

  return (
    <form action={formAction} className="space-y-4">
      {client && <input type="hidden" name="id" value={client.id} />}
      <Section
        title="Client"
        description="Who the account is, and who inside TaskTornado looks after it."
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <label htmlFor="name" className="field-label">
              Client name<span className="ml-0.5 text-danger">*</span>
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={NAME_MAX}
              defaultValue={client?.name}
              placeholder="Acme Manufacturing"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="code" className="field-label">
              Short code / license code
            </label>
            <input
              id="code"
              name="code"
              maxLength={CODE_MAX}
              defaultValue={client?.code}
              placeholder="ACME"
              className="field font-mono uppercase"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Used on registers and tickets. Left blank, it is taken from the name.
            </p>
          </div>

          <div>
            <label htmlFor="industry" className="field-label">
              Industry
            </label>
            <select
              id="industry"
              name="industry"
              defaultValue={client?.industry ?? ""}
              className="field"
            >
              <option value="">Select an industry</option>
              {industryOptions.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted">
              The list comes from <span className="text-body">Masters → Industries</span>.
            </p>
          </div>

          <div>
            <label htmlFor="ownerRole" className="field-label">
              Account owner<span className="ml-0.5 text-danger">*</span>
            </label>
            <select
              id="ownerRole"
              name="ownerRole"
              required
              defaultValue={client?.ownerRole ?? "implementation_lead"}
              className="field"
            >
              {VISIBLE_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="assignedUserId" className="field-label">
              Assigned user
            </label>
            <select
              id="assignedUserId"
              name="assignedUserId"
              defaultValue={client?.assignedUserId ?? ""}
              className="field"
            >
              <option value="">Not assigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            {people.length === 0 && (
              <p className="mt-1.5 text-[11px] text-muted">
                The directory is empty, so the account stays with the owner role.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Primary contact"
        description="The person IT speaks to first. Fill in what you have — anything typed must be valid."
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <label htmlFor="primaryName" className="field-label">
              Primary contact name
            </label>
            <input
              id="primaryName"
              name="primaryName"
              maxLength={CONTACT_MAX}
              defaultValue={client?.primary.name}
              placeholder="Ritu Shah"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="primaryEmail" className="field-label">
              Primary contact email
            </label>
            <input
              id="primaryEmail"
              name="primaryEmail"
              type="email"
              maxLength={160}
              defaultValue={client?.primary.email}
              placeholder="ritu.shah@acme.com"
              className="field"
            />
          </div>

          <div className="sm:col-span-2 sm:max-w-[420px]">
            <MobileFields
          prefix="primary"
          label="Primary contact"
          country={client?.primary.mobileCountry ?? "IN"}
          mobile={client?.primary.mobile ?? ""}
        />
          </div>
        </div>
      </Section>

      <Section
        title="Secondary contact"
        description="The escalation contact. Optional, and validated the same way."
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <label htmlFor="secondaryName" className="field-label">
              Secondary contact name
            </label>
            <input
              id="secondaryName"
              name="secondaryName"
              maxLength={CONTACT_MAX}
              defaultValue={client?.secondary.name}
              placeholder="Vikram Rao"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="secondaryEmail" className="field-label">
              Secondary contact email
            </label>
            <input
              id="secondaryEmail"
              name="secondaryEmail"
              type="email"
              maxLength={160}
              defaultValue={client?.secondary.email}
              placeholder="vikram.rao@acme.com"
              className="field"
            />
          </div>

          <div className="sm:col-span-2 sm:max-w-[420px]">
            <MobileFields
          prefix="secondary"
          label="Secondary contact"
          country={client?.secondary.mobileCountry ?? "IN"}
          mobile={client?.secondary.mobile ?? ""}
        />
          </div>
        </div>
      </Section>

      <CustomFields fields={customFields} values={customValues} />

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          The created date and last update are stamped automatically — nothing to fill in here.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/modules/clients" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
