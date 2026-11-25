/**
 * The notification chime.
 *
 * Built from oscillators rather than downloaded, because every reason an
 * `<audio>` element goes quiet is a reason this does not: no fetch to be blocked,
 * no codec to be missing, no iOS rule that ignores `volume`. Two notes through a
 * gain node start the instant they are asked to, and the level is ours.
 *
 * Browsers still refuse to make noise until the page has been touched, so the
 * context is created lazily, resumed on every gesture, and reported honestly:
 * `play()` says `blocked` rather than pretending, and the bell explains itself.
 */

export type Chime = {
  /** Called from a real gesture: opens the audio bus and warms the sample. */
  unlock: () => boolean;
  /** Resolves to `blocked` when the browser is still holding audio back. */
  play: () => Promise<"played" | "blocked">;
};

/** The sample used only when Web Audio is missing. */
export const CHIME_SAMPLE = "/sounds/notification.wav";

/** B5 then E6 — a bell, not a beep. */
const NOTES = [
  { hz: 987.67, at: 0, length: 0.42 },
  { hz: 1318.51, at: 0.13, length: 0.6 },
] as const;

const PEAK = 0.5;
const MASTER = 0.5;

/** Just the browser surface this needs, so a test can stand in for it. */
export type ChimeScope = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  Audio?: typeof Audio;
};

export function createChime(scope: ChimeScope = globalThis as unknown as ChimeScope): Chime {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let sample: HTMLAudioElement | null = null;

  function bus(): AudioContext | null {
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    if (!Ctor) return null;
    if (!context) {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER;
      master.connect(context.destination);
    }
    return context;
  }

  function warmSample(): HTMLAudioElement | null {
    if (!sample && scope.Audio) {
      sample = new scope.Audio(CHIME_SAMPLE);
      sample.preload = "auto";
    }
    return sample;
  }

  function unlock() {
    const ctx = bus();
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
    warmSample();
    return ctx?.state === "running";
  }

  async function play(): Promise<"played" | "blocked"> {
    const ctx = bus();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Still asleep — fall through to the sample, then to the hint.
      }
    }

    if (ctx && master && ctx.state === "running") {
      const startsAt = ctx.currentTime + 0.02;
      for (const note of NOTES) {
        const begins = startsAt + note.at;
        const osc = ctx.createOscillator();
        const envelope = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(note.hz, begins);
        envelope.gain.setValueAtTime(0.0001, begins);
        envelope.gain.exponentialRampToValueAtTime(PEAK, begins + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, begins + note.length);
        osc.connect(envelope);
        envelope.connect(master);
        osc.start(begins);
        osc.stop(begins + note.length + 0.02);
      }
      return "played";
    }

    // No Web Audio here, so the sample is the only route left.
    const el = warmSample();
    if (!el) return "blocked";
    try {
      el.currentTime = 0;
    } catch {
      // Metadata is not there yet; it still plays from the start.
    }
    void el.play().catch(() => {});
    return "played";
  }

  return { unlock, play };
}
