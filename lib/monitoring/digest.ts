import { sendMail } from "../email/smtp";
import { statusTone, uptimePercent, type MonitorStatus } from "./core";
import { readBoardView, announce } from "./run";
import { readMonitorSettings } from "./store";

/**
 * The morning summary.
 *
 * One email, once a day, that answers "how did last night go?" without anyone
 * opening the board: what is down now, and what was down overnight.
 */

export type Digest = {
  generatedAt: string;
  sites: { site: string; url: string; tone: string; latencyMs: number | null; uptime24h: number | null }[];
  down: number;
  slow: number;
  incidents: number;
  recipients: string[];
  text: string;
};

export async function buildDigest(now = new Date()): Promise<Digest> {
  const [{ statuses, uptime24h, incidents }, settings] = await Promise.all([
    readBoardView(),
    readMonitorSettings(),
  ]);

  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const overnight = [...incidents.values()].flat().filter((incident) => incident.startedAt >= since);

  const sites = statuses.map((row: MonitorStatus) => ({
    site: row.site,
    url: row.url,
    tone: statusTone(row),
    latencyMs: row.latencyMs,
    uptime24h: uptimePercent(uptime24h.get(row.key)),
  }));

  const down = sites.filter((site) => site.tone === "down").length;
  const slow = sites.filter((site) => site.tone === "slow").length;

  const lines = [
    `Monitoring summary — ${now.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
    "",
    `${sites.length} site${sites.length === 1 ? "" : "s"} watched · ${down} down · ${slow} slow`,
    "",
    ...sites.map(
      (site) =>
        `· ${site.site} — ${site.tone.toUpperCase()}${site.latencyMs !== null ? ` ${site.latencyMs} ms` : ""}${
          site.uptime24h !== null ? ` · ${site.uptime24h}% up (24h)` : ""
        }`,
    ),
    "",
    overnight.length === 0
      ? "No outages in the last 24 hours."
      : `${overnight.length} outage${overnight.length === 1 ? "" : "s"} in the last 24 hours:`,
    ...overnight.slice(0, 20).map((incident) => {
      const ended = incident.endedAt
        ? new Date(incident.endedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : "ongoing";
      const started = new Date(incident.startedAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `· ${incident.site}: ${started} → ${ended}`;
    }),
    "",
    "Open Monitoring for the detail, or reply to whoever is on call.",
  ];

  return {
    generatedAt: now.toISOString(),
    sites,
    down,
    slow,
    incidents: overnight.length,
    recipients: settings.recipientEmails,
    text: lines.join("\n"),
  };
}

/** Build and send; returns what happened, in words the caller can print. */
export async function sendDigest(now = new Date()): Promise<{ digest: Digest; sent: boolean; message: string }> {
  const digest = await buildDigest(now);
  if (digest.recipients.length === 0) {
    return { digest, sent: false, message: "No alert recipients are configured, so no digest was sent." };
  }

  const sent = await sendMail({
    to: digest.recipients,
    subject: `Monitoring summary — ${digest.down} down, ${digest.slow} slow`,
    text: digest.text,
  });

  return sent.ok
    ? { digest, sent: true, message: `Digest sent to ${announce(digest.recipients)}.` }
    : { digest, sent: false, message: `The digest could not be sent — ${sent.error}` };
}
