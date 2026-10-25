"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { archiveIssue, type OriginalPlan, type OriginalSource } from "@/lib/artwork/original-types";
import { fetchOriginal, OriginalZip, originalManifest, saveDownload, type ManifestEntry } from "@/lib/artwork/original-archive";

export function OriginalDownload({ source }: { source: OriginalSource }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function download() {
    setBusy(true); setMessage("");
    try {
      const file = await fetchOriginal(source);
      saveDownload(new Blob([file.bytes], { type: file.mime }), source.filename);
      setMessage(`Original saved · ${file.width} × ${file.height} px · ${file.size.toLocaleString()} bytes · SHA-256 ${file.sha256}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Download failed. Reload and retry."); }
    finally { setBusy(false); }
  }
  return <div className="grid min-w-0 gap-2">
    <Button variant="secondary" onClick={download} disabled={busy || !!source.issue}>{busy ? "Checking original…" : "Download Original"}</Button>
    {source.issue && <p className="text-sm text-warning">{source.issue}</p>}
    {message && <p role="status" className="break-all text-xs text-muted">{message}</p>}
  </div>;
}

export function ArtworkBackupControls({ campaignId, initial }: { campaignId: string; initial: OriginalPlan }) {
  const [plan, setPlan] = useState(initial), [history, setHistory] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function refresh(includeHistory: boolean) {
    const response = await fetch(`/admin/campaigns/${campaignId}/originals?history=${includeHistory ? "1" : "0"}`, { cache: "no-store", referrerPolicy: "no-referrer", redirect: "error" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not read originals.");
    setPlan(result); return result as OriginalPlan;
  }
  async function download() {
    setBusy(true); setMessage("Checking current source records…");
    try {
      const current = await refresh(history), limit = current.archiveIssue ?? archiveIssue(current.sources);
      if (limit) throw new Error(limit);
      const zip = new OriginalZip(), manifest: ManifestEntry[] = [];
      let count = 0;
      for (const source of current.sources) {
        setMessage(`Preparing original ${manifest.length + 1} of ${current.sources.length}…`);
        try {
          if (source.issue) throw new Error(source.issue);
          const file = await fetchOriginal(source);
          const { bytes, ...metadata } = file;
          zip.add(source.filename, bytes); manifest.push({ source, ...metadata, filename: source.filename }); count++;
        } catch (e) { manifest.push({ source, error: e instanceof Error ? e.message : "Source unavailable." }); }
      }
      const missing = manifest.length - count;
      zip.add("manifest.csv", originalManifest(manifest));
      zip.add("README.txt", new TextEncoder().encode(`${missing ? "INCOMPLETE BACKUP" : "Original artwork backup"}\n${count} originals verified; ${missing} unavailable. See manifest.csv.\nFiles preserve source bytes; downloading does not improve resolution or approve printing.\nHistorical files are not current approved artwork. Existing source hashes are compared when recorded; otherwise the manifest records the SHA-256 measured now.\nThis manual export does not replace the owner's offsite database and Storage backup.\n`));
      saveDownload(zip.finish(), current.filename.replace(".zip", missing ? "_INCOMPLETE.zip" : history ? "_With-History.zip" : ".zip"));
      setMessage(`${missing ? "Incomplete archive" : "Archive saved"}: ${count} originals verified, ${missing} unavailable. Review manifest.csv.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Archive failed. Download originals individually."); }
    finally { setBusy(false); }
  }
  const current = plan.sources.filter(s => s.kind === "current"), missing = current.filter(s => s.issue);
  return <div className="grid min-w-0 gap-3">
    <p className="text-sm">{plan.advertisers} advertisers · {current.length - missing.length} current originals available · {missing.length} unavailable</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={history} disabled={busy} onChange={async e => {
      const checked = e.target.checked; setHistory(checked); setBusy(true); setMessage("");
      try { await refresh(checked); } catch (error) { setHistory(!checked); setMessage(error instanceof Error ? error.message : "Could not load history."); } finally { setBusy(false); }
    }} />Include retained historical originals</label>
    <div><Button variant="secondary" disabled={busy || !plan.sources.length || !!plan.archiveIssue} onClick={download}>{busy ? "Preparing backup…" : "Download All Original Artwork"}</Button></div>
    {plan.archiveIssue && <p role="alert" className="text-sm text-warning">{plan.archiveIssue}</p>}
    {message && <p role="status" className="text-sm break-words">{message}</p>}
    <details><summary className="cursor-pointer text-sm underline">Individual originals and missing files</summary>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{plan.sources.map(source => <li key={`${source.bookingId}-${source.version}`} className="grid min-w-0 gap-2 rounded-xl border border-line p-3">
        <p className="break-words text-sm">{source.business} · {source.position}{source.kind === "historical" ? " · Historical (not current)" : ""}</p><OriginalDownload source={source} />
      </li>)}</ul>
    </details>
    <p className="text-xs text-muted">Exact source files, unchanged. Missing files are listed in the manifest and the archive is labeled incomplete. ZIP limit: 100 MB; larger backups use individual downloads. This does not replace your offsite backup.</p>
  </div>;
}
