import { formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";

// The confirmation email. Pure: builds subject, HTML and text from plain data. Every value that
// came from a customer is HTML-escaped. No payment identifiers are included.

export type ReservationEmailData = {
  businessName: string;
  contactName: string;
  reference: string;
  zoneName: string;
  households: number;
  issueMonth: string;
  artworkDeadline: string;
  side: "front" | "back";
  positions: string[];
  size: "standard" | "double";
  priceCents: number;
  reservationUrl: string;
  supportEmail: string;
  test?: boolean; // development TEST reservation: preview only, never delivered
};

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function reservationConfirmedEmail(d: ReservationEmailData) {
  const edition = `${d.zoneName} · ${formatIssueMonth(d.issueMonth)}`;
  const position = `${d.side === "front" ? "Front" : "Back"} · ${d.positions.join(" + ")} (${d.size === "double" ? "double size" : "standard"})`;
  const rows: [string, string][] = [
    ["Reference", d.reference],
    ["Edition", `${edition} (planned mailing ≈ ${formatHouseholds(d.households)} homes)`],
    ["Your position", position],
    ["Authorized amount", `${formatPrice(d.priceCents)}, charged only if the campaign fills and is approved`],
    ["Reservation deadline", formatDeadline(d.artworkDeadline)],
    ["Charged today", "Nothing"],
  ];

  const subject = `${d.test ? "[TEST] " : ""}Your Inside914 ad space is reserved (${d.reference})`;
  const testNote = "TEST RESERVATION (development only): not a real booking. No card saved, no payment authorized.";
  const text = [
    ...(d.test ? [testNote, ""] : []),
    `Hi ${d.contactName},`,
    "",
    `Your advertising space for ${d.businessName} is reserved. No payment has been collected.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "What happens next: once all postcard spaces are reserved and the campaign is approved, we'll attempt the authorized charge and let you know. If the campaign doesn't fill by its deadline, your reservation is canceled without charge.",
    "",
    `View your reservation and your ad (private link, don't share it): ${d.reservationUrl}`,
    "",
    `Questions? Email ${d.supportEmail}.`,
    "Inside914 · Local advertising you can verify.",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;font-family:Helvetica,Arial,sans-serif;color:#1c1b19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e4e0d7;border-radius:16px">
${d.test ? `<tr><td style="padding:16px 32px 0"><p style="margin:0;padding:12px;border:2px dashed #c47f00;background:#fdf4e3;color:#8a5a00;font-weight:600;font-size:14px">${testNote}</p></td></tr>` : ""}
<tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:600">Inside<span style="color:#1f5c4a">914</span></td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="margin:0;font-size:24px">Your advertising space is reserved!</h1>
<p style="color:#5f5b53;font-size:15px;line-height:22px">Hi ${escape(d.contactName)}, the space for <strong>${escape(d.businessName)}</strong> is reserved. <strong>No payment has been collected.</strong></p></td></tr>
<tr><td style="padding:8px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5f5b53;width:42%">${escape(k)}</td><td style="padding:6px 0;font-weight:600">${escape(v)}</td></tr>`).join("")}
</table></td></tr>
<tr><td style="padding:8px 32px;color:#5f5b53;font-size:14px;line-height:21px">Once all postcard spaces are reserved and the campaign is approved, we'll attempt the authorized charge and let you know. If the campaign doesn't fill by its deadline, your reservation is canceled without charge.</td></tr>
<tr><td style="padding:16px 32px"><a href="${escape(d.reservationUrl)}" style="display:inline-block;background:#1c1b19;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px">View your reservation and ad</a>
<p style="color:#5f5b53;font-size:12px">This private link is just for you. Please don't share it.</p></td></tr>
<tr><td style="padding:8px 32px 28px;color:#5f5b53;font-size:12px;border-top:1px solid #e4e0d7">Questions? Email <a href="mailto:${escape(d.supportEmail)}" style="color:#1f5c4a">${escape(d.supportEmail)}</a>.<br>Inside914 · Local advertising you can verify.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
