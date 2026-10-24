import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { LegalDocument, legalDocuments, LEGAL_VERSION } from "@/components/legal-document";
import { SiteFooter } from "@/components/site-footer";
import { cartConsentText, consentText, CART_TERMS_VERSION, TERMS_VERSION } from "@/lib/checkout/terms";
import { SUPPORT_EMAIL } from "@/lib/support";
vi.mock("server-only",()=>({}));
import { getEmailEnv } from "@/lib/env/checkout";

const original = readFileSync("docs/legal/2026-10-24-review-3-source.txt", "utf8");
const plain = (text: string) => text.replaceAll("**", "").replace(/\s+/g, " ").trim();
for (const [route, count, part] of [["terms",17,2],["reservation-policy",15,3],["privacy",15,4]] as const) {
  test(`${route} renders every supplied policy paragraph and numbered section`, () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderToStaticMarkup(<LegalDocument document={legalDocuments[route]} />);
    expect(holder.querySelectorAll("section")).toHaveLength(count);
    const source = original.split(`# PART ${part} —`)[1].split(`# PART ${part+1} —`)[0];
    const body = source.slice(source.indexOf("### 1. ")).trim().replace(/---$/, "").trim();
    for (const paragraph of body.split(/\n\n/)) {
      const text = plain(paragraph.replace(/^### /," ").replace(/^(?:- |\d+\. )/gm,""));
      // Section numbers remain visible; source list markers are represented by semantic lists.
      expect(plain([...holder.querySelectorAll("h2, p, li")].map(node => node.textContent).join(" "))).toContain(text);
    }
    expect(holder.textContent).toContain("Inside Diagnostics LLC");
    expect(holder.textContent).toContain("pending");
    expect(holder.querySelectorAll('a[href="mailto:Info@inside914.com"]').length).toBeGreaterThan(0);
    expect(holder.textContent).not.toContain("support@inside914.com");
  });
}

test("footer keeps the three existing policy links and identifies the brand operator",()=>{
  const holder=document.createElement("div");holder.innerHTML=renderToStaticMarkup(<SiteFooter/>);
  for(const route of Object.keys(legalDocuments)) expect(holder.querySelector(`a[href="/legal/${route}"]`)).not.toBeNull();
  expect(holder.querySelector('a[href="mailto:Info@inside914.com"]')).not.toBeNull();
  expect(holder.textContent).toContain("Inside914 is operated by Inside Diagnostics LLC");
});
test("multi consent lists server campaign amounts, exact total, and all proposed safeguards",()=>{
  const text=cartConsentText([{name:"Central January",amount:100},{name:"Eastern January",amount:39900},{name:"Northern February",amount:44950}]);
  expect(text).toContain("Central January: $1\nEastern January: $399\nNorthern February: $449.50");
  expect(text).toContain("will not exceed $849.50");
  expect(text).toContain("No payment is collected today");
  expect(text).toContain("not subscriptions or recurring payments");
  expect(text).toContain("Completion of one selected campaign does not authorize charging any other campaign");
  const exact=original.split("## B. MULTI-CAMPAIGN AUTHORIZATION")[1].split("### Required checkbox wording")[1].split('"')[1];
  expect(text.endsWith(exact.replace("[ACTUAL SERVER-COMPUTED COMBINED TOTAL]","$849.50"))).toBe(true);
  expect(cartConsentText([{name:"Intentional test",amount:100}])).toBe(consentText(100));
  expect(()=>cartConsentText([])).toThrow();
});
test("single consent matches the complete proposed wording and new immutable identifiers",()=>{
  const exact=original.split("## A. SINGLE-CAMPAIGN AUTHORIZATION")[1].split("### Required checkbox wording")[1].split('"')[1];
  expect(consentText(100)).toBe(exact.replace("[ACTUAL AGREED PRICE]","$1"));
  expect(TERMS_VERSION).toBe(LEGAL_VERSION);
  expect(CART_TERMS_VERSION).toBe(`square-zones-${LEGAL_VERSION}`);
  expect(readFileSync("docs/legal/archive/2026-10-24-draft-2/checkout-terms.ts.txt","utf8")).toContain('TERMS_VERSION = "2026-10-24-draft-2"');
});
test("support defaults and same-address overrides use owner capitalization without changing sender",()=>{
  try {
    vi.stubEnv("EMAIL_FROM","Inside914 <no-reply@inside914.com>");
    for(const configured of ["","info@inside914.com","Info@inside914.com"]) {
      vi.stubEnv("SUPPORT_EMAIL",configured);
      expect(getEmailEnv().supportEmail).toBe(SUPPORT_EMAIL);
      expect(getEmailEnv().from).toBe("Inside914 <no-reply@inside914.com>");
    }
    vi.stubEnv("SUPPORT_EMAIL","local-fixture@example.com");
    expect(getEmailEnv().supportEmail).toBe("local-fixture@example.com");
  } finally {vi.unstubAllEnvs();}
});
