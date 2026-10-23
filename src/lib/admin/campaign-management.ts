export type UpgradePreview = {
  already?: boolean;
  eligible: boolean;
  fingerprint?: string;
  reasons: string[];
  warning?: string;
  mapping?: { slot_id: string; label: string; side: string; from: { width: number; height: number }; to: { width: number; height: number } }[];
};
