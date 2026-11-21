import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Symmetric envelope for integration secrets. Postgres only ever stores the
 * output of `encryptSecret`; the key is derived from AUTH_SECRET, so a database
 * dump on its own does not reveal anyone's API key.
 *
 * Format: v1.<iv base64url>.<auth tag base64url>.<ciphertext base64url>
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const secret = process.env.AUTH_SECRET ?? "tasktornado-local-development-secret";
  return createHash("sha256").update(`tasktornado/integrations/${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string | null {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    // Wrong key or tampered payload — treat as unreadable rather than throwing.
    return null;
  }
}

/** Small fingerprint kept in the clear so the UI can mask a saved secret. */
export function secretHint(secret: string): string {
  return secret.length <= 4 ? "" : secret.slice(-4);
}
