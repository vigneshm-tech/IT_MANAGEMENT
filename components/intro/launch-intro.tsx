"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { dismissIntroAction } from "@/app/(app)/intro/actions";

const NAVY = "#101f40";
const GOLD = "#c6a96c";
const GOLD_SOFT = "#e9ddc3";
const RING_RADIUS = 22;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Anything that never resolves must not strand the user on the launch screen. */
const READINESS_GUARD_MS = 6000;

type Phase = "loading" | "leaving" | "done";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function preloadAsset(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

/**
 * Cinematic post-login launch. Mounted only while the one-shot intro cookie is
 * pending, so it runs once per sign-in and never on internal navigation.
 */
export function LaunchIntro({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;
  return <IntroExperience>{children}</IntroExperience>;
}

function IntroExperience({ children }: { children: ReactNode }) {
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState(0.06);
  const [ready, setReady] = useState(false);
  const [entranceDone, setEntranceDone] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");

  const finish = useCallback(() => {
    setProgress(1);
    setReady(true);
  }, []);

  // Media queries cannot be read during SSR, so the preference is applied after
  // hydration — the server and first client render stay identical.
  useEffect(() => setMounted(true), []);
  const reduced = mounted && prefersReduced === true;

  // Reduced motion: skip straight past the cinematic entrance.
  useEffect(() => {
    if (reduced) setEntranceDone(true);
  }, [reduced]);

  // Real initialisation signals: session and workspace data are already
  // resolved by the server render, then fonts, layout and brand art land.
  useEffect(() => {
    let cancelled = false;
    const step = (value: number) =>
      cancelled ? undefined : setProgress((current) => Math.max(current, value));

    const guard = window.setTimeout(() => {
      if (!cancelled) finish();
    }, READINESS_GUARD_MS);

    (async () => {
      try {
        step(0.15);
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready;
        }
        step(0.4);
        await nextFrame();
        await nextFrame();
        step(0.55);
        await preloadAsset("/brand/wordmark-inverse.svg");
        step(0.7);
        if (typeof document !== "undefined" && document.readyState !== "complete") {
          await new Promise<void>((resolve) => {
            window.addEventListener("load", () => resolve(), { once: true });
          });
        }
        step(0.9);
      } catch (error) {
        console.warn("[intro] readiness check failed", error);
      }
      if (!cancelled) finish();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(guard);
    };
  }, [finish]);

  // Hold the screen until the logo entrance has played and the app is ready.
  useEffect(() => {
    if (phase !== "loading" || !ready || !entranceDone) return;
    const timer = window.setTimeout(() => setPhase("leaving"), reduced ? 160 : 540);
    return () => window.clearTimeout(timer);
  }, [phase, ready, entranceDone, reduced]);

  // Fade the overlay out, then hand the screen to the workspace.
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(
      () => {
        setPhase("done");
        void dismissIntroAction();
      },
      reduced ? 200 : 620,
    );
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  // Lock scrolling and keep the app inert while the launch screen is up.
  useEffect(() => {
    if (phase === "done") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  const showPage = phase !== "loading";

  return (
    <>
      <motion.div
        inert={phase !== "done"}
        initial={{ opacity: 0, y: reduced ? 0 : 16 }}
        animate={{ opacity: showPage ? 1 : 0, y: showPage ? 0 : reduced ? 0 : 16 }}
        transition={{ duration: reduced ? 0.2 : 0.6, ease: EASE }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {phase !== "done" && (
          <motion.div
            key="launch-intro"
            role="status"
            aria-live="polite"
            aria-label="Preparing your workspace"
            className="fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden px-6"
            style={{ backgroundColor: NAVY }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.25 : 0.65, ease: "easeInOut" }}
          >
            {/* ambient lighting */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[860px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: `radial-gradient(circle, rgba(198,169,108,0.16) 0%, rgba(198,169,108,0.05) 40%, transparent 72%)`,
              }}
              animate={
                reduced ? undefined : { scale: [1, 1.06, 1], opacity: [0.75, 1, 0.75] }
              }
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -left-40 top-1/3 h-[420px] w-[420px] rounded-full"
              style={{
                background: `radial-gradient(circle, rgba(42,68,112,0.55) 0%, transparent 70%)`,
              }}
              animate={reduced ? undefined : { x: [0, 40, 0], y: [0, -24, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 50% -10%, rgba(23,44,82,0.55) 0%, transparent 60%)",
              }}
            />

            {/* logo lockup */}
            <motion.div
              className="relative z-10 flex flex-col items-center"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.75, filter: "blur(14px)" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: reduced ? 0.3 : 1.15, ease: EASE }}
              onAnimationComplete={() => setEntranceDone(true)}
            >
              <div className="relative inline-flex">
                <Wordmark tone="light" height={48} priority className="h-9 w-auto sm:h-12" />

                {!reduced && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `linear-gradient(100deg, transparent 34%, ${GOLD_SOFT} 50%, transparent 66%)`,
                      backgroundSize: "55% 100%",
                      backgroundRepeat: "no-repeat",
                      WebkitMaskImage: "url(/brand/wordmark-inverse.svg)",
                      maskImage: "url(/brand/wordmark-inverse.svg)",
                      WebkitMaskSize: "100% 100%",
                      maskSize: "100% 100%",
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                    }}
                    initial={{ backgroundPosition: "-150% 0%" }}
                    animate={{ backgroundPosition: "250% 0%" }}
                    transition={{ duration: 1.3, delay: 0.7, ease: "easeInOut" }}
                  />
                )}
              </div>

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: reduced ? 0.15 : 0.85, ease: EASE }}
                className="mt-5 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.42em]"
                style={{ color: `${GOLD_SOFT}99` }}
              >
                <span aria-hidden className="h-px w-6" style={{ backgroundColor: `${GOLD}66` }} />
                IT Management
                <span aria-hidden className="h-px w-6" style={{ backgroundColor: `${GOLD}66` }} />
              </motion.p>
            </motion.div>

            {/* circular loader */}
            <motion.div
              className="relative z-10 mt-12 flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: reduced ? 0.2 : 1, ease: "easeOut" }}
            >
              <div className="relative h-14 w-14">
                {!reduced && (
                  <motion.span
                    aria-hidden
                    className="absolute -inset-2 rounded-full"
                    style={{
                      background:
                        "conic-gradient(from 0deg, transparent 0deg, rgba(198,169,108,0.55) 90deg, transparent 200deg)",
                      filter: "blur(7px)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <svg viewBox="0 0 52 52" className="relative h-14 w-14 -rotate-90">
                  <circle
                    cx="26"
                    cy="26"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="1.5"
                  />
                  <motion.circle
                    cx="26"
                    cy="26"
                    r={RING_RADIUS}
                    fill="none"
                    stroke={GOLD}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_LENGTH}
                    animate={{ strokeDashoffset: RING_LENGTH * (1 - progress) }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </svg>
              </div>

              <p className="mt-5 text-[12px] text-white/70">Preparing your workspace...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
