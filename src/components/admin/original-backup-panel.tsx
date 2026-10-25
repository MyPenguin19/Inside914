import { Card } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { campaignOriginals, inspectOriginal, locateOriginals } from "@/lib/admin/originals";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimestamp } from "@/lib/format-admin";
import { ArtworkBackupControls, OriginalDownload } from "./original-download";

export async function OriginalBackupPanel({ bookingId }: { bookingId: string }) {
  const { supabase } = await requireAdmin();
  let source;
  try {
    const located = (await locateOriginals(supabase, bookingId))?.[0];
    if (!located) return null;
    source = await inspectOriginal(createAdminClient(), located);
  } catch { return <p role="alert" className="text-sm text-warning">Could not verify the original source. Reload to retry; no artwork was changed.</p>; }
  return <Card>
      <h2 className="font-semibold">Original Artwork</h2>
      <p className="mt-2 text-sm">{source.width && source.height ? `${source.width} × ${source.height} px` : "Dimensions unavailable"} · {source.mime?.replace("image/", "").toUpperCase() ?? "Unknown format"} · {source.bytes !== null ? `${source.bytes.toLocaleString()} bytes` : "Size unavailable"}</p>
      <p className="my-2 text-xs text-muted">Source recorded: {formatTimestamp(source.uploadedAt)} · Review: {source.review.replaceAll("_", " ")}</p>
      <OriginalDownload source={source} />
      <p className="mt-2 text-xs text-muted">Uncropped source, with a generated download filename. Downloading preserves resolution; it does not improve quality or approve printing.</p>
    </Card>;
}

export async function CampaignArtworkBackup({ campaignId }: { campaignId: string }) {
  const { supabase } = await requireAdmin();
  let plan;
  try {
    plan = await campaignOriginals(supabase, createAdminClient(), campaignId);
  } catch { return <p role="alert" className="text-sm text-warning">Could not prepare the artwork backup within its limits. Reload to retry or download individual originals from Advertisers; no artwork was changed.</p>; }
  if (!plan) return null;
  return <Card><h2 className="mb-3 text-lg font-semibold">Artwork Backup</h2><ArtworkBackupControls campaignId={campaignId} initial={plan} /></Card>;
}
