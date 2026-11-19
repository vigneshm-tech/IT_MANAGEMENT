import { Wordmark } from "@/components/brand";

const POINTS = [
  {
    n: "01",
    title: "Work",
    copy: "Tasks, tickets and patching windows carry an owner and a due date.",
  },
  {
    n: "02",
    title: "Control",
    copy: "Fifteen roles checked on the server, with engineers held to a 09:00–18:00 window.",
  },
  {
    n: "03",
    title: "Record",
    copy: "Clients, contracts and approvals stay auditable when people move on.",
  },
];

export function BrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-navy lg:flex lg:flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "84px 84px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-32 h-[420px] w-[420px] rounded-full border border-gold/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -bottom-16 h-[260px] w-[260px] rounded-full border border-white/10"
      />

      <div className="relative flex h-full flex-col px-12 py-10 xl:px-16">
        <Wordmark tone="light" height={26} priority />

        <div className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[470px]">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-gold">
              Why TaskTornado exists
            </p>
            <h2 className="mt-4 text-[27px] font-semibold leading-[1.2] tracking-[-0.02em] text-white">
              The work is shared.
              <br />
              The record isn’t.
            </h2>

            <div className="mt-7 flex items-center gap-3" aria-hidden>
              {["Request", "Assign", "Decide", "Renew"].map((step, index) => (
                <div key={step} className="flex flex-1 items-center gap-3 last:flex-none">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-gold" : "bg-white/35"}`}
                    />
                    <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-white/55">
                      {step}
                    </span>
                  </span>
                  {index < 3 && <span className="h-px flex-1 bg-white/15" />}
                </div>
              ))}
            </div>

            <ol className="mt-7 border-t border-white/12">
              {POINTS.map((point) => (
                <li key={point.n} className="flex gap-5 border-b border-white/12 py-4">
                  <span className="mt-[3px] font-mono text-[11px] leading-none text-gold">
                    {point.n}
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium leading-none text-white">
                      {point.title}
                    </p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
                      {point.copy}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
              <span className="tabular-nums">9 modules</span>
              <span className="h-1 w-1 rounded-full bg-gold/60" aria-hidden />
              <span className="tabular-nums">15 roles</span>
              <span className="h-1 w-1 rounded-full bg-gold/60" aria-hidden />
              <span className="tabular-nums">1 sign-in</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-white/30">© {new Date().getFullYear()} TaskTornado</p>
      </div>
    </section>
  );
}
