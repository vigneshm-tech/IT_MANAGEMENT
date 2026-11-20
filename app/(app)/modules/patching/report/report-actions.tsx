"use client";

import { Download, Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/**
 * Download first, print second.
 *
 * The browser's print dialog stamps its own title, URL and page numbers into
 * every margin and cannot be told otherwise from the page — so the file the
 * report is really meant to leave the building as is the PDF, which we draw
 * ourselves. Printing stays for anyone who just wants paper now.
 */
export function ReportActions({ plans }: { plans: string }) {
  const pdfHref = `/modules/patching/report/pdf?plans=${encodeURIComponent(plans)}`;

  return (
    <div className="flex flex-col items-end gap-1.5" data-print="hide">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print
        </button>
        <a href={pdfHref} download className={buttonClass({ size: "sm" })}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download PDF
        </a>
      </div>
      <p className="max-w-[460px] text-right text-[11px] leading-snug text-muted">
        The PDF carries the logo and clean margins. Printing from the browser adds its own
        header and footer — turn off <span className="font-medium text-body">Headers and footers</span>{" "}
        in the print dialog to drop the date and the URL.
      </p>
    </div>
  );
}
