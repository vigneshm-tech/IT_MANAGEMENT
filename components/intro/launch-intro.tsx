"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { dismissIntroAction } from "@/app/(app)/intro/actions";
import { IntroRevealContext } from "@/components/intro/intro-context";

const CANVAS = "#ffffff";
const GOLD_SOFT = "#e9ddc3";
const EASE = [0.22, 1, 0.36, 1] as const;
const LOGO_RATIO = "14965.96 / 1619.92";

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
  const [ready, setReady] = useState(false);
  const [entranceDone, setEntranceDone] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");

  const finish = useCallback(() => setReady(true), []);

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

    const guard = window.setTimeout(() => {
      if (!cancelled) finish();
    }, READINESS_GUARD_MS);

    (async () => {
      try {
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready;
        }
        await nextFrame();
        await nextFrame();
        await preloadAsset("/brand/wordmark.svg");
        if (typeof document !== "undefined" && document.readyState !== "complete") {
          await new Promise<void>((resolve) => {
            window.addEventListener("load", () => resolve(), { once: true });
          });
        }
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
    <IntroRevealContext.Provider value={showPage}>
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
            aria-label="Loading TaskTornado"
            className="fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden px-6"
            style={{ backgroundColor: CANVAS }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.25 : 0.65, ease: "easeInOut" }}
          >
            {/* logo lockup — nothing but the mark */}
            <motion.div
              className="relative z-10 flex flex-col items-center"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.75, filter: "blur(14px)" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: reduced ? 0.3 : 1.15, ease: EASE }}
              onAnimationComplete={() => setEntranceDone(true)}
            >
              <div className="relative inline-flex h-9 sm:h-12" style={{ aspectRatio: LOGO_RATIO }}>
                {/* Painted from the same token the page headings use, so the
                    launch mark can never drift away from the type. */}
                <span
                  aria-hidden
                  className="h-full w-full"
                  style={{
                    backgroundColor: "var(--color-navy)",
                    WebkitMaskImage: "url(/brand/wordmark.svg)",
                    maskImage: "url(/brand/wordmark.svg)",
                    WebkitMaskSize: "100% 100%",
                    maskSize: "100% 100%",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                  }}
                />

                {!reduced && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `linear-gradient(100deg, transparent 34%, ${GOLD_SOFT} 50%, transparent 66%)`,
                      backgroundSize: "55% 100%",
                      backgroundRepeat: "no-repeat",
                      WebkitMaskImage: "url(/brand/wordmark.svg)",
                      maskImage: "url(/brand/wordmark.svg)",
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
            </motion.div>

            {/* three-plane orbit loader — gold on white, no glow, no shadow */}
            <motion.div
              className="relative z-10 mt-14"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: reduced ? 0.15 : 0.95, ease: "easeOut" }}
            >
              <div className="tt-loader" aria-hidden>
                <span className="tt-loader-ring" data-ring="one" />
                <span className="tt-loader-ring" data-ring="two" />
                <span className="tt-loader-ring" data-ring="three" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </IntroRevealContext.Provider>
  );
}
