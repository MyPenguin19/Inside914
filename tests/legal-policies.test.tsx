import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { LegalDocument, legalDocuments, LEGAL_VERSION } from "@/components/legal-document";
import { SiteFooter } from "@/components/site-footer";
import { cartConsentText, consentText, CART_TERMS_VERSION, TERMS_VERSION } from "@/lib/checkout/terms";
import { SUPPORT_EMAIL } from "@/lib/support";
import { RESERVATION_POLICY } from "@/lib/legal/release";
vi.mock("server-only",()=>({}));
import { getEmailEnv } from "@/lib/env/checkout";

const original = readFileSync("docs/legal/2026-10-24-review-4-source.txt", "utf8");
const plain = (text: string) => text.replaceAll("**", "").replace(/\s+/g, " ").trim();
for (const [route, count, part] of [["terms",17,2],["reservation-policy",15,3],["privacy",15,4]] as const) {
  test(`${route} renders every supplied policy paragraph and numbered section`, () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderToStaticMarkup(<LegalDocument document={legalDocuments[route]} />);
    expect(holder.querySelectorAll("section")).toHaveLength(count);
    const source = original.split(`# PART ${part} —`)[1].split(`# PART ${part+1} —`)[0];
    const body = source.slice(source.indexOf("### 1. ")).trim().replace(/---$/, "").trim();
    for (const paragraph of body.split(/\n\n/)) {
      const approvedParagraph = paragraph.replace(/\*\*Status: Proposed policy pending owner(?: verification)? and qualified legal-counsel review\.\*\*/, "**Status: Owner-approved for new reservations, effective November 2, 2026.**");
      const text = plain(approvedParagraph.replace(/^### /," ").replace(/^(?:- |\d+\. )/gm,""));
      // Section numbers remain visible; source list markers are represented by semantic lists.
      expect(plain([...holder.querySelectorAll("h2, p, li")].map(node => node.textContent).join(" "))).toContain(text);
    }
    expect(holder.textContent).toContain("Inside Diagnostics LLC");
    expect(holder.textContent).toContain("Owner-approved for new reservations, effective November 2, 2026.");
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
test("multi consent lists server campaign amounts, exact total, and all approved safeguards",()=>{
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
test("single consent preserves the approved wording with new immutable identifiers",()=>{
  const exact=original.split("## A. SINGLE-CAMPAIGN AUTHORIZATION")[1].split("### Required checkbox wording")[1].split('"')[1];
  expect(consentText(100)).toBe(exact.replace("[ACTUAL AGREED PRICE]","$1"));
  expect(TERMS_VERSION).toBe(LEGAL_VERSION);
  expect(LEGAL_VERSION).toBe(RESERVATION_POLICY.version);
  expect(RESERVATION_POLICY).toMatchObject({effectiveDate:"2026-11-02",approvedForReservations:true});
  expect(CART_TERMS_VERSION).toBe(`square-zones-${LEGAL_VERSION}`);
  expect(readFileSync("docs/legal/archive/2026-10-24-draft-2/checkout-terms.ts.txt","utf8")).toContain('TERMS_VERSION = "2026-10-24-draft-2"');
});

test("new reservation consent wording is byte-identical to the owner's approved draft", () => {
  expect(readFileSync("src/lib/legal/versions/2026-11-02-reservations-1-consent.json"))
    .toEqual(readFileSync("src/lib/legal/versions/2026-10-24-review-4-consent.json"));
});

test.each([
  ["src/lib/legal/versions/2026-10-24-review-4.json", "357c926027c32c822b1cb73c0e03108577c3ed381773cb0ea9b2412044d74599"],
  ["src/lib/legal/versions/2026-10-24-review-4-consent.json", "ccbd7c20883b4e10141e2b16350954267b49065e50acc1e6d0c0f199ce042350"],
  ["docs/legal/2026-10-24-review-4-source.txt", "2f799af0ca92443ba694292b4859cbd16d16fdf620417d6d0375795d1aadc37e"],
])("approved source archive %s remains unchanged", (path, sha) => {
  expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(sha);
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

 test("active policies have clean owner-approved contact sections and reservation wording", () => {
  for (const policy of Object.values(legalDocuments)) {
    const contact = policy.sections.at(-1)!;
    expect(contact.blocks.slice(0,4).map(block => "text" in block ? block.text : "")).toEqual(["Inside914", "Operated by Inside Diagnostics LLC", "Westchester County, New York", "Email: Info@inside914.com"]);
    expect(JSON.stringify(policy)).not.toMatch(/OWNER MUST|TO BE VERIFIED|Business mailing address|ten confirmed paid placements/);
  }
  expect(JSON.stringify(legalDocuments["reservation-policy"])).toContain("ten confirmed reserved advertising positions");
});

test("immutable archive src/lib/legal/versions/2026-10-24-review-3.json is preserved", () => {
 expect(createHash("sha256").update(readFileSync("src/lib/legal/versions/2026-10-24-review-3.json")).digest("hex")).toBe("edf8a4413debcdd13c461919eb87ee19e078cde5818fda81cb9bd1b4f6ad4088");
});

test("immutable archive src/lib/legal/versions/2026-10-24-review-3-consent.json is preserved", () => {
 expect(createHash("sha256").update(readFileSync("src/lib/legal/versions/2026-10-24-review-3-consent.json")).digest("hex")).toBe("ccbd7c20883b4e10141e2b16350954267b49065e50acc1e6d0c0f199ce042350");
});

test("immutable archive docs/legal/2026-10-24-review-3-source.txt is preserved", () => {
 expect(createHash("sha256").update(readFileSync("docs/legal/2026-10-24-review-3-source.txt")).digest("hex")).toBe("e688a5a818cfbcbad23b2c58f578f6b4e1124ba62527fc7e418946cac6beee20");
});
