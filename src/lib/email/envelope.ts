import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const Envelope = z.object({
  from: z.string().min(1), to: z.email(), subject: z.string(), html: z.string(), text: z.string(),
});
export type EmailEnvelope = z.infer<typeof Envelope>;
function key() {
  const value = process.env.EMAIL_PAYLOAD_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error("email_encryption_not_configured");
  return Buffer.from(value, "hex");
}
// Stable envelope (including sender and access URL), encrypted at rest separately from DB keys.
// Keep this key available until all envelopes encrypted with it have been retired.
export function encryptEnvelope(value: EmailEnvelope, logicalKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(logicalKey));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(Envelope.parse(value))), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptEnvelope(value: string, logicalKey: string): EmailEnvelope {
  try {
    const [version, iv, tag, body] = value.split(".");
    if (version !== "v1") throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(logicalKey));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Envelope.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString()));
  } catch { throw new Error("email_envelope_unavailable"); }
}
