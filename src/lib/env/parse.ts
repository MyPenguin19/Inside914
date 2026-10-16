import type { z } from "zod";

// Fails with every missing/invalid variable by name. Values are never included in the message.
export function parseEnv<T extends z.ZodType>(schema: T, values: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(values);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration:\n${problems}\nSet these in .env.local (see .env.example) or in the Vercel project settings.`,
  );
}
