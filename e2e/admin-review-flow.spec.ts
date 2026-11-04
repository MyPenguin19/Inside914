import { expect, test } from "@playwright/test";
import { createOriginalFixture } from "../tests/fixtures/originals";

test("owner reviews successive ads without returning to the list or approving the next ad accidentally", async ({page}) => {
  test.setTimeout(90_000);
  const fixture = await createOriginalFixture();
  const [first, second] = fixture.bookings;
  try {
    for (const id of fixture.bookings.slice(0, 2)) {
      expect((await fixture.db.from("bookings").update({status:"reserved",confirmed_at:new Date().toISOString(),reference:`IN914-${id.replaceAll("-", "").slice(0,6).toUpperCase().replaceAll("0", "G").replaceAll("1", "H")}`,stripe_payment_method_id:`pm_devtest_audit_${id}`,stripe_setup_intent_id:`seti_devtest_audit_${id}`}).eq("id",id)).error).toBeNull();
    }
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/admin/artwork/${first}`);
    await expect(page.getByRole("link",{name:"Next ad awaiting review",exact:true})).toHaveAttribute("href",`/admin/artwork/${second}`);
    await page.getByRole("button",{name:"Approve content",exact:true}).click();
    await page.getByRole("button",{name:"Approve",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Content approved."})).toBeVisible();
    expect((await fixture.db.from("booking_artwork").select("review_status").eq("booking_id",first).single()).data?.review_status).toBe("approved");
    await page.getByRole("link",{name:"Next ad awaiting review",exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`/admin/artwork/${second}$`));
    expect((await fixture.db.from("booking_artwork").select("review_status").eq("booking_id",second).single()).data?.review_status).toBe("pending");
    await page.getByRole("button",{name:"Request changes",exact:true}).click();
    await page.getByLabel("What should the advertiser change?").fill("Please make the phone number larger.");
    await page.getByRole("button",{name:"Request changes",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Changes requested."})).toBeVisible();
    const saved = await fixture.db.from("booking_artwork").select("review_status,review_note").eq("booking_id",second).single();
    expect(saved.data).toEqual({review_status:"changes_requested",review_note:"Please make the phone number larger."});
    await expect(page.getByRole("link",{name:"Email Fixture",exact:true})).toHaveAttribute("href","mailto:fixture@example.com");
    await expect(page.getByRole("link",{name:"Next ad awaiting review",exact:true})).toHaveCount(0);
    await page.getByText("Review history",{exact:true}).filter({visible:true}).click();
    await expect(page.getByText("Please make the phone number larger.",{exact:true})).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:"../../outputs/inside914-admin-audit/review.png",fullPage:true});
    await page.getByRole("link",{name:"Back to this campaign’s review queue",exact:true}).click();
    await expect(page.getByText("No ads waiting for review.",{exact:true})).toBeVisible();
    await expect(page.getByLabel("Campaign",{exact:true})).toHaveValue(fixture.campaign);
    await page.goto(`/admin/payments?campaign=${fixture.campaign}`);
    const totals = page.getByRole("region",{name:"Totals",exact:true});
    await expect(totals.getByText("Authorized (this campaign)",{exact:true})).toBeVisible();
    await expect(totals.getByText("$2",{exact:true})).toBeVisible();
    await expect(totals.getByText("2 of 2",{exact:true})).toBeVisible();
    // Campaign details remain readable after archiving; current work stays uncluttered.
    expect((await fixture.db.from("editions").update({status:"cancelled"}).eq("id",fixture.campaign)).error).toBeNull();
    await page.goto("/admin/campaigns");
    await expect(page.getByRole("link",{name:/Original backup fixture/})).toHaveCount(0);
    await page.getByRole("link",{name:"Finished",exact:true}).click();
    await expect(page.getByRole("link",{name:/Original backup fixture/})).toBeVisible();
    expect((await fixture.db.from("editions").update({archived_at:new Date().toISOString()}).eq("id",fixture.campaign)).error).toBeNull();
    await page.goto(`/admin/artwork/${first}`);
    await expect(page.getByRole("link",{name:"Original backup fixture",exact:true})).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
