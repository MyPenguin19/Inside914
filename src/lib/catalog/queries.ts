import "server-only";
import type { Availability, CatalogSlot, Occupancy, Side, SlotPair } from "@/lib/booking/selection";
import { pricesFor, POSTCARD_PRICES, type PricingMode } from "@/lib/pricing";
import { createPublicClient } from "@/lib/supabase/public";

export type EditionSummary = {
  productModel?: string;
  layoutTemplate?: string | null;
  id: string;
  zoneSlug: string;
  zoneName: string;
  households: number;
  issueMonth: string;
  artworkDeadline: string;
  mailDate: string | null;
  unitPriceCents: number;
  backUnitPriceCents?: number | null;
  doublePriceCents: number | null;
  fullSidePriceCents?: number;
  bothSidesPriceCents?: number;
  pricingMode: PricingMode;
  bookable: boolean;
  totalUnits: number;
  availableUnits: number;
};

export type EditionCatalog = EditionSummary & { slots: CatalogSlot[]; pairs: SlotPair[] };

type EditionRow = {
  product_model: string;
  layout_template: string | null;
  id: string;
  issue_month: string;
  artwork_deadline: string;
  mail_date: string | null;
  status: string;
  reservations_paused_at: string | null;
  reservations_open_at: string | null;
  unit_price_cents: number;
  back_unit_price_cents: number;
  double_unit_price_cents: number | null;
  zones: { slug: string; name: string; household_count: number } | null;
};

const EDITION_COLUMNS =
  "id, issue_month, artwork_deadline, mail_date, status, reservations_paused_at, reservations_open_at, layout_template, product_model, unit_price_cents, back_unit_price_cents, double_unit_price_cents, zones(slug, name, household_count)";
const SLOT_COLUMNS = "slot_id, side, label, x_in, y_in, width_in, height_in, available, occupancy";

// Prices shown are what a hold would cost under the active pricing configuration (lib/pricing).
// priced=false is ONLY for views that never show these prices (an existing reservation shows its
// own stored price), so they keep working whatever the current pricing configuration is.
function toSummary(row: EditionRow, slots: { available: boolean }[], priced = true): EditionSummary {
  const edition = { productModel: row.product_model, unitPriceCents: row.unit_price_cents, backUnitPriceCents: row.back_unit_price_cents, doublePriceCents: row.double_unit_price_cents };
  const prices = priced ? pricesFor(edition) : { mode: "launch" as const, ...edition };
  return {
    id: row.id,
    productModel: row.product_model,
    layoutTemplate: row.layout_template,
    zoneSlug: row.zones?.slug ?? "",
    zoneName: row.zones?.name ?? "",
    households: row.zones?.household_count ?? 0,
    issueMonth: row.issue_month,
    artworkDeadline: row.artwork_deadline,
    mailDate: row.mail_date,
    unitPriceCents: prices.unitPriceCents,
    backUnitPriceCents: prices.backUnitPriceCents,
    doublePriceCents: prices.doublePriceCents,
    pricingMode: prices.mode,
    ...(row.product_model === "square_v1" ? {} : POSTCARD_PRICES),
    bookable: row.status === "open" && !row.reservations_paused_at &&
      (!row.reservations_open_at || Date.parse(row.reservations_open_at) <= Date.now()) && Date.parse(row.artwork_deadline) > Date.now(),
    totalUnits: slots.length,
    availableUnits: slots.filter((s) => s.available).length,
  };
}

const OCCUPANCY = new Set<Occupancy>(["available", "held", "reserved", "closed"]);

function toSlots(rows: { slot_id: string | null; side: string | null; label: string | null; x_in: number | null; y_in: number | null; width_in: number | null; height_in: number | null; available: boolean | null; occupancy?: string | null }[]): CatalogSlot[] {
  return rows.map((r) => ({
    id: r.slot_id!,
    side: r.side as Side,
    label: r.label!,
    x: Number(r.x_in),
    y: Number(r.y_in),
    width: Number(r.width_in),
    height: Number(r.height_in),
    available: r.available === true,
    occupancy: OCCUPANCY.has(r.occupancy as Occupancy) ? (r.occupancy as Occupancy) : undefined,
  }));
}

