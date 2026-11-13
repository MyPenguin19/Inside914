import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MARKETING_NAV } from "../src/lib/marketing-content";
import { PUBLIC_MARKETING_PATHS, PUBLIC_INDEXABLE_PATHS, SITE_URL } from "../src/lib/seo";

test("server HTML, schema, sitemap and public links pass the crawler audit", async ({ baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/audit-public-seo.mjs", baseURL!], { timeout: 80_000 });
  const audit = JSON.parse(stdout);
  expect(audit.passed).toBe(true);
  expect(audit.pages).toHaveLength(PUBLIC_INDEXABLE_PATHS.length);
  await testInfo.attach("seo-crawl.json", { body: stdout, contentType: "application/json" });
});

test("legacy hosting alias redirects public pages and preserves campaign tracking parameters", async ({ request }) => {
  for (const path of PUBLIC_INDEXABLE_PATHS) {
    const response = await request.get(`${path}?utm_source=seo-audit`, { headers: { host: "inside914.vercel.app" }, maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location).href).toBe(`${SITE_URL}${path}?utm_source=seo-audit`);
  }
});

test("agent requests preserve HEAD, browser navigation and private-route authentication", async ({ page, request }) => {
  const head = await request.head("/", { headers: { accept: "text/markdown" } });
  expect(head.status()).toBe(200);
  expect(head.headers()["content-type"]).toContain("text/markdown");
  expect(await head.body()).toHaveLength(0);
  const admin = await request.get("/admin/campaigns", { headers: { accept: "text/markdown" }, maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toContain("/admin/login");
  await page.goto("/");
  await page.getByRole("link", { name: "About Inside914", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("main address")).toHaveText("N State RD, Briarcliff Manor, NY 10510");
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Westchester Mailboxes.");
});

for (const path of PUBLIC_MARKETING_PATHS) {
  test(`marketing metadata and responsive semantics: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('head meta[name="google-site-verification"]')).toHaveAttribute("content", "rMoAZMl3ESy4TOux7nGxSLj2NspSwIkUWYGhamKBcWE");
    // Local/preview visits must not pollute the live Analytics property.
    await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", path === "/" ? SITE_URL : `${SITE_URL}${path}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", path === "/" ? SITE_URL : `${SITE_URL}${path}`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page).toHaveTitle(/\| Inside914$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).not.toContainText("Reservations are not open yet.");
    if (path === "/areas") await expect(page.getByText("Choose an area to get started", { exact: false })).toBeVisible();
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}`).toBeLessThanOrEqual(width);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Regional advertising" })).toBeVisible();
      if (path === "/") {
        const diagram = await page.locator('#pricing [aria-hidden="true"][style*="aspect-ratio"]').boundingBox();
        expect(diagram!.width / diagram!.height).toBeCloseTo(1.5, 1);
      }
      if (width === 375 || width === 1440) await page.screenshot({ path: `test-results/seo-${path.replaceAll("/", "-") || "home"}-${width}.png`, fullPage: true });
    }
    const levels = await page.locator("main h1, main h2, main h3, main h4, main h5, main h6").evaluateAll(nodes => nodes.map(node => Number(node.tagName.slice(1))));
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
  });
}

test("mobile navigation, map keyboard control and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const menu = page.locator("header summary");
  await menu.focus();
  await expect(menu).toBeFocused();
  expect(await menu.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  const link = page.locator("header").getByRole("link", { name: "Advertising Areas", exact: true }).last();
  await expect(link).toBeVisible();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.focus();
  await page.keyboard.press("Enter");
  const map = page.getByRole("group", { name: "Choose areas on the Westchester map" });
  await expect(map).toBeVisible();
  for (const button of await map.getByRole("button").all()) {
    await button.focus();
    await expect(button).toBeFocused();
    expect(await button.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe("none");
    expect(await button.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThan(0);
    const before = await button.getAttribute("aria-pressed");
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", await button.getAttribute("aria-disabled") === "true" ? before! : before === "true" ? "false" : "true");
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-pressed", before!);
  }
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("private pages remain noindex and admin content requires authentication", async ({ request }) => {
  for (const path of ["/admin/login", "/book/cart", "/reservation/access", "/reservation/recover", "/pay"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
    expect(response.status(), path).toBeLessThan(500);
  }
  const response = await request.get("/admin/campaigns", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/admin/login");
  for (const path of ["terms", "privacy", "reservation-policy", "payment-authorization", "cancellation-policy"]) {
    const legal = await request.get(`/legal/${path}`);
    const html = await legal.text();
    expect(html).toMatch(/name="robots" content="index, follow/);
    expect(legal.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
    if (path === "privacy") expect(html).toContain("Website analytics notice");
  }
});

test("marketing pages remain usable with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  for (const path of PUBLIC_MARKETING_PATHS) {
    await page.goto(path);
    if (path === "/areas") await expect(page.getByText("Choose an area to get started", { exact: false })).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.locator("header summary").click();
    const overflow = await page.evaluate(() => [...document.querySelectorAll("main *, header *, footer *")].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
    }).slice(0, 12).map(node => ({ tag: node.tagName, text: node.textContent?.slice(0, 60), class: node.className, right: node.getBoundingClientRect().right })));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} with 200% text: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(390);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});


test("each desktop and mobile menu link opens its own SEO page", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const item of MARKETING_NAV) {
      await page.goto("/");
      if (width < 1024) await page.locator("header summary").click();
      await page.locator("header").getByRole("link", { name: item.label, exact: true }).filter({ visible: true }).click();
      await expect(page).toHaveURL(new RegExp(`${item.href}$`));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", SITE_URL + item.href);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  }
});

test("dedicated sample and FAQ content work without changing booking state", async ({ page }) => {
  await page.goto("/our-postcard");
  await page.getByRole("button", { name: "Flip postcard" }).click();
  await expect(page.getByRole("img", { name: /Back of the sample postcard/ })).toBeVisible();
  await page.getByRole("button", { name: "View front" }).click();
  await expect(page.getByRole("img", { name: /Front of the sample postcard/ })).toBeVisible();
  await page.goto("/faq");
  const questions = await page.locator('script[type="application/ld+json"]').evaluate(node => JSON.parse(node.textContent!).find((item: { "@type": string }) => item["@type"] === "FAQPage").mainEntity);
  for (const question of questions) {
    await expect(page.getByRole("heading", { name: question.name, exact: true })).toBeVisible();
    await expect(page.getByText(question.acceptedAnswer.text, { exact: true })).toBeVisible();
  }
});
