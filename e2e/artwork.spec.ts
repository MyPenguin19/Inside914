import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

// REAL end-to-end: real holds, real uploads to Supabase Storage, real server validation.
// Needs SUPABASE_SECRET_KEY in .env.local; each test releases its hold (and artwork) at the end.

const EDITION_URL = "/editions/00000000-0000-4000-8000-000000000101";
const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();

async function holdAndOpenArtwork(page: Page, size: "standard" | "double") {
  await page.goto(EDITION_URL);
  if (size === "double") await page.getByRole("radio", { name: /double/i }).check();
  await page.getByRole("button", { name: /^Front position F\d+: Available/ }).first().click();
  await page.getByRole("button", { name: /hold this position/i }).click();
  await expect(page.getByRole("heading", { name: "Your position is on hold" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Continue to artwork upload" }).click();
  await expect(page.getByRole("heading", { name: "Add your artwork" })).toBeVisible();
}

// Our messages live in <main>; Next's route announcer (also role=alert) does not.
const errorAlert = (page: Page) => page.locator("main").getByRole("alert");
const sidePanel = (page: Page) => page.getByRole("complementary", { name: "Preview" });

async function upload(page: Page, name: string, buffer: Buffer, mimeType = "image/png") {
  await page.getByLabel("Ad image file").setInputFiles({ name, mimeType, buffer });
}

// Wait for the hold page to finish streaming before deciding whether there's a hold to release.
async function release(page: Page) {
  await page.goto("/book/hold");
  const change = page.getByRole("button", { name: "Change selection" });
  const noHold = page.getByRole("heading", { name: /don't have a position on hold|hold has expired/ });
  await expect(change.or(noHold)).toBeVisible({ timeout: 15_000 });
  if (await change.isVisible()) {
    await change.click();
    await expect(page).toHaveURL(/\/editions\//);
  }
}

test.afterEach(async ({ page }) => release(page));

test("standard ad: upload, adjust with keyboard, preview, review, make changes", async ({ page }) => {
  await holdAndOpenArtwork(page, "standard");
  await expect(page.getByText(/JPG or PNG, up to 20 MB/)).toBeVisible();

  await upload(page, "ad.png", await png(1400, 1300));
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Image quality looks good for print.")).toBeVisible();

  // The preview shows the ad inside its position on the full postcard.
  const preview = page.getByRole("img", { name: /Preview of the front of the postcard/ });
  await expect(preview.getByAltText("Your ad as it will sit on the postcard")).toBeVisible();

  // Keyboard: zoom with the slider's arrow keys, nudge the image with the cropper's arrow keys.
  const slider = page.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).not.toHaveValue("1");
  await page.getByLabel(/Your ad\. Drag to move it/).focus();
  await page.keyboard.press("ArrowLeft");

  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByRole("heading", { name: "Review your ad" })).toBeVisible();
  const details = page.locator("dl").filter({ hasText: "Charged today" });
  await expect(details).toContainText("$500");
  await expect(details).toContainText("Standard");
  await expect(page.getByText("This is a provisional preview, not a print proof.")).toBeVisible();

  await page.getByRole("link", { name: "Make changes" }).click();
  await expect(page.getByRole("button", { name: "Replace image" })).toBeVisible(); // saved artwork reloads

  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your business details" })).toBeVisible();
});

test("double ad: one image spans both units, at the double price", async ({ page }) => {
  await holdAndOpenArtwork(page, "double");
  await upload(page, "wide.png", await png(2600, 1300));
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });

  const box = await page.getByAltText("Your ad as it will sit on the postcard").locator("..").boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(6.5 / 3, 1); // the full double area, not one unit
  await expect(sidePanel(page).getByText("$900")).toBeVisible();
});

test("bad files are rejected with a clear message", async ({ page }) => {
  await holdAndOpenArtwork(page, "standard");

  await upload(page, "menu.pdf", Buffer.from("%PDF-1.7 fake"), "application/pdf");
  await expect(errorAlert(page)).toContainText("JPG or PNG");

  await upload(page, "photo.jpg", Buffer.from("this is text pretending to be a photo"), "image/jpeg");
  await expect(errorAlert(page)).toContainText("JPG or PNG");

  const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4000, 3)]);
  await upload(page, "broken.png", broken);
  await expect(errorAlert(page)).toContainText("couldn't open that image");
});

test("an interrupted upload says nothing was saved, and a retry works", async ({ page }) => {
  await holdAndOpenArtwork(page, "standard");
  await page.route("**/storage/v1/object/upload/sign/**", (route) => route.abort("connectionreset"));
  await upload(page, "ad.png", await png(1200, 1200));
  await expect(errorAlert(page)).toContainText("interrupted, so nothing was saved");

  await page.unroute("**/storage/v1/object/upload/sign/**");
  await upload(page, "ad.png", await png(1200, 1200));
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });
});

test("mobile: upload and editor fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await holdAndOpenArtwork(page, "standard");
  await upload(page, "ad.png", await png(1200, 1200));
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("slider")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
