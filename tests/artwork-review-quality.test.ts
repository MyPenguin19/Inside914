import { describe, expect, test } from "vitest";
import { assessArtworkQuality, reviewResolution } from "@/lib/artwork/review-quality";

describe("advisory print review", () => {
  test.each([[199,"FAIL"],[200,"REVIEW"],[299,"REVIEW"],[300,"PASS"]] as const)("%i PPI is %s", (ppi,status) => {
    expect(reviewResolution(ppi)).toBe(status);
  });
  test("contains a square on a rectangular back without penalizing its neutral margins", () => {
    const source={width:495,height:619}, crop={x:0,y:60,width:495,height:495};
    const assessment=assessArtworkQuality(source,crop,{width:2.2925,height:2.815});
    expect(assessment).toMatchObject({ppi:215,status:"REVIEW",printed:{width:2.2925,height:2.2925},minimumPixels:{width:688,height:688}});
    expect(crop).toEqual({x:0,y:60,width:495,height:495});
  });
  test("uses the crop, not the larger original or export density", () => {
    expect(assessArtworkQuality({width:2400,height:2400},{x:100,y:100,width:300,height:300},{width:2.78,height:2.78})).toMatchObject({ppi:107,status:"FAIL",minimumPixels:{width:834,height:834}});
  });
  test("preserves a portrait aspect ratio", () => {
    const a=assessArtworkQuality({width:900,height:1800},{x:0,y:0,width:900,height:1800},{width:2.2925,height:2.815})!;
    expect(a.printed.width/a.printed.height).toBeCloseTo(.5);
    expect(a.ppi).toBe(639);
  });
  test("does not assess missing or invalid data", () => {
    const source={width:900,height:900}, panel={width:2.78,height:2.78};
    for (const crop of [null,{x:0,y:0,width:0,height:900},{x:500,y:0,width:900,height:900},{x:NaN,y:0,width:900,height:900},{x:0,y:0,width:901,height:900},{x:.6,y:0,width:900,height:900}]) expect(assessArtworkQuality(source,crop,panel)).toBeNull();
  });
});
