import { z } from "zod";

export const zoneSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  name: z.string().trim().min(1, "Enter a zone name.").max(120),
  slug: z.string().trim().toLowerCase().min(1).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  household_count: z.string().regex(/^\d+$/, "Enter a whole number.").transform(Number).pipe(z.number().int().min(0).max(1000000)),
});
