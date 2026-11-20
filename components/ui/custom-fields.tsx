import type { CustomFieldRecord } from "@/lib/records/repository";

/**
 * Master-defined custom fields for one module.
 *
 * The same component drops into any module form: pass the fields Masters holds
 * for that module slug and the answers already stored for the record. Inputs are
 * named `custom:<fieldId>` so the server action can read them generically.
 */
export function CustomFields({
  fields,
  values = {},
}: {
  fields: CustomFieldRecord[];
  values?: Record<string, string>;
}) {
  if (fields.length === 0) return null;

  return (
    <section className="border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">
          Additional fields
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        {fields.map((field) => (
          <div key={field.id}>
            <label htmlFor={`custom-${field.id}`} className="field-label">
              {field.name}
            </label>
            <input
              id={`custom-${field.id}`}
              name={`custom:${field.id}`}
              defaultValue={values[field.id] ?? ""}
              maxLength={240}
              className="field"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
