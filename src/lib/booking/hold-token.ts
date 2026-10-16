import "server-only";
import { createHash, randomBytes } from "node:crypto";

// 256-bit random token for the advertiser's browser; only its SHA-256 is stored.
export function createHoldToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashHoldToken(token) };
}

export function hashHoldToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
