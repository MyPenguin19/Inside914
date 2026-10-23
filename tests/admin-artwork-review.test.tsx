import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdPlacement } from "@/components/admin/ad-placement";
import { OriginalArtwork } from "@/components/admin/original-artwork";
import type { AdminSlot } from "@/lib/admin/metrics";

afterEach(cleanup);
const slot: AdminSlot={id:"fixture",editionId:"fixture",label:"B2",side:"back",x:2.6,y:.1875,width:2.2925,height:2.815};
test("shows original, saved crop, contained dimensions and review guidance without deciding approval", () => {
  render(<AdPlacement layoutKey="amazingmail-9x6-v2" slots={[slot]} own={[slot]} artwork={{id:"fixture",contentType:"image/png",width:495,height:619,crop:{x:0,y:60,width:495,height:495},zoom:1,viewUrl:"/synthetic.png"}}/>);
  expect(screen.getByAltText("Original advertiser artwork")).toBeTruthy();
  expect(screen.getByAltText("The advertiser's ad on the postcard")).toBeTruthy();
  expect(screen.getByText("495 × 495 px")).toBeTruthy();
  expect(screen.getByText("2.2925″ × 2.2925″")).toBeTruthy();
  expect(screen.getByText("REVIEW · 215 effective PPI")).toBeTruthy();
  expect(screen.queryByRole("button",{name:/approve/i})).toBeNull();
});
test("warns on source load failure and recovers when the signed URL is renewed", () => {
  const {rerender}=render(<OriginalArtwork src="/expired.png"/>);
  fireEvent.error(screen.getByAltText("Original advertiser artwork"));
  expect(screen.getByRole("alert").textContent).toContain("verify the source file before approving");
  rerender(<OriginalArtwork src="/renewed.png"/>);
  expect(screen.queryByRole("alert")).toBeNull();
});
