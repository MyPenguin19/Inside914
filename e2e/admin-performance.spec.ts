import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createOriginalFixture } from "../tests/fixtures/originals";

// Observational timings, not a flaky CI speed threshold. Run against `next start`
// after building to exclude development compilation from the owner's experience.
test("admin navigation has no runtime errors or overflow and records warm load timings", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createOriginalFixture();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const id of fixture.bookings.slice(0, 2)) {
      expect((await fixture.db.from("bookings").update({status:"reserved",confirmed_at:new Date().toISOString(),reference:`IN914-${id.replaceAll("-", "").slice(0,6).toUpperCase().replaceAll("0", "G").replaceAll("1", "H")}`,stripe_payment_method_id:`pm_devtest_audit_${id}`,stripe_setup_intent_id:`seti_devtest_audit_${id}`}).eq("id",id)).error).toBeNull();
    }
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const routes = [
      ["Home", "/admin"], ["Campaign list", "/admin/campaigns"],
      ...["overview", "advertisers", "artwork", "mailing", "settings"].map(view => [view, `/admin/campaigns/${fixture.campaign}?view=${view}`]),
      ["New campaign", "/admin/campaigns/new"], ["Advertisers", "/admin/advertisers"],
      ["Review queue", "/admin/artwork"], ["Payments", "/admin/payments"],
      ["Areas", "/admin/zones"], ["Settings", "/admin/settings"],
    ];
    const measurements = [];
    for (const [name, route] of routes) {
      const samples = [];
      for (let run = 0; run < 4; run++) {
        const started = performance.now();
        const response = await page.goto(route);
        expect(response?.status(), name).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("alert").filter({ hasText: /couldn.t load|could not load/i })).toHaveCount(0);
        if (run > 0) samples.push(Math.round(performance.now() - started));
      }
      const navigation = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return { htmlBytes: n.decodedBodySize, ttfbMs: Math.round(n.responseStart - n.requestStart) };
      });
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name} at ${width}`).toBeLessThanOrEqual(width);
      }
      if (process.env.INSIDE914_AUDIT_LABEL !== "before") await page.screenshot({path:`../../outputs/inside914-admin-audit/${name.toLowerCase().replaceAll(" ","-")}.png`,fullPage:true});
      measurements.push({ name, medianMs: samples.toSorted((a,b) => a-b)[1], samplesMs: samples, ...navigation });
    }
    expect(errors).toEqual([]);
    const report = JSON.stringify({ build: process.env.INSIDE914_E2E_PRODUCTION === "true" ? "production" : "development", scope: "Local database, synthetic campaign, warm full-page loads; not live-site latency.", measurements }, null, 2);
    await testInfo.attach("admin-performance.json", { body: report, contentType: "application/json" });
    const output = "../../outputs/inside914-admin-audit";
    await mkdir(output, { recursive: true });
    const label = process.env.INSIDE914_AUDIT_LABEL === "before" ? "before" : "after";
    await writeFile(`${output}/${label}.json`, report);
    console.log(report);
  } finally {
    await fixture.cleanup();
  }
});
