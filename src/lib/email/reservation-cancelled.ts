import { formatIssueMonth } from "@/lib/format";
import { escapeHtml } from "./escape";

// Sent when Inside914 cancels a confirmed reservation. Pure: builds subject, HTML and text from
// plain data, HTML-escaping every customer value. The internal cancellation reason and any
// private link are deliberately left out.

export type CancellationEmailData = {
  businessName: string;
  contactName: string;
  reference: string;
  zoneName: string;
  issueMonth: string;
  side: "front" | "back";
  positions: string[];
  supportEmail: string;
  test?: boolean; // development TEST reservation: preview only, never delivered
  notFull?: boolean; // the whole campaign was cancelled because it didn't fill by its deadline
  // The saved card's state when the email is sent: "removed" only once Stripe confirmed the detach.
  card: "removed" | "pending" | "none" | "shared";
};

const CARD_SUMMARY: Record<CancellationEmailData["card"], string> = {
  removed: "You have not been charged, and your saved card has been removed from our payment processor.",
  pending: "You have not been charged, and this reservation can no longer be charged. Your saved card is being removed from our payment processor.",
  none: "You have not been charged.",
  shared: "You have not been charged for this reservation, and it can no longer be charged. Your saved card remains available for your other active reservations.",
};

export function reservationCancelledEmail(d: CancellationEmailData) {
  const edition = `${d.zoneName} · ${formatIssueMonth(d.issueMonth)}`;
  const position = `${d.side === "front" ? "Front" : "Back"} · ${d.positions.join(" + ")}`;
  const rows: [string, string][] = [
    ["Reference", d.reference],
    ["Edition", edition],
    ["Position", position],
    ["Charged", "Nothing"],
  ];
  const subject = d.notFull
    ? `${d.test ? "[TEST] " : ""}Your Inside914 campaign didn't fill, so your reservation was canceled (${d.reference})`
    : `${d.test ? "[TEST] " : ""}Your Inside914 reservation was canceled (${d.reference})`;
  const summary = CARD_SUMMARY[d.card];
  const why = d.notFull ? " The campaign wasn't fully reserved by its deadline, so it won't be printed." : "";

  const text = [
    `Hi ${d.contactName},`,
    "",
    `Your Inside914 reservation for ${d.businessName} has been canceled.${why} ${summary}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Questions, or want to reserve again? Email ${d.supportEmail}.`,
    "Inside914 · Local advertising you can verify.",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;font-family:Helvetica,Arial,sans-serif;color:#1c1b19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e4e0d7;border-radius:16px">
<tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:600">Inside<span style="color:#1f5c4a">914</span></td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="margin:0;font-size:24px">${d.notFull ? "Your campaign didn&#39;t fill" : "Your reservation was canceled"}</h1>
<p style="color:#5f5b53;font-size:15px;line-height:22px">Hi ${escapeHtml(d.contactName)}, the reservation for <strong>${escapeHtml(d.businessName)}</strong> has been canceled.${escapeHtml(why)} <strong>${summary}</strong></p></td></tr>
<tr><td style="padding:8px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5f5b53;width:42%">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join("")}
</table></td></tr>
<tr><td style="padding:16px 32px 28px;color:#5f5b53;font-size:12px;border-top:1px solid #e4e0d7">Questions, or want to reserve again? Email <a href="mailto:${escapeHtml(d.supportEmail)}" style="color:#1f5c4a">${escapeHtml(d.supportEmail)}</a>.<br>Inside914 · Local advertising you can verify.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
