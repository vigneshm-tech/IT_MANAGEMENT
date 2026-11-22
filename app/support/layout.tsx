import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";

/**
 * The public shell — no session, no sidebar, no module navigation.
 *
 * Everything under /support is reachable by anyone with the link, so this
 * layout is the boundary: it never reads the session and never renders an agent
 * control. The one link back into the workspace is "Sign in", which is the
 * normal front door.
 */
export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/support" className="shrink-0" aria-label="TaskTornado support">
            <Wordmark height={20} />
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[12.5px]">
            <Link href="/support/kb" className="text-body transition-colors hover:text-navy">
              Help centre
            </Link>
            <Link
              href="/support/new"
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              Get help
            </Link>
            <Link href="/login" className="hidden text-muted transition-colors hover:text-navy sm:inline">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:px-8 sm:py-10">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-[11.5px] text-muted sm:px-8">
          <span>© {new Date().getFullYear()} TaskTornado · IT service desk</span>
          <Link href="/support/kb" className="hover:text-navy">
            Knowledge base
          </Link>
          <Link href="/support/new" className="hover:text-navy">
            Raise a ticket
          </Link>
          <span className="ml-auto">No account needed to ask for help.</span>
        </div>
      </footer>
    </div>
  );
}
