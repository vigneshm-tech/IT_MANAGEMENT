import { TornadoMark, Wordmark } from "@/components/brand";

const LINES = [
  "Tasks, tickets and approvals in one queue",
  "Server inventory and patching windows",
  "Clients and renewals with real owners",
];

export function BrandPanel() {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden bg-navy px-12 py-12 lg:flex xl:px-16">
      <Wordmark tone="white" />

      <div className="max-w-[430px]">
        <TornadoMark tone="gold" className="h-10 w-10" />
        <h2 className="mt-6 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
          The IT desk,
          <br />
          in one place.
        </h2>
        <p className="mt-3 max-w-[360px] text-[13.5px] leading-relaxed text-white/60">
          TaskTornado keeps service, infrastructure and commercial work on the same board.
        </p>

        <ul className="mt-9 space-y-3.5">
          {LINES.map((line) => (
            <li key={line} className="flex items-start gap-3 text-[13px] text-white/75">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-white/40">
        <span>© {new Date().getFullYear()} TaskTornado</span>
        <span className="h-1 w-1 rounded-full bg-white/25" aria-hidden />
        <span>IT Management</span>
      </div>
    </section>
  );
}
