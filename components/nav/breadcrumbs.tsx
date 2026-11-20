"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { getModule } from "@/lib/modules";

type Crumb = { label: string; href: string };

function humanise(segment: string, parent?: string): string {
  let value = segment;
  try {
    value = decodeURIComponent(segment);
  } catch {
    /* keep the raw segment */
  }
  // Record ids stay verbatim (TSK-12, CL-1001, AT-3); two route words expand.
  if (/^[a-z]{2,4}-\d+$/i.test(value)) return value.toUpperCase();
  if (value === "new") {
    if (parent === "tasks") return "New task";
    if (parent === "tickets") return "New ticket";
    if (parent === "clients") return "New client";
    return "New";
  }
  if (value === "edit") return "Edit";
  if (/^\d+$/.test(value) && parent === "tickets") return `Ticket #${value}`;

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * One-row location trail under the header.
 *
 * `Modules / Task Management`, and for future nested pages
 * `Modules / Task Management / <child>`. The Modules hub itself has no trail,
 * so the row only appears once a module has been opened.
 */
function trailFor(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "modules" || segments.length < 2) return [];

  const crumbs: Crumb[] = [{ label: "Modules", href: "/modules" }];
  let href = "/modules";

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    href += `/${segment}`;

    const module = getModule(segment);
    crumbs.push({
      label: module ? module.title : humanise(segment, segments[index - 1]),
      href: module ? module.href : href,
    });
  }

  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? "";
  const crumbs = trailFor(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="w-full border-b border-line bg-surface">
      <ol className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 px-4 py-2 text-[11.5px] leading-none sm:px-6 lg:px-8 xl:px-10">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          return (
            <li key={`${crumb.href}-${crumb.label}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-line-strong" aria-hidden />
              )}
              {current ? (
                <span aria-current="page" className="font-medium text-navy">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-muted transition-colors hover:text-navy"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
