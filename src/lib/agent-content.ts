import { REGIONS } from "./catalog/regions";
import { PUBLIC_CHECKOUT_RELEASED, CHECKOUT_CLOSED_MESSAGE } from "./checkout/release";
import { POLICY_LINKS } from "./legal/public-policies";
import { ADVERTISED_BACK_PRICE_LABEL, ADVERTISED_PRICE_LABEL, ADVERTISING_FAQ, CAMPAIGN_STEPS, HOME_INTRO, MARKETING_PAGES } from "./marketing-content";
import { absoluteUrl } from "./seo";
import { BUSINESS_ADDRESS_LABEL, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "./support";

const link = (label: string, path: string) => `[${label}](${absoluteUrl(path)})`;
const regionLinks = REGIONS.map(area => `- ${link(area.name, `/areas/${area.slug}`)}`).join("\n");
const policyLinks = POLICY_LINKS.map(policy => `- ${link(policy.title, `/legal/${policy.slug}`)}: ${policy.description}`).join("\n");

// Public editorial content only: never include customer, campaign-token or admin data.
// The steps, FAQs, advertised price and release notice use the HTML page's sources.
export const HOME_MARKDOWN = `# Inside914 — Your Business. Westchester Mailboxes.

> Shared postcard advertising for local businesses in Westchester County, New York.

${HOME_INTRO}

Prices shown per area. Choose one or multiple areas. $0 at reservation.
${PUBLIC_CHECKOUT_RELEASED ? "" : `\n${CHECKOUT_CLOSED_MESSAGE}\n`}
${link("Explore Advertising Areas", "/areas")} · ${link("How It Works", "/how-it-works")}

## How it works

${CAMPAIGN_STEPS.map((step, index) => `${index + 1}. **${step.title}.** ${step.body}`).join("\n")}

## Pricing

${ADVERTISED_PRICE_LABEL} per area for one front advertising space or ${ADVERTISED_BACK_PRICE_LABEL} per area for one smaller back space on a shared postcard mailed within your selected Westchester area. Choose as many available areas as you want. Nothing is charged today.

Each area is its own campaign with ten advertising spaces. Review the selected campaign's price and details before reserving.

${link("View pricing and payment details", "/pricing")}

## Our postcard

The sample shows six advertising spaces on the front and four on the back, plus an Inside914 panel and a reserved mailing panel. Sample business names and artwork are illustrative, not live availability or a final campaign proof.

${link("Explore the postcard layout and artwork tips", "/our-postcard")}

## Good to know

${ADVERTISING_FAQ.slice(0, 5).map(({ q, a }) => `### ${q}\n\n${a}`).join("\n\n")}

${link("Read all advertising questions", "/faq")}

## Explore Westchester advertising areas

Compare the four proposed regions before exploring campaign positions and prices.

${regionLinks}

## About and contact

Inside914 is operated by Inside Diagnostics LLC.

${link("About Inside914", "/about")} · ${link("Contact us", "/contact")}

Email: [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}) · Phone: [${SUPPORT_PHONE}](${SUPPORT_PHONE_HREF})

## Policies

${policyLinks}
`;

export const LLMS_TEXT = `# Inside914

> Shared postcard advertising for local businesses in Westchester County, New York. Operated by Inside Diagnostics LLC.

Business address: ${BUSINESS_ADDRESS_LABEL}, United States. Email: ${SUPPORT_EMAIL}. Phone: ${SUPPORT_PHONE}.

Businesses share a postcard with ten paid positions: six front and four back. Each area is a separate campaign. Reservation costs $0 today; collection depends on the agreed campaign conditions. Current availability and agreed prices are shown on the advertising areas page. Regional groupings do not guarantee delivery to every address.

The homepage supports Accept: text/markdown. The same public summary is available at /index.md. Other links below lead to public HTML pages. The linked policy documents govern reservations.

## Start here

- ${link("Homepage in Markdown", "/index.md")}: Public advertising overview, steps, pricing and common questions.
${Object.entries(MARKETING_PAGES).filter(([path]) => path !== "/").map(([path, page]) => `- ${link(page.title, path)}: ${page.description}`).join("\n")}

## Advertising areas

${regionLinks}

## Policies

${policyLinks}

## Site discovery

- ${link("Sitemap", "/sitemap.xml")}: Canonical public pages and their last significant update dates.
- ${link("Robots and content signals", "/robots.txt")}: Crawl and content-use preferences.
`;

export function homepageMarkdownResponse(method = "GET") {
  return new Response(method === "HEAD" ? null : HOME_MARKDOWN, { headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    // The negotiated response must never replace HTML in shared caches.
    "Cache-Control": "private, no-store",
    Vary: "Accept",
    Link: `<${absoluteUrl("/")}>; rel="canonical", <${absoluteUrl("/llms.txt")}>; rel="describedby"`,
  } });
}
