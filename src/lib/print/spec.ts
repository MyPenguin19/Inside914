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

// Separately versioned source dimensions for the new MVP. Do not change the legacy
// PRINT_SPEC above: existing campaign geometry has not been migrated to this product.
// The source dimension arrows anchor the postal panel at the BLEED FILE edges.
// These labeled dimensions establish nominal geometry, not approval of a print run.
export const AMAZINGMAIL_9X6_SPEC = {
  status: "provisional",
  sources: {
    front: "https://assets.xpressdocs.com/dserv/tpl/1500/2/566132.jpg",
    back: "https://assets.xpressdocs.com/dserv/tpl/1500/1/566132.jpg",
  },
  trimInches: { width: 9, height: 6 },
  fileInches: { width: 9.125, height: 6.125 },
  liveInches: { width: 8.75, height: 5.75 },
  postalPanelInches: { width: 3.925, height: 3.33 },
  postalAnchor: "file-bottom-right",
  paidTileInches: 2.5,
} as const;
