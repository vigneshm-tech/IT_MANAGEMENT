"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonClass({ size: "sm" })}
      data-print="hide"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Print or save as PDF
    </button>
  );
}
