import assert from "node:assert/strict";
import test from "node:test";
import { createChime, type ChimeScope } from "@/lib/notify/chime";

/**
 * A stand-in for the Web Audio surface the chime uses. It records what the
 * chime asked for, so the test can assert on the sound rather than on a mock we
 * wrote to satisfy itself.
 */
function fakeAudio(state: "running" | "suspended" = "running") {
  const starts: { hz: number; at: number; stop: number }[] = [];
  const context = {
    state,
    currentTime: 10,
    destination: {},
    createGain: () => ({
      gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    }),
    createOscillator: () => {
      const osc = {
        type: "sine",
        frequency: { value: 0, setValueAtTime(hz: number) {
          osc.frequency.value = hz;
        } },
        connect() {},
        start(at: number) {
          starts.push({ hz: osc.frequency.value, at, stop: Number.NaN });
        },
        stop(at: number) {
          const last = starts[starts.length - 1];
          last.stop = at;
        },
      };
      return osc;
    },
    // A real context takes a tick to come round after a gesture.
    resume: () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          context.state = "running";
          resolve();
        }, 0);
      }),
  };
  return { context, starts };
}

function scopeWith(context: unknown, sample?: unknown): ChimeScope {
  const AudioContext = function () {
    return context;
  } as unknown as typeof globalThis.AudioContext;
  return { AudioContext, Audio: sample as unknown as typeof Audio };
}

test("a chime is two notes, in order, each with a start and a stop", async () => {
  const { context, starts } = fakeAudio();
  const chime = createChime(scopeWith(context));

  assert.equal(await chime.play(), "played");
  assert.equal(starts.length, 2, "two notes");
  assert.ok(starts[0].hz > 900 && starts[0].hz < 1000, "first note is B5");
  assert.ok(starts[1].hz > 1300 && starts[1].hz < 1400, "second note is E6");
  assert.ok(starts[1].at > starts[0].at, "the second note follows the first");
  for (const note of starts) {
    assert.ok(Number.isFinite(note.stop) && note.stop > note.at, "every note is stopped");
  }
});

test("a sleeping context is woken before the notes are scheduled", async () => {
  const { context, starts } = fakeAudio("suspended");
  const chime = createChime(scopeWith(context));

  assert.equal(chime.unlock(), false, "unlock reports the truth while suspended");
  assert.equal(await chime.play(), "played", "play resumes and still rings");
  assert.equal(context.state, "running");
  assert.equal(starts.length, 2);
});

test("no audio support says so instead of silently doing nothing", async () => {
  const chime = createChime({});
  assert.equal(chime.unlock(), false);
  assert.equal(await chime.play(), "blocked");
});

test("without Web Audio the sample is the fallback", async () => {
  const played: number[] = [];
  function FakeAudio() {
    return {
      preload: "",
      currentIndex: 0,
      currentTime: 0,
      play() {
        played.push(1);
        return Promise.resolve();
      },
    };
  }
  const chime = createChime({
    Audio: FakeAudio as unknown as typeof Audio,
  });

  assert.equal(await chime.play(), "played");
  assert.equal(played.length, 1, "the sample was asked to play");
});

test("one chime object is built once and reused", () => {
  const { context } = fakeAudio();
  let created = 0;
  const AudioContext = function () {
    created += 1;
    return context;
  } as unknown as typeof globalThis.AudioContext;
  const chime = createChime({ AudioContext });

  chime.unlock();
  chime.unlock();
  void chime.play();
  assert.equal(created, 1, "the context is not rebuilt on every ring");
});
