import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

// DESIGN PREVIEW (/demo): the whole customer journey with sample data. Also proves the preview
// never talks to Supabase, Stripe, Resend or any server action.

function watchForBackendCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/supabase\.co|stripe\.com|resend\.com/.test(url) || request.headers()["next-action"]) calls.push(`${request.method()} ${url}`);
  });
  return calls;
}

const side = (page: Page, name: "Front" | "Back") =>
  page.getByRole("group", { name: "Postcard side" }).getByRole("button", { name: new RegExp(`^${name}`) });
const position = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`^(Front|Back) position ${label}:`) });

test("the full customer journey works with sample data and no backend calls", async ({ page }) => {
  const backendCalls = watchForBackendCalls(page);
  await page.goto("/demo");
  await expect(page.getByRole("note").first()).toContainText("Design preview");

  await page.getByRole("link", { name: /1\. Advertising areas/ }).click();
  await expect(page.getByRole("heading", { name: "Choose your advertising area." })).toBeVisible();
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await expect(page.getByText(/provisional; final routes are set by Inside914/).first()).toBeVisible();
  await page.getByRole("link", { name: /See open spaces/ }).click();

  // Standard, then double (merged), then toggle sides.
  await position(page, "F1").click();
  await expect(page.getByTestId("total-price")).toHaveText("$500");
  await page.getByRole("radio", { name: /double/i }).check();
  await position(page, "F3").click();
  await expect(page.getByText("Double ad")).toBeVisible();
  await expect(page.getByTestId("total-price")).toHaveText("$900");
  // Wide screens show both sides at once, with no toggle.
  await expect(page.getByRole("group", { name: "Postcard side" })).toBeHidden();
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeVisible();
  await expect(position(page, "B5")).toBeDisabled(); // sample reserved space
  await page.getByRole("complementary").getByRole("button", { name: "Continue" }).click();

  // Editor: local upload, preview, continue.
  await expect(page.getByRole("heading", { name: "Add your artwork" })).toBeVisible();
  const png = await sharp({ create: { width: 2000, height: 950, channels: 3, background: { r: 196, g: 128, b: 58 } } }).png().toBuffer();
  await page.getByLabel("Ad image file").setInputFiles({ name: "ad.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText(/Image uploaded/)).toBeVisible();
  await expect(page.getByAltText("Your ad as it will sit on the postcard")).toBeVisible();
  await page.getByRole("button", { name: "Continue to review" }).click();

  // Review & reserve: one page with real validation rules and NO card inputs at all.
  await expect(page.getByRole("heading", { name: "Review and reserve" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reservation summary" })).toContainText("$900");
  const cardPlaceholder = page.getByRole("img", { name: "Card form placeholder (design preview)" });
  await expect(cardPlaceholder).toBeVisible();
  await expect(cardPlaceholder.locator("input, iframe")).toHaveCount(0);
  const reserve = page.getByRole("button", { name: /Reserve my space/ });
  await reserve.click();
  const problems = page.locator("main").getByRole("alert");
  await expect(problems).toContainText("Business name: Please enter your business name.");
  await expect(problems).toContainText("agree to the future payment");
  await expect(page.getByText("Please enter your business name.").last()).toBeVisible(); // inline, by the field too
  await page.getByLabel("Business name").fill("Preview Pizzeria");
  await page.getByLabel("Your name").fill("Pat Preview");
  await page.getByLabel("Email").fill("pat@example.com");
  await page.getByLabel("Phone").fill("914 555 0100");

  // Going back and returning keeps what was typed.
  await page.getByRole("link", { name: "← Back to artwork" }).click();
  await expect(page.getByRole("heading", { name: "Add your artwork" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByLabel("Business name")).toHaveValue("Preview Pizzeria");

  await expect(page.getByRole("checkbox").locator("..")).toContainText("charge $900");
  await page.getByRole("checkbox").check();
  await reserve.click();

  await expect(page.getByRole("heading", { name: "Your Advertising Space Is Reserved." })).toBeVisible();
  await expect(page.getByText("no real reservation was created")).toBeVisible();
  await expect(page.getByRole("region", { name: "Reservation summary" })).toContainText("F3 + F4");

  await page.getByRole("link", { name: "Preview your Verified Mail page" }).click();
  await expect(page.getByRole("list", { name: "Campaign progress (sample)" }).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByText(/Every stage, date and status on this page is a sample/)).toBeVisible();

  expect(backendCalls).toEqual([]);
});

test("owner dashboard renders with sample data and inert buttons", async ({ page }) => {
  const backendCalls = watchForBackendCalls(page);
  await page.goto("/demo/admin");
  await expect(page.getByRole("heading", { name: "Central Westchester", level: 1 })).toBeVisible();
  await expect(page.getByText(/Design preview with sample data/)).toBeVisible();
  await expect(page.getByRole("table", { name: /Advertisers in this edition \(sample\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(backendCalls).toEqual([]);
});

test("mobile: postcard selection and editor fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/postcard");
  await position(page, "F5").click();
  await expect(page.getByTestId("total-price")).toHaveText("$500");
  const box = await position(page, "F5").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  for (const path of ["/demo/postcard", "/demo/areas", "/demo/verified-mail", "/demo/admin"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("keyboard: switch sides and choose a space without a mouse (phone layout)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/postcard");
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeHidden();
  await side(page, "Back").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Back of the postcard" })).toBeVisible();
  await position(page, "B2").focus();
  await page.keyboard.press("Space");
  await expect(position(page, "B2")).toHaveAttribute("aria-pressed", "true");
});
