import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { probeUrl } from "../lib/monitoring/probe";

/**
 * The probe against a server that is actually listening.
 *
 * These are the answers Monitoring has to read correctly — a healthy page, a
 * missing one, a redirect, a hang, a refusal and a login prompt — and they are
 * cheap to reproduce because the server is in this file.
 */

let server: Server;
let base = "";
let closedPort = 0;

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/ok") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>ok</h1>");
      return;
    }
    if (url === "/redirect") {
      res.writeHead(302, { location: "/ok" });
      res.end();
      return;
    }
    if (url === "/missing") {
      res.writeHead(404);
      res.end("nope");
      return;
    }
    if (url === "/boom") {
      res.writeHead(503);
      res.end("down");
      return;
    }
    if (url === "/login") {
      res.writeHead(401, { "www-authenticate": "NTLM" });
      res.end();
      return;
    }
    if (url === "/hang") {
      // Deliberately never answers.
      return;
    }
    res.writeHead(200);
    res.end("ok");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // A port that was listening and is not any more: a refused connection.
  const throwaway = createServer();
  await new Promise<void>((resolve) => throwaway.listen(0, "127.0.0.1", resolve));
  closedPort = (throwaway.address() as AddressInfo).port;
  await new Promise<void>((resolve) => throwaway.close(() => resolve()));
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a page that answers is up, with the time it took split into phases", async () => {
  const result = await probeUrl(`${base}/ok`, { timeoutMs: 3_000 });
  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.error, null);
  assert.equal(result.attempts, 1);
  assert.ok((result.latencyMs ?? 0) >= 0);
  // The phases are a timeline measured from the same start.
  assert.ok(result.phases, "phases are reported");
  assert.ok((result.phases?.dnsMs ?? 0) >= 0);
  assert.ok((result.phases?.ttfbMs ?? 0) >= 0);
});

test("a missing page and a broken one are both down, and say which", async () => {
  const missing = await probeUrl(`${base}/missing`, { timeoutMs: 3_000 });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "HTTP 404");

  const broken = await probeUrl(`${base}/boom`, { timeoutMs: 3_000 });
  assert.equal(broken.ok, false);
  assert.equal(broken.error, "HTTP 503");
});

test("a redirect is followed to the answer the browser would see", async () => {
  const result = await probeUrl(`${base}/redirect`, { timeoutMs: 3_000 });
  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
});

test("a login prompt is down unless the workspace says otherwise", async () => {
  const strict = await probeUrl(`${base}/login`, { timeoutMs: 3_000 });
  assert.equal(strict.ok, false);
  assert.equal(strict.statusCode, 401);

  const lenient = await probeUrl(`${base}/login`, { timeoutMs: 3_000, treatAuthAsUp: true });
  assert.equal(lenient.ok, true);
});

test("a server that never answers times out in words", async () => {
  const started = Date.now();
  const result = await probeUrl(`${base}/hang`, { timeoutMs: 400 });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /No answer within/);
  // It gave up at the timeout, not at some default eight seconds.
  assert.ok(Date.now() - started < 3_000, "the short timeout was honoured");
});

test("a refused connection is down, and says so", async () => {
  const result = await probeUrl(`http://127.0.0.1:${closedPort}/ok`, { timeoutMs: 1_000 });
  assert.equal(result.ok, false);
  assert.equal(result.error, "The connection was refused.");
});