function toPairs(rows: { left_slot_id: string | null; right_slot_id: string | null; side: string | null; available: boolean | null }[]): SlotPair[] {
  return rows.map((r) => ({
    leftId: r.left_slot_id!,
    rightId: r.right_slot_id!,
    side: r.side as Side,
    available: r.available === true,
  }));
}

// Open editions whose artwork deadline hasn't passed, soonest first.
export async function getBookableEditions(): Promise<EditionSummary[]> {
  const supabase = createPublicClient();
  const { data: editions, error } = await supabase
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("status", "open")
    .gt("artwork_deadline", new Date().toISOString())
    .order("issue_month")
    .returns<EditionRow[]>();
  if (error) throw new Error(`Could not load editions: ${error.message}`);
  if (!editions.length) return [];

  const { data: slots, error: slotError } = await supabase
    .from("slot_availability")
    .select("edition_id, available")
    .in("edition_id", editions.map((e) => e.id));
  if (slotError) throw new Error(`Could not load availability: ${slotError.message}`);

  return editions.map((e) =>
    toSummary(e, (slots ?? []).filter((s) => s.edition_id === e.id).map((s) => ({ available: s.available === true }))),
  );
}

// The area chooser needs every position. Load all square campaigns in two reads instead of
// loading summaries, then fetching each campaign and its positions again. Inventory stays fresh.
export async function getBookableSquareCatalogs(): Promise<EditionCatalog[]> {
  const supabase = createPublicClient();
  const { data: editions, error } = await supabase.from("editions")
    .select(EDITION_COLUMNS)
    .eq("product_model", "square_v1")
    .eq("status", "open")
    .gt("artwork_deadline", new Date().toISOString())
    .order("issue_month")
    .returns<EditionRow[]>();
  if (error) throw new Error(`Could not load editions: ${error.message}`);
  if (!editions.length) return [];

  const { data: rows, error: slotError } = await supabase.from("slot_availability")
    .select(`edition_id, ${SLOT_COLUMNS}`)
    .in("edition_id", editions.map(e => e.id))
    .order("side", { ascending: false }).order("y_in").order("x_in");
  if (slotError) throw new Error(`Could not load availability: ${slotError.message}`);
  return editions.map(edition => {
    const slots = toSlots((rows ?? []).filter(row => row.edition_id === edition.id));
    return { ...toSummary(edition, slots), slots, pairs: [] };
  }).filter(edition => edition.bookable);
}

export async function getEditionCatalog(editionId: string, { priced = true } = {}): Promise<EditionCatalog | null> {
  const supabase = createPublicClient();
  // Both reads use the public RLS client and are independent of each other.
  const [{ data: edition, error }, availability] = await Promise.all([supabase
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("id", editionId)
    .returns<EditionRow[]>()
    .maybeSingle(), getAvailabilityRows(editionId)]);
  if (error) throw new Error(`Could not load edition: ${error.message}`);
  if (!edition) return null;

  const slots = toSlots(availability.slotRows);
  return { ...toSummary(edition, slots, priced), slots, pairs: toPairs(availability.pairRows) };
}

// Fresh, uncached availability for one edition (read right before placing a hold).
export async function getAvailability(editionId: string): Promise<Availability> {
  const { slotRows, pairRows } = await getAvailabilityRows(editionId);
  return {
    slots: Object.fromEntries(slotRows.map((r) => [r.slot_id!, r.available === true])),
    pairs: toPairs(pairRows),
  };
}

async function getAvailabilityRows(editionId: string) {
  const supabase = createPublicClient();
  const [slots, pairs] = await Promise.all([
    supabase
      .from("slot_availability")
      .select(SLOT_COLUMNS)
      .eq("edition_id", editionId)
      .order("side", { ascending: false })
      .order("y_in")
      .order("x_in"),
    supabase.from("slot_pairs").select("left_slot_id, right_slot_id, side, available").eq("edition_id", editionId),
  ]);
  if (slots.error) throw new Error(`Could not load slots: ${slots.error.message}`);
  if (pairs.error) throw new Error(`Could not load slot pairs: ${pairs.error.message}`);
  return { slotRows: slots.data ?? [], pairRows: pairs.data ?? [] };
}
