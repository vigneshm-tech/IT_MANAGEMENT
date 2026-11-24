"use client";

import { Check, Copy, Download, ShieldAlert, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  COLLECTOR_FILE_NAME,
  DEFAULT_COLLECTOR_API_URL,
  collectorScript,
} from "@/lib/iis/collector";

/**
 * The button that hands a Windows admin the collector.
 *
 * The script is built here, in the browser, because the API URL has to be the
 * host the person is actually looking at — production, a preview or localhost.
 * The key is typed into the dialog and only ever lives inside the generated
 * text: nothing is stored, nothing is sent anywhere except by the script the
 * person chooses to run.
 */
export function IisCollectorPanel({ canIngest }: { canIngest: boolean }) {
  const [open, setOpen] = useState(false);
  const [apiUrl, setApiUrl] = useState(DEFAULT_COLLECTOR_API_URL);
  const [apiKey, setApiKey] = useState("");
  const [serverHostName, setServerHostName] = useState("");
  const [copied, setCopied] = useState<"idle" | "script" | "url">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setApiUrl(new URL("/api/v1/iis/applications", window.location.origin).toString());
  }, []);

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const script = useMemo(
    () => collectorScript({ apiUrl, serverHostName, apiKey }),
    [apiUrl, serverHostName, apiKey],
  );

  async function copy(text: string, what: "script" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("idle");
    }
  }

  function download() {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = COLLECTOR_FILE_NAME;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Terminal className="h-3.5 w-3.5" aria-hidden />
        Collection script
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Collect IIS applications from Windows"
        description="Run this PowerShell script on the server. It reports one row per IIS site — the binding, the pool, directory browsing, the root path and the certificate actually mapped — then posts them here in batches."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              {canIngest
                ? "Your key will be accepted: this endpoint is open to the IT manager and the super admin."
                : "Only an IT manager or super admin key is accepted by this endpoint — you can still download the script for whoever holds one."}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(script, "script")}>
                {copied === "script" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
                {copied === "script" ? "Copied" : "Copy script"}
              </Button>
              <Button type="button" size="sm" onClick={download}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download .ps1
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="collector-api-url" className="field-label">
              API URL
            </label>
            <div className="flex items-center gap-2">
              <input
                id="collector-api-url"
                readOnly
                value={apiUrl}
                className="field font-mono text-[11.5px]"
              />
              <button
                type="button"
                onClick={() => copy(apiUrl, "url")}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-line px-2.5 text-[11.5px] text-body transition-colors hover:border-navy hover:text-navy"
              >
                {copied === "url" ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden />
                )}
                {copied === "url" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="collector-key" className="field-label">
                API key
              </label>
              <input
                id="collector-key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="tt_…"
                spellCheck={false}
                autoComplete="off"
                className="field font-mono text-[12px]"
              />
              <p className="text-[11px] text-muted">
                Issued in Settings › Developers, with the <span className="font-mono">iis:write</span>{" "}
                scope. It is not sent anywhere from this page — it only fills in the script below,
                so leave it blank if you would rather pass <span className="font-mono">-ApiKey</span>{" "}
                on the server.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="collector-server" className="field-label">
                Server host name
              </label>
              <input
                id="collector-server"
                value={serverHostName}
                onChange={(event) => setServerHostName(event.target.value)}
                placeholder="Leave blank for the machine's own name"
                className="field"
              />
              <p className="text-[11px] text-muted">
                Blank uses <span className="font-mono">$env:COMPUTERNAME</span>, which is what the
                register should usually show.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-line bg-[#f7f9fc] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-navy">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              Who may push
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              The endpoint accepts keys owned by the <span className="font-medium">IT manager</span>{" "}
              and the <span className="font-medium">super admin</span> only, whatever other scopes the
              key carries. Reading and editing this register in the browser is unaffected.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="field-label mb-0">Script</p>
              <p className="text-[11px] text-muted">
                {script.split("\n").length} lines · PowerShell 5.1+ · sites only by default
              </p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              <span className="font-mono">-ListOnly</span> shows the table without sending ·{" "}
              <span className="font-mono">-IncludeApplications</span> adds virtual directories as
              their own rows · <span className="font-mono">-AllBindings</span> one row per binding ·{" "}
              <span className="font-mono">-DumpPath</span> writes the JSON it sends.
            </p>
            <pre className="max-h-64 overflow-auto rounded-md border border-line bg-[#0f2142] px-3 py-2.5 text-[11px] leading-[1.55] text-[#dbe6f5]">
              <code>{script}</code>
            </pre>
          </div>
        </div>
      </Dialog>
    </>
  );
}
