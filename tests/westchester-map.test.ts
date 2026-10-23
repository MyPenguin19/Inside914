import { expect, test } from "vitest";
import { AREA_GUIDE } from "@/components/booking/westchester-map-data";
import { REGIONS } from "@/lib/catalog/regions";

test("proposed groups cover all 25 municipalities once, without adding village populations", () => {
 expect(Object.keys(AREA_GUIDE)).toEqual(REGIONS.map(r => r.slug));
 const towns = Object.values(AREA_GUIDE).flatMap(area => area.municipalities);
 expect(towns).toHaveLength(25);
 expect(new Set(towns.map(t => t.id)).size).toBe(25);
 expect(towns.reduce((sum,t) => sum + t.population,0)).toBe(1004457);
 for (const area of Object.values(AREA_GUIDE)) {
  expect(area.municipalities.length).toBeGreaterThanOrEqual(6);
  const populations = area.municipalities.map(t => t.population);
  expect(populations).toEqual([...populations].sort((a,b) => b-a));
  expect(area.path.startsWith("M")).toBe(true);
 }
});
