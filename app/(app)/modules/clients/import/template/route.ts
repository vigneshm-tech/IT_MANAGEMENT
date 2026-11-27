import { CLIENT_IMPORT_TEMPLATE } from "@/lib/clients-import";

/** Static CSV template, so the import columns never drift from the parser. */
export function GET() {
  return new Response(CLIENT_IMPORT_TEMPLATE, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="tasktornado-clients-template.csv"',
    },
  });
}
