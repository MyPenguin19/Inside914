// PROVISIONAL print settings, for development only. Replace every value with the printer's
// approved template before production; nothing built from these is a print-approved proof.
export const PRINT_SPEC = {
  status: "provisional" as "provisional" | "approved",
  // Finished (trimmed) postcard size.
  trimInches: { width: 6.5, height: 12 },
  // Unknown until the printer's template arrives; previews show no bleed.
  bleedInches: null as number | null,
  // Keep important text and logos at least this far inside the ad's edges.
  safeMarginInches: 0.125,
  // Effective resolution of the artwork at its printed size, in pixels per inch.
  // Below `recommendedPpi` we warn; below `minimumPpi` we warn strongly. We never block.
  recommendedPpi: 300,
  minimumPpi: 150,
} as const;
