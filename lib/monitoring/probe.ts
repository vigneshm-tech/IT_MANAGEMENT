import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { performance } from "node:perf_hooks";
import { readResponse, type ProbePhases, type ProbeResult } from "./core";

/**
 * One URL, one request, no body.
 *
 * `fetch` was the obvious tool and the wrong one here: it reports a single
 * latency and hides everything behind it. A site that takes two seconds is a
 * different problem when the time went into DNS than when the server sat on the
 * request, so this speaks HTTP directly and times each step.
 *
 * Redirects are followed by hand (three at most) because a monitor should see
 * where the browser ends up, and the certificate is read off the TLS socket so
 * an expiry can be seen before it becomes an outage.
 */

const MAX_REDIRECTS = 3;
const USER_AGENT = "TaskTornado-Monitor/1.0 (+uptime check)";

export type ProbeOptions = {
  timeoutMs: number;
  /** Trust internal/self-signed certificates — for TLS-inspecting networks. */
  insecureTls?: boolean;
  treatAuthAsUp?: boolean;
};

const CERT_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
]);

/** The words a person can act on, for the failures that actually happen. */
export function reasonFor(error: unknown, timeoutMs: number): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "";
  if (code === "ETIMEDOUT" || code === "TTIMEOUT") {
    return `No answer within ${Math.round(timeoutMs / 1000)} seconds.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "That host name does not resolve.";
  if (code === "ECONNREFUSED") return "The connection was refused.";
  if (code === "ECONNRESET" || code === "EPIPE") return "The connection was closed before it answered.";
  if (CERT_CODES.has(code) || /certificate|self.signed/i.test(code)) {
    return "The certificate could not be verified — if this network inspects TLS, turn on “Trust internal certificates” under Settings.";
  }
  if (code === "ERR_INVALID_URL") return "That is not a valid URL.";
  const message = (error as Error | undefined)?.message ?? "The check failed.";
  return message.slice(0, 160);
}

type HopResult = {
  statusCode: number;
  location: string | null;
  certExpiresAt: string | null;
  phases: ProbePhases;
  startedAt: number;
  finishedAt: number;
};

function requestOnce(url: URL, options: ProbeOptions): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const timeoutMs = options.timeoutMs;

    const started = performance.now();
    let dnsMs: number | null = null;
    let connectMs: number | null = null;
    let tlsMs: number | null = null;
    let certExpiresAt: string | null = null;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const request = client.request(
      url,
      {
        method: "GET",
        // A fresh socket per probe: reused connections would hide the handshake
        // timings this whole module exists to report.
        agent: false,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-encoding": "identity",
          connection: "close",
        },
        // Only honoured on https.
        ...(isHttps && options.insecureTls ? { rejectUnauthorized: false } : {}),
      },
      (response) => {
        const finishedAt = performance.now();
        // The body is never read: the status is the answer, and downloading
        // pages would make a monitor cost the site real bandwidth.
        response.resume();
        response.destroy();

        finish(() =>
          resolve({
            statusCode: response.statusCode ?? 0,
            location: response.headers.location ?? null,
            certExpiresAt,
            // All four are measured from the same start, so they read as a
            // timeline: resolved at 4ms, connected at 20ms, TLS done at 60ms,
            // first byte at 180ms.
            phases: {
              dnsMs,
              connectMs,
              tlsMs,
              ttfbMs: Math.round(finishedAt - started),
            },
            startedAt: started,
            finishedAt,
          }),
        );
      },
    );

    request.on("socket", (socket: Socket) => {
      socket.once("lookup", () => {
        dnsMs = Math.round(performance.now() - started);
      });
      socket.once("connect", () => {
        connectMs = Math.round(performance.now() - started);
      });
      socket.once("secureConnect", () => {
        tlsMs = Math.round(performance.now() - started);
        const tlsSocket = socket as Socket & { getPeerCertificate?: () => { valid_to?: string } };
        const validTo = tlsSocket.getPeerCertificate?.()?.valid_to;
        if (validTo) {
          const parsed = new Date(validTo);
          if (!Number.isNaN(parsed.getTime())) certExpiresAt = parsed.toISOString();
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      const error = Object.assign(new Error("Timed out"), { code: "ETIMEDOUT" });
      request.destroy(error);
    });

    request.on("error", (error) => finish(() => reject(error)));
    request.end();
  });
}

export async function probeUrl(rawUrl: string, options: ProbeOptions): Promise<ProbeResult> {
  const attemptStarted = performance.now();
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      statusCode: null,
      latencyMs: null,
      error: "That is not a valid URL.",
      certExpiresAt: null,
      phases: null,
      attempts: 1,
    };
  }

  let hop: HopResult | null = null;
  let redirects = 0;

  try {
    for (;;) {
      hop = await requestOnce(current, options);
      const location = hop.location;
      if (hop.statusCode >= 300 && hop.statusCode < 400 && location && redirects < MAX_REDIRECTS) {
        redirects += 1;
        current = new URL(location, current);
        continue;
      }
      break;
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: Math.round(performance.now() - attemptStarted),
      error: reasonFor(error, options.timeoutMs),
      certExpiresAt: null,
      phases: null,
      attempts: 1,
    };
  }

  const result = readResponse(hop!.statusCode, Math.round(hop!.finishedAt - hop!.startedAt), {
    treatAuthAsUp: options.treatAuthAsUp,
  });

  return {
    ...result,
    // Total time for the whole hop chain, so a redirect loop cannot look fast.
    latencyMs: Math.round(performance.now() - attemptStarted),
    certExpiresAt: hop!.certExpiresAt,
    phases: hop!.phases,
    attempts: 1,
  };
}
