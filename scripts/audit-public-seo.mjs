// GET-only crawl; local by default. The explicit --production flag permits only the
// owner-authorized canonical host. Never submits forms, checkout or provider API requests.
// Usage: npm run test:seo -- http://localhost:3100 [--preview]
// Release: npm run test:seo -- https://inside914.com --production
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const base = new URL(process.argv[2] ?? "http://localhost:3100");
const preview = process.argv.includes("--preview");
const canonical = "https://inside914.com";
const production = process.argv.includes("--production");
assert(production ? base.href === `${canonical}/` && !preview : ["localhost", "127.0.0.1"].includes(base.hostname), "Use a local server or the explicitly authorized production host");
const regions = ["central", "southern", "northern", "eastern"].map(region => `/areas/${region}-westchester`);
const policies = ["terms", "reservation-policy", "payment-authorization", "cancellation-policy", "privacy"].map(slug => `/legal/${slug}`);
const paths = ["/", "/how-it-works", "/areas", ...regions, "/pricing", "/our-postcard", "/faq", "/contact", "/about", ...policies];
const cache = new Map();
const external = new Set();
let links = 0;
async function get(path) {
  if (cache.has(path)) return cache.get(path);
  let url = new URL(path, base);
  const chain = [];
  for (;;) {
    assert.equal(url.origin, base.origin, "A public internal route redirected outside the selected site");
    assert(!chain.includes(url.href), `Redirect loop: ${path}`);
    chain.push(url.href);
    assert(chain.length <= 3, `Repeated redirects: ${path}`);
    const response = await fetch(url, { redirect: "manual", headers: { "user-agent": "Googlebot" }, signal: AbortSignal.timeout(20000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get("location"), url);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const doc = /html/.test(contentType) ? new JSDOM(bytes.toString()).window.document : null;
    const result = { status: response.status, headers: response.headers, contentType, bytes, doc, chain, url };
    cache.set(path, result);
    return result;
  }
}
const titles = new Set(), descriptions = new Set(), pages = [];
for (const path of paths) {
  const result = await get(path);
  assert.equal(result.status, 200, path);
  assert.equal(result.chain.length, 1, `${path} unexpectedly redirects`);
  const { doc } = result;
  const meta = selector => {
    const nodes = doc.querySelectorAll(selector);
    assert.equal(nodes.length, 1, `${path}: expected exactly one ${selector}`);
    return nodes[0].getAttribute("content") ?? nodes[0].getAttribute("href");
  };
  const title = doc.title;
  const description = meta('meta[name="description"]');
  assert(title.endsWith(" | Inside914") && title.split("Inside914").length === 2, `${path}: title`);
  assert(description.length >= 100, `${path}: missing useful description`);
  assert(!titles.has(title), `Duplicate title: ${path}`); titles.add(title);
  assert(!descriptions.has(description), `Duplicate description: ${path}`); descriptions.add(description);
  assert.equal(new URL(meta('link[rel="canonical"]')).href, canonical + path);
  assert.equal(new URL(meta('meta[property="og:url"]')).href, canonical + path);
  assert.equal(meta('meta[property="og:title"]'), title);
  assert.equal(meta('meta[property="og:description"]'), description);
  assert.equal(meta('meta[name="twitter:card"]'), "summary_large_image");
  const noindex = /noindex/.test(meta('meta[name="robots"]'));
  assert.equal(noindex, preview, `${path}: indexing policy`);
  assert.equal(/noindex/.test(result.headers.get("x-robots-tag") ?? ""), preview);
  assert.equal(doc.querySelectorAll("h1").length, 1, `${path}: H1 count`);
  let level = 0;
  for (const h of doc.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")) {
    const next = Number(h.tagName.slice(1));
    assert(next <= level + 1, `${path}: skipped heading level`); level = next;
    assert(h.textContent.trim(), `${path}: empty heading`);
  }
  for (const img of doc.querySelectorAll("img")) {
    assert(img.hasAttribute("alt"), `${path}: image missing alt`);
    assert(img.getAttribute("width") && img.getAttribute("height") || img.getAttribute("style")?.includes("aspect-ratio"), `${path}: image needs reserved dimensions`);
  }
  for (const img of doc.querySelectorAll('[role="img"], svg:not([aria-hidden="true"])')) {
    assert(img.getAttribute("aria-label") || img.getAttribute("aria-labelledby") || img.querySelector("title"), `${path}: graphic without accessible name`);
  }
  const schema = [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap(script => JSON.parse(script.textContent));
  const pageType = path === "/faq" ? "FAQPage" : path === "/contact" ? "ContactPage" : path === "/about" ? "AboutPage" : path === "/areas" ? "CollectionPage" : "WebPage";
  const webPage = schema.find(item => item["@type"] === pageType);
  assert(webPage, `${path}: missing ${pageType} schema`);
  assert.equal(webPage.url, canonical + path);
  assert.equal(webPage.description, description);
  assert(schema.some(item => item["@type"] === "WebSite" && item.url === `${canonical}/`));
  const organization = schema.find(item => item["@type"] === "Organization");
  assert.equal(organization?.name, "Inside914");
  assert.equal(organization.legalName, "Inside Diagnostics LLC");
  assert.equal(organization.email, "Info@inside914.com");
  assert.equal(organization.telephone, "+19148795022");
  assert.equal(organization.logo.url, `${canonical}/brand-logo`);
  assert.deepEqual(organization.address, { "@type": "PostalAddress", streetAddress: "N State RD", addressLocality: "Briarcliff Manor", addressRegion: "NY", postalCode: "10510", addressCountry: "US" });
  if (["/about", "/contact"].includes(path)) {
    const visibleContent = doc.querySelector("main").cloneNode(true);
    visibleContent.querySelectorAll("script").forEach(node => node.remove());
    assert(!visibleContent.textContent.includes("N State RD"), `${path}: address should appear only in structured data`);
  }
  const ids = schema.map(item => item["@id"]);
  assert.equal(new Set(ids).size, ids.length, `${path}: duplicate schema IDs`);
  const checkReferences = value => {
    if (!value || typeof value !== "object") return;
    if (Object.keys(value).length === 1 && value["@id"]) assert(ids.includes(value["@id"]), `${path}: unresolved schema reference ${value["@id"]}`);
    for (const child of Object.values(value)) checkReferences(child);
  };
  schema.forEach(checkReferences);
  if (path !== "/") {
    const crumb = schema.find(item => item["@type"] === "BreadcrumbList");
    assert(crumb && doc.querySelector('nav[aria-label="Breadcrumb"]'), `${path}: breadcrumb missing`);
    assert.deepEqual(crumb.itemListElement.map(item => item.position), regions.includes(path) ? [1, 2, 3] : [1, 2]);
    assert.equal(crumb.itemListElement.at(-1).item, canonical + path);
    assert.equal(webPage.breadcrumb["@id"], crumb["@id"]);
  }
  if (path === "/pricing") {
    const service = schema.find(item => item["@type"] === "Service");
    assert.equal(service.offers.price, 399);
    assert.equal(service.offers.priceCurrency, "USD");
    assert(doc.querySelector("main").textContent.includes(`$${service.offers.price}`));
    assert.equal(webPage.mainEntity["@id"], service["@id"]);
  }
  if (path === "/faq") {
    assert.equal(webPage.mainEntity.length, doc.querySelectorAll('section[id^="question-"]').length);
    for (const question of webPage.mainEntity) {
      assert.equal(question["@type"], "Question");
      assert.equal(question.acceptedAnswer["@type"], "Answer");
      assert(doc.querySelector("main").textContent.includes(question.name));
      assert(doc.querySelector("main").textContent.includes(question.acceptedAnswer.text));
    }
  }
  for (const nav of doc.querySelectorAll('header nav[aria-label="Main"]')) {
    const hrefs = [...nav.querySelectorAll("a[href]")].map(link => link.getAttribute("href"));
    for (const required of ["/how-it-works", "/areas", "/pricing", "/our-postcard", "/faq", "/contact"]) assert(hrefs.includes(required), `${path}: menu missing ${required}`);
    assert(hrefs.every(href => paths.includes(href)), `${path}: menu link is not a dedicated indexable page`);
  }
  // Check actual server HTML hyperlinks and assets, including off-page fragments and policies.
  const refs = [...doc.querySelectorAll("a[href], img[src]")].map(el => el.getAttribute("href") ?? el.getAttribute("src"));
  refs.push(meta('meta[property="og:image"]'), meta('meta[name="twitter:image"]'));
  for (const ref of refs) {
    if (/^(mailto:|tel:|data:)/.test(ref)) continue;
    const target = new URL(ref, new URL(path, base));
    if (![base.origin, canonical].includes(target.origin)) { external.add(target.href); continue; }
    const targetPath = target.pathname + target.search;
    assert(!/[?&](token|access|invite|secret)=/i.test(targetPath), "Public page exposed a private access link");
    const linked = await get(targetPath);
    assert.equal(linked.status, 200, `${path} links to broken ${targetPath}`);
    if (target.hash) assert(linked.doc?.getElementById(decodeURIComponent(target.hash.slice(1))), `Missing fragment: ${ref}`);
    links++;
  }
  pages.push({ path, title, description, titleLength: title.length, descriptionLength: description.length, schema: schema.map(item => item["@type"]) });
}
const sitemap = await get("/sitemap.xml");
assert.equal(sitemap.status, 200); assert.match(sitemap.contentType, /xml/);
const xml = new JSDOM(sitemap.bytes.toString(), { contentType: "text/xml" }).window.document;
assert.equal(xml.querySelector("parsererror"), null);
assert.deepEqual([...xml.querySelectorAll("loc")].map(node => node.textContent), preview ? [] : paths.map(path => canonical + path));
assert.equal(xml.querySelectorAll("lastmod").length, preview ? 0 : paths.length);
for (const entry of xml.querySelectorAll("url")) {
  const date = entry.querySelector("lastmod")?.textContent;
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(date).toISOString().slice(0, 10), date);
  assert(new Date(date).getTime() <= Date.now(), "Sitemap lastmod is in the future");
}
const robots = await get("/robots.txt");
assert.equal(robots.status, 200); assert.match(robots.contentType, /text\/plain/);
assert.match(robots.bytes.toString(), preview ? /^Disallow: \/$/m : /^Allow: \/$/m);
if (!preview) assert(robots.bytes.toString().includes(`Sitemap: ${canonical}/sitemap.xml`));
if (!preview) assert.match(robots.bytes.toString(), /^Content-Signal: search=yes, ai-train=no$/m);

// Alternate representations must work in both cache orders without leaking into HTML.
const home = await get("/");
assert(home.doc.querySelector('a[href="/about"]'), "Homepage must link About");
assert.equal(home.doc.querySelector('link[rel="alternate"][type="text/markdown"]')?.getAttribute("href"), `${canonical}/index.md`);
const markdown = await get("/index.md");
assert.equal(markdown.status, 200); assert.match(markdown.contentType, /^text\/markdown/);
assert.match(markdown.bytes.toString(), /^# Inside914/);
const llms = await get("/llms.txt");
assert.equal(llms.status, 200); assert.match(llms.contentType, /^text\/(plain|markdown)/);
assert.match(llms.bytes.toString(), /^# Inside914\n/);
for (const match of llms.bytes.toString().matchAll(/\]\((https:\/\/inside914\.com[^)]+)\)/g)) {
  assert.equal((await get(new URL(match[1]).pathname)).status, 200, `Broken llms.txt link: ${match[1]}`);
}
for (const accept of ["text/html", "text/markdown", "text/html", "text/markdown, text/html, */*", "text/markdown;q=0", "text/markdown;q=0.2, text/html;q=0.8", "*/*"]) {
  const response = await fetch(base, { headers: { accept }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  const body = await response.text();
  if (["text/markdown", "text/markdown, text/html, */*"].includes(accept)) {
    assert.match(response.headers.get("content-type"), /^text\/markdown/);
    assert.equal(body, markdown.bytes.toString());
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.match(response.headers.get("vary"), /\bAccept\b/i);
  } else {
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert(body.includes("<h1"), "HTML variant lost its heading");
  }
}
for (const path of ["/admin/login", "/book/cart", "/reservation/access", "/reservation/recover", "/pay"]) {
  const response = await fetch(new URL(path, base), { redirect: "manual" });
  assert(response.status < 500, path);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/, path);
}
const image = await get("/opengraph-image");
assert.equal(image.contentType, "image/png");
const pixels = await sharp(image.bytes).metadata();
assert.equal(pixels.width, 1200); assert.equal(pixels.height, 630);
const logo = await get("/brand-logo");
assert.equal(logo.status, 200); assert.match(logo.contentType, /^image\/png/);
assert(!/noindex/.test(logo.headers.get("x-robots-tag") ?? "") || preview);
const logoPixels = await sharp(logo.bytes).metadata();
assert.equal(logoPixels.width, 600); assert.equal(logoPixels.height, 240);
for (const path of ["/areas/", "/editions/00000000-0000-4000-8000-000000000999"]) {
  const result = await get(path);
  assert.equal(result.status, 200); assert.equal(result.url.pathname, "/areas"); assert.equal(result.chain.length, 2);
}
assert.equal((await get("/AREAS")).status, 404);
assert.equal((await get("/areas/not-a-region")).status, 404);
assert.equal((await get("/areas?utm_source=seo-audit")).doc.querySelector('link[rel="canonical"]').href, `${canonical}/areas`);
console.log(JSON.stringify({ passed: true, mode: production ? "live production" : preview ? "preview" : "local production build", pages, checkedLinksAndAssets: links, externalReferencesForManualReview: [...external], ogImageBytes: image.bytes.length, redirects: "single hop; invalid casing/region 404; query canonical clean" }, null, 2));
