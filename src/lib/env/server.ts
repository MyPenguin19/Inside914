import "server-only";
import { z } from "zod";
import { parseEnv } from "./parse";
import { getPublicEnv, type PublicEnv } from "./public";

const looksLikeJwt = (key: string) => key.split(".").length === 3;

const ServerEnv = z.object({
  SUPABASE_SECRET_KEY: z
    .string({ message: "is required for server-side admin access (Supabase dashboard > API Keys > secret key)" })
    .refine(
      (key) => key.startsWith("sb_secret_") || looksLikeJwt(key),
      "must be a secret key (sb_secret_...) or the legacy service_role key",
    ),
});

export type ServerEnv = PublicEnv & z.infer<typeof ServerEnv>;

// Server-only: importing this from a Client Component fails the build.
export function getServerEnv(): ServerEnv {
  const publicEnv = getPublicEnv();
  const serverEnv = parseEnv(ServerEnv, { SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  if (serverEnv.SUPABASE_SECRET_KEY === publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Invalid environment configuration:\n  - SUPABASE_SECRET_KEY: is the same as the publishable key");
  }
  return { ...publicEnv, ...serverEnv };
}
