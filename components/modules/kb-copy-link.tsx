"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Copies the public URL of an article. Built on the browser's own clipboard
 * rather than a server round trip, and it says what actually happened.
 */
export function KbCopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState(href);

  useEffect(() => {
    setUrl(`${window.location.origin}${href}`);
  }, [href]);

  useEffect(() => {
    if (!copied && !failed) return;
    const timer = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2400);
    return () => clearTimeout(timer);
  }, [copied, failed]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          setFailed(true);
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium text-navy hover:bg-[#f2f5fa]"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden />
      ) : (
        <Link2 className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? "Link copied" : failed ? "Copy failed" : "Copy public link"}
    </button>
  );
}
