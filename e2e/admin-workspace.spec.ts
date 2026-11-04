import { expect, test, type Page } from "@playwright/test";
import { createOriginalFixture } from "../tests/fixtures/originals";

let fixture: Awaited<ReturnType<typeof createOriginalFixture>>;
test.beforeAll(async () => {
  fixture = await createOriginalFixture();
  // Local fake setup IDs only: make these checkout holds visible in payment records.
  for (const id of fixture.bookings) {
    const result = await fixture.db.from("bookings").update({ stripe_setup_intent_id: `seti_devtest_workspace_${id}` }).eq("id", id);
    expect(result.error).toBeNull();
  }
});
test.afterAll(async () => {
  if (!fixture) return;
  const evidence = await fixture.db.from("mailing_evidence").select("storage_path").eq("edition_id", fixture.campaign);
  const paths = (evidence.data ?? []).flatMap(e => e.storage_path ? [e.storage_path] : []);
  if (paths.length) expect((await fixture.db.storage.from("mailing-evidence").remove(paths)).error).toBeNull();
  expect((await fixture.db.from("mailing_evidence").delete().eq("edition_id", fixture.campaign)).error).toBeNull();
  await fixture.cleanup();
});
async function login(page: Page) {
  await page.goto("/admin/login", {waitUntil:"networkidle"});
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("owner can find every campaign tool, return Home, and keep the workspace on refresh", async ({page}) => {
  test.setTimeout(120_000);
  await login(page);
  await expect(page.getByRole("heading", {name:"Needs your attention"})).toBeVisible();
  await page.screenshot({path:"../../outputs/inside914-admin-workspace/home.png",fullPage:true});
  const before = await fixture.snapshot();
  await page.goto(`/admin/campaigns/${fixture.campaign}`);
  const nav = page.getByRole("navigation", {name:"Campaign workspace"});
  for (const [label, content] of [["Overview", "Your next step"], ["Advertisers & spaces", "Invite a business"], ["Artwork", "Review your postcard artwork"], ["Print & mail", "Printer proof & records"], ["Campaign settings", "Campaign dates and details"]]) {
    await nav.getByRole("link", {name:label,exact:true}).click();
    await expect(nav.getByRole("link", {name:label,exact:true})).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(content, {exact:true})).toBeVisible();
    for (const width of [320,375,1440]) {
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${label} at ${width}`).toBeLessThanOrEqual(width);
    }
    if (label === "Advertisers & spaces") {
      await page.getByText("Manage individual spaces", {exact:true}).click();
      await expect(page.getByRole("heading", {name:"Spaces",exact:true})).toBeVisible();
    }
    if (label === "Print & mail") await expect(page.getByRole("button", {name:"Charge Advertisers & Prepare Mailing",exact:true})).toBeDisabled();
    if (label === "Overview" || label === "Print & mail") await page.screenshot({path:`../../outputs/inside914-admin-workspace/${label === "Overview" ? "overview" : "mailing"}.png`,fullPage:true});
  }
  await page.reload();
  await expect(nav.getByRole("link", {name:"Campaign settings",exact:true})).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(nav.getByRole("link", {name:"Print & mail",exact:true})).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({width:375,height:900});
  await nav.getByRole("link", {name:"Overview",exact:true}).click();
  await expect(nav.getByRole("link", {name:"Overview",exact:true})).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Your next step",{exact:true})).toBeVisible();
  await page.screenshot({path:"../../outputs/inside914-admin-workspace/mobile.png",fullPage:true});
  await page.getByRole("button", {name:"Menu",exact:true}).click();
  await page.getByRole("navigation", {name:"Admin",exact:true}).getByRole("link", {name:"Home",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Manage Inside914"})).toBeVisible();
  expect(await fixture.snapshot()).toEqual(before);
});

test("campaign, status and search stay together across advertiser, artwork and payment lists", async ({page}) => {
  test.setTimeout(90_000);
  await login(page);
  for (const section of ["advertisers", "artwork", "payments"]) {
    await page.goto(`/admin/${section}?campaign=${fixture.campaign}`);
    await page.getByRole("navigation", {name:"Filter",exact:true}).getByRole("link", {name:"All",exact:true}).click();
    await expect(page.getByLabel("Campaign", {exact:true})).toHaveValue(fixture.campaign);
    await expect(page.getByRole("link", {name:"Fixture / Same Name",exact:true}).filter({visible:true})).toHaveCount(3);
    await page.getByLabel("Search business, contact or email").fill("Same Name");
    await page.getByRole("button", {name:"Show results",exact:true}).click();
    const query = new URL(page.url()).searchParams;
    expect(query.get("filter")).toBe("all");
    expect(query.get("campaign")).toBe(fixture.campaign);
    expect(query.get("q")).toBe("Same Name");
    await expect(page.getByRole("link", {name:"Fixture / Same Name",exact:true}).filter({visible:true})).toHaveCount(3);
    await page.getByRole("link", {name:"Clear search",exact:true}).click();
    await expect(page.getByLabel("Campaign", {exact:true})).toHaveValue(fixture.campaign);
    await expect(page.getByLabel("Search business, contact or email")).toHaveValue("");
    expect(new URL(page.url()).searchParams.get("filter")).toBe("all");
    await page.getByLabel("Search business, contact or email").fill("Same Name");
    await page.getByLabel("Campaign", {exact:true}).selectOption("00000000-0000-4000-8000-000000000101");
    await page.getByRole("button", {name:"Show results",exact:true}).click();
    await expect(page.getByRole("link", {name:"Fixture / Same Name",exact:true})).toHaveCount(0);
    await expect(page.getByLabel("Search business, contact or email")).toHaveValue("Same Name");
  }
});


test("proof upload keeps optional details and stays private until explicitly approved", async ({page}) => {
  await login(page);
  await page.goto(`/admin/campaigns/${fixture.campaign}?view=mailing`);
  await expect(page.getByLabel("Type of document")).toHaveValue("final_proof");
  await page.getByLabel("Title", {exact:false}).fill("Workspace proof fixture");
  await page.getByLabel("File", {exact:false}).setInputFiles({name:"proof.jpg",mimeType:"image/jpeg",buffer:fixture.jpeg});
  await page.getByText("Add quantities, date or notes (optional)",{exact:true}).click();
  await page.getByLabel("Quantity printed", {exact:false}).fill("5000");
  await page.getByLabel("Notes", {exact:false}).fill("Local fixture only");
  await page.getByRole("button",{name:"Save document",exact:true}).click();
  await expect(page.getByText("Evidence saved (not published).",{exact:true})).toBeVisible();
  const result = await fixture.db.from("mailing_evidence").select("kind,title,quantity_printed,notes,published_at,storage_path").eq("edition_id",fixture.campaign).single();
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({kind:"final_proof",title:"Workspace proof fixture",quantity_printed:5000,notes:"Local fixture only",published_at:null});
  expect(result.data?.storage_path).toContain(fixture.campaign);
  await expect(page.getByRole("button",{name:"Approve final proof",exact:true})).toBeVisible();
  await page.getByText("Record printer updates",{exact:true}).click();
  await expect(page.getByLabel("Supporting evidence")).toBeVisible();
  expect(await page.getByLabel("Supporting evidence").locator("option").allTextContents()).toContain("Workspace proof fixture");
  await expect(page.getByRole("button",{name:"Charge Advertisers & Prepare Mailing",exact:true})).toBeDisabled();
});
