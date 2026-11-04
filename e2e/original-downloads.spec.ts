import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createOriginalFixture } from "../tests/fixtures/originals";
let fixture: Awaited<ReturnType<typeof createOriginalFixture>>;
test.beforeAll(async () => { fixture = await createOriginalFixture(); });
test.afterAll(async () => { await fixture?.cleanup(); });
const login = async (page: Page) => {
  await page.goto("/admin/login", { waitUntil: "networkidle" }); await page.getByLabel("Email").fill(fixture.email); await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
};
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("anonymous and customer capability requests cannot use individual or campaign downloads", async ({ page }) => {
  for (const path of [`/admin/artwork/${fixture.bookings[0]}/original`, `/admin/campaigns/${fixture.campaign}/originals`]) {
    const response = await page.request.get(path, { maxRedirects: 0, headers: { cookie: "inside914_hold=customer-capability-does-not-authorize-admin" } });
    expect([303,307]).toContain(response.status()); expect(response.headers().location).toContain("/admin/login");
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("admin downloads exact originals from both pages, with no approval/crop changes and no mobile overflow", async ({ page }) => {
  test.setTimeout(90000); await login(page);
  const before = await fixture.snapshot();
  for (const [index, section] of ["artwork", "advertisers"].entries()) {
    const source = index ? fixture.jpeg : fixture.png;
    await page.goto(`/admin/${section}/${fixture.bookings[index]}`);
    const button = page.getByRole("button", { name: "Download Original", exact: true });
    await expect(button).toBeEnabled();
    for (const width of [320,375,1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); }
    const download = page.waitForEvent("download"); await button.click();
    const file = await download; expect(file.suggestedFilename()).toMatch(index ? /\.jpg$/ : /\.png$/);
    expect(hash(await readFile((await file.path())!))).toBe(hash(source));
    await expect(page.getByRole("status")).toContainText(`SHA-256 ${hash(source)}`);
    await page.screenshot({ path: `test-results/original-downloads/${section}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width:375, height:1000 }); await page.screenshot({ path: `test-results/original-downloads/${section}-mobile.png`, fullPage: true });
  }
  expect(await fixture.snapshot()).toEqual(before);
});

test("campaign ZIP verifies sources and manifest, labels missing and historical files, rejects ID tampering", async ({ page }) => {
  test.setTimeout(90000); await login(page); const before = await fixture.snapshot();
  const planResponse = await page.request.get(`/admin/campaigns/${fixture.campaign}/originals`);
  expect(planResponse.ok()).toBe(true); expect(planResponse.headers()["cache-control"]).toContain("no-store"); expect(planResponse.headers()["referrer-policy"]).toBe("no-referrer");
  const plan = await planResponse.json();
  const first = plan.sources.find((s: { bookingId: string }) => s.bookingId === fixture.bookings[0]);
  expect((await page.request.get(`/admin/artwork/${fixture.bookings[1]}/original?version=${first.version}`)).status()).toBe(404);
  expect((await page.request.get(`/admin/artwork/${fixture.bookings[0]}/original?path=../../other.png`)).status()).toBe(400);
  await page.goto(`/admin/campaigns/${fixture.campaign}?view=artwork`);
  const button = page.getByRole("button", { name: "Download All Original Artwork" });
  await expect(button).toBeEnabled(); await expect(page.getByText("3 advertisers · 2 current originals available · 1 unavailable")).toBeVisible();
  for (const width of [320,375,1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); }
  for (const history of [false, true]) {
    if (history) { await page.getByLabel("Include retained historical originals").check(); await expect(button).toBeEnabled(); }
    const download = page.waitForEvent("download"); await button.click(); const file = await download;
    expect(file.suggestedFilename()).toContain("INCOMPLETE");
    const path = (await file.path())!;
    const result = JSON.parse(execFileSync("python3", ["-c", "import zipfile,sys,json,hashlib,csv,io; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'bad':z.testzip(),'files':{n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.endswith(('.png','.jpg'))},'rows':list(csv.DictReader(io.StringIO(z.read('manifest.csv').decode())))}))", path], { encoding:"utf8" }));
    expect(result.bad).toBeNull(); expect(Object.values(result.files).sort()).toEqual([hash(fixture.png),hash(fixture.jpeg),...(history?[hash(fixture.historical)]:[])].sort());
    expect(result.rows).toHaveLength(history ? 4 : 3);
    for (const row of result.rows) if (row.file_name) expect(result.files[row.file_name]).toBe(row.sha256); else expect(row.result).toMatch(/unavailable/);
    expect(result.rows.filter((r: { source_version: string }) => r.source_version === "historical")).toHaveLength(history ? 1 : 0);
    await expect(page.getByRole("status")).toContainText("Incomplete archive");
    await expect(button).toBeEnabled();
  }
  await page.setViewportSize({width:375,height:1000}); await button.scrollIntoViewIfNeeded(); await page.screenshot({path:"test-results/original-downloads/campaign-mobile.png"});
  expect(await fixture.snapshot()).toEqual(before);
});
