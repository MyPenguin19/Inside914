import "server-only";
import type { Availability, CatalogSlot, Side, SlotPair } from "@/lib/booking/selection";
import { createPublicClient } from "@/lib/supabase/public";

export type EditionSummary = {
  id: string;
  zoneName: string;
  households: number;
  issueMonth: string;
  artworkDeadline: string;
  unitPriceCents: number;
  doublePriceCents: number | null;
  bookable: boolean;
  totalUnits: number;
  availableUnits: number;
};

export type EditionCatalog = EditionSummary & { slots: CatalogSlot[]; pairs: SlotPair[] };

type EditionRow = {
  id: string;
  issue_month: string;
  artwork_deadline: string;
  status: string;
  unit_price_cents: number;
  double_unit_price_cents: number | null;
  zones: { name: string; household_count: number } | null;
};

const EDITION_COLUMNS =
  "id, issue_month, artwork_deadline, status, unit_price_cents, double_unit_price_cents, zones(name, household_count)";

function toSummary(row: EditionRow, slots: { available: boolean }[]): EditionSummary {
  return {
    id: row.id,
    zoneName: row.zones?.name ?? "",
    households: row.zones?.household_count ?? 0,
    issueMonth: row.issue_month,
    artworkDeadline: row.artwork_deadline,
    unitPriceCents: row.unit_price_cents,
    doublePriceCents: row.double_unit_price_cents,
    bookable: row.status === "open" && Date.parse(row.artwork_deadline) > Date.now(),
    totalUnits: slots.length,
    availableUnits: slots.filter((s) => s.available).length,
  };
}

function toSlots(rows: { slot_id: string | null; side: string | null; label: string | null; x_in: number | null; y_in: number | null; width_in: number | null; height_in: number | null; available: boolean | null }[]): CatalogSlot[] {
  return rows.map((r) => ({
    id: r.slot_id!,
    side: r.side as Side,
    label: r.label!,
    x: Number(r.x_in),
    y: Number(r.y_in),
    width: Number(r.width_in),
    height: Number(r.height_in),
    available: r.available === true,
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

export async function getEditionCatalog(editionId: string): Promise<EditionCatalog | null> {
  const supabase = createPublicClient();
  const { data: edition, error } = await supabase
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("id", editionId)
    .returns<EditionRow[]>()
    .maybeSingle();
  if (error) throw new Error(`Could not load edition: ${error.message}`);
  if (!edition) return null;

  const availability = await getAvailabilityRows(editionId);
  const slots = toSlots(availability.slotRows);
  return { ...toSummary(edition, slots), slots, pairs: toPairs(availability.pairRows) };
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
      .select("slot_id, side, label, x_in, y_in, width_in, height_in, available")
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
