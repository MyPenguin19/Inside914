import v2 from "./layout-v2.json";
import { AMAZINGMAIL_9X6_LAYOUT, type PrintRectangle } from "./amazingmail-layout";

type Region = PrintRectangle & { side: "front" | "back" };
export type PostcardLayout = {
  key: string; approved: boolean;
  file: PrintRectangle; trim: PrintRectangle; live: PrintRectangle;
  postal: Region; housePanel: Region;
  paidSlots: readonly (Region & { label: string })[];
};

// Immutable campaign keys: never substitute the newest layout when reading a reservation.
// JSON is also the input to the generated SQL inventory, checked for drift in tests.
export const PRINT_DPI = v2.exportDpi;
export const POSTCARD_LAYOUT_V2: PostcardLayout = v2 as PostcardLayout;
export const POSTCARD_LAYOUTS: readonly PostcardLayout[] = [AMAZINGMAIL_9X6_LAYOUT, POSTCARD_LAYOUT_V2];
export const findPostcardLayout = (key: string | null | undefined) => POSTCARD_LAYOUTS.find(l => l.key === key) ?? null;
export const layoutVersion = (key: string | null | undefined) => key === POSTCARD_LAYOUT_V2.key ? "V2" : key === AMAZINGMAIL_9X6_LAYOUT.key ? "V1" : "Legacy";
export const isLayoutV2 = (key: string | null | undefined) => key === POSTCARD_LAYOUT_V2.key;

export function acceptsCrop(key: string | null | undefined, crop: { width: number; height: number }) {
  return Number.isFinite(crop.width) && Number.isFinite(crop.height) && crop.width > 0 && crop.height > 0 &&
    (isLayoutV2(key) || Math.abs(crop.width - crop.height) <= 1);
}

export function regionToTrim<T extends PrintRectangle>(layout: PostcardLayout, region: T): T {
  return { ...region, x: Math.round((region.x - layout.trim.x) * 1e6) / 1e6, y: Math.round((region.y - layout.trim.y) * 1e6) / 1e6 };
}

export function postcardZones(key: string | null | undefined) {
  const layout = findPostcardLayout(key);
  return layout ? [
    { ...regionToTrim(layout, layout.housePanel), kind: "house" as const, title: "Inside914 + Inside Diagnostics", detail: "House advertisement · Not for sale" },
    { ...regionToTrim(layout, layout.postal), kind: "postal" as const, title: "Reserved for mailing", detail: "No advertising" },
  ] : [];
}

export const placementDimensions = (r: Pick<PrintRectangle, "width" | "height">) => `${r.width}″ × ${r.height}″`;
