import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PUBLIC_MARKETING_PATHS } from "../src/lib/seo";
import { POLICY_LINKS } from "../src/lib/legal/public-policies";

const routes = [...PUBLIC_MARKETING_PATHS, ...POLICY_LINKS.map(policy => `/legal/${policy.slug}`)];
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const width of [390, 1440]) {
  for (const route of routes) {
    test(`automated ${route} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "/areas") await expect(page.getByText("Choose an area to get started", { exact: false })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      await testInfo.attach("accessibility", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
      expect(results.violations.map(v => ({ rule: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      await page.screenshot({ path: `test-results/a11y-${route.replaceAll("/", "-")}-${width}.png`, fullPage: !route.startsWith("/legal/") });
    });
  }
}

test("mobile menu opens with keyboard, dismisses with Escape and identifies the current page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/pricing");
  await expect(page.locator('header a[href="/pricing"][aria-current="page"]').first()).toHaveCount(1);
  const menu = page.locator("header summary");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(menu).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("header").getByRole("link", { name: "How It Works", exact: true }).filter({ visible: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.locator("header details")).not.toHaveAttribute("open");
  await page.keyboard.press("Enter");
  await page.locator("header").getByRole("link", { name: "Pricing", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await menu.click();
  await expect(page.locator("header").getByRole("link", { name: "Pricing", exact: true }).filter({ visible: true })).toHaveAttribute("aria-current", "page");
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test("expanded FAQ, flipped postcard and form errors are accessible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Interactive sample card", { exact: true })).toHaveCount(0);
  for (const summary of await page.locator("#faq summary").all()) await summary.click();
  await page.getByRole("button", { name: "Flip postcard" }).click();
  await expect(page.getByRole("img", { name: /Back of the sample postcard/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  const feedback = page.locator('main [tabindex="-1"]').filter({ has: page.getByRole("alert") });
  await expect(feedback).toBeFocused();
  await page.getByRole("alert").getByRole("link", { name: "Enter your name." }).click();
  await expect(page.getByLabel("Your name")).toBeFocused();
  await expect(page.getByLabel("Your name")).toHaveAttribute("aria-describedby", "name-error");
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await testInfo.attach("contact-accessibility-tree", { body: await page.getByRole("main").ariaSnapshot(), contentType: "text/plain" });
});

test("public and policy content reflows with WCAG text spacing at 320px", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (route === "/areas") await expect(page.getByText("Choose an area to get started", { exact: false })).toBeVisible();
    await page.addStyleTag({ content: "main p, main li, main a, main h1, main h2, main h3, main label, main button, footer p, footer a { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } main p { margin-bottom: 2em !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(320);
  }
});

test("policy contents and links work with keyboard and remain readable at 200% text", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  for (const policy of POLICY_LINKS) {
    await page.goto(`/legal/${policy.slug}`);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const contents = page.locator("article summary");
    // Focus after Next's initial navigation focus restoration has settled.
    await expect(async () => {
      await contents.focus();
      await expect(contents).toBeFocused({ timeout: 500 });
    }).toPass();
    await expect(contents).toBeFocused();
    await page.keyboard.press("Enter");
    const first = page.getByRole("navigation", { name: "Policy sections" }).getByRole("link").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#policy-section-1$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), policy.slug).toBeLessThanOrEqual(390);
    await expect(page.locator("#policy-section-1 h2")).toBeInViewport();
  }
});
