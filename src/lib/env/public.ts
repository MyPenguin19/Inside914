import { z } from "zod";
import { parseEnv } from "./parse";

const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "must be the project URL, e.g. https://<ref>.supabase.co" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ message: "is required (Supabase dashboard > Project Settings > API Keys > publishable key)" })
    .min(1, "is required")
    .refine((key) => !key.startsWith("sb_secret_"), "is a SECRET key; use the publishable key here"),
});

export type PublicEnv = z.infer<typeof PublicEnv>;

// Safe for the browser. Each variable is referenced literally so Next.js inlines it at build time.
export function getPublicEnv(): PublicEnv {
  return parseEnv(PublicEnv, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
