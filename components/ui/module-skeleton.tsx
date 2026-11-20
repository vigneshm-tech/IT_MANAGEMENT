/**
 * What a module shows while its data loads.
 *
 * Every module renders from the database and three of them also wait on an
 * external API, so a click has to acknowledge itself immediately. Next swaps
 * this in at the route boundary, which also keeps link prefetching cheap: a
 * prefetch stops at the loading boundary instead of running the whole page.
 */
export function ModuleSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-6 w-44 animate-pulse rounded bg-[#e7ebf3]" />
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded-md bg-[#eef1f7]" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-[#e7ebf3]" />
        </div>
      </div>

      <div className="border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="h-8 w-64 animate-pulse rounded-md bg-[#eef1f7]" />
          <div className="h-4 w-20 animate-pulse rounded bg-[#eef1f7]" />
          <div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-[#eef1f7]" />
        </div>

        <div className="divide-y divide-line">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-[#e7ebf3]" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-[#eef1f7]" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-[#eef1f7]" />
              <div className="h-3.5 w-20 animate-pulse rounded bg-[#eef1f7]" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-[#eef1f7]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
