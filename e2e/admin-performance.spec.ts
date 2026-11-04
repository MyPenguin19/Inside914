import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createOriginalFixture } from "../tests/fixtures/originals";

// Measure sidebar clicks through populated content, not the static heading.
async function ready(page: Page, section: string) {
  if (section === "Home") {
    await expect(page.getByRole("region", { name: "Action needed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your current campaigns" })).toBeVisible();
  } else {
    const caption = { Campaigns: "Campaigns", Advertisers: "Advertisers", "Review artwork": "Artwork submissions", Payments: "Payment authorizations" }[section];
    await expect(page.getByRole("table", { name: caption, exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: caption, exact: true }).getByRole("row")).not.toHaveCount(1);
    if (section === "Payments") await expect(page.getByRole("region", { name: "Totals" })).toBeVisible();
  }
  await expect(page.locator('main [aria-busy="true"]:visible')).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /couldn.t load|could not load/i })).toHaveCount(0);
}

test("admin sidebar timing includes loaded rows and totals", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createOriginalFixture();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const id of fixture.bookings.slice(0, 2)) {
      expect((await fixture.db.from("bookings").update({ status: "reserved", confirmed_at: new Date().toISOString(), reference: `IN914-${id.replaceAll("-", "").slice(0, 6).toUpperCase().replaceAll("0", "G").replaceAll("1", "H")}`, stripe_payment_method_id: `pm_devtest_audit_${id}`, stripe_setup_intent_id: `seti_devtest_audit_${id}` }).eq("id", id)).error).toBeNull();
    }
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await ready(page, "Home");
    const measurements = new Map<string, number[]>();
    const nav = page.getByRole("navigation", { name: "Admin", exact: true });
    for (let run = 0; run < 4; run++) {
      for (const section of ["Campaigns", "Advertisers", "Review artwork", "Payments", "Home"]) {
        const started = performance.now();
        await nav.getByRole("link", { name: section, exact: true }).click();
        const path = { Home: "/admin", Campaigns: "/admin/campaigns", Advertisers: "/admin/advertisers", "Review artwork": "/admin/artwork", Payments: "/admin/payments" }[section];
        const caption = { Campaigns: "Campaigns", Advertisers: "Advertisers", "Review artwork": "Artwork submissions", Payments: "Payment authorizations" }[section];
        // Poll on animation frames: expect()'s increasing 100/250/500ms polling
        // buckets can conceal improvements of one or two network round trips.
        await page.waitForFunction(({ path, caption, section }) => {
          const visible = (node: Element) => node.checkVisibility();
          if (location.pathname !== path || [...document.querySelectorAll('main [aria-busy="true"]')].some(visible)) return false;
          if (section === "Home") return [...document.querySelectorAll('[aria-label="Action needed"]')].some(visible)
            && [...document.querySelectorAll("h2")].some(n => n.textContent === "Your current campaigns" && visible(n));
          const table = [...document.querySelectorAll("table")].find(n => n.caption?.textContent === caption && visible(n));
          return !!table && table.rows.length > 1 && (section !== "Payments" || [...document.querySelectorAll('[aria-label="Totals"]')].some(visible));
        }, { path, caption, section }, { polling: "raf" });
        measurements.set(section, [...(measurements.get(section) ?? []), Math.round(performance.now() - started)]);
        await ready(page, section);
      }
    }
    expect(errors).toEqual([]);
    const report = JSON.stringify({
      build: process.env.INSIDE914_E2E_PRODUCTION === "true" ? "production" : "development",
      scope: "Local database, synthetic reservations; sidebar click to populated rows/totals and completed loading states. Not live-site latency.",
      upstreamDelayMs: Number(process.env.INSIDE914_AUDIT_UPSTREAM_DELAY_MS ?? 0),
      measurements: [...measurements].map(([name, samples]) => ({ name, firstMs: samples[0], medianMs: samples.slice(1).toSorted((a, b) => a - b)[1], samplesMs: samples.slice(1) })),
    }, null, 2);
    await testInfo.attach("admin-data-performance.json", { body: report, contentType: "application/json" });
    const output = "../../outputs/inside914-admin-audit";
    await mkdir(output, { recursive: true });
    const label = process.env.INSIDE914_AUDIT_LABEL === "before" ? "before" : "after";
    await writeFile(`${output}/data-${label}-${process.env.INSIDE914_AUDIT_UPSTREAM_DELAY_MS ?? "0"}.json`, report);
    console.log(report);
  } finally {
    await fixture.cleanup();
  }
});
