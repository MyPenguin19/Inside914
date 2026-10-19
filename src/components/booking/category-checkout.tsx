import { connection } from "next/server";
import { categoryCatalog } from "@/lib/booking/category-checkout";
import { CategoryZoneSelector } from "./category-zone-selector";
import { Notice } from "@/components/ui/primitives";
export async function CategoryCheckout() {
  await connection();
  let catalog;
  try { catalog = await categoryCatalog(); }
  catch { return <Notice tone="danger" role="alert">Category availability could not be loaded. Please refresh; nothing was reserved.</Notice>; }
  return <CategoryZoneSelector {...catalog} />;
}
