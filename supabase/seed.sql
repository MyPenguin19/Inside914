-- PROVISIONAL catalog for local development and the dev project. Slot geometry is a
-- placeholder grid, NOT the approved print layout: final postal/printer specs are pending.

insert into public.zones (id, slug, name, household_count) values
  ('00000000-0000-4000-8000-000000000001', 'central-westchester', 'Central Westchester', 5000);

insert into public.editions
  (id, zone_id, issue_month, artwork_deadline, mail_date, status, unit_price_cents, double_unit_price_cents)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   '2027-01-01', '2026-12-15 23:59:59-05', '2027-01-05', 'open', 50000, 90000),
  -- Draft edition: must never be visible to the public.
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
   '2027-02-01', '2027-01-15 23:59:59-05', '2027-02-05', 'draft', 50000, 90000);

-- Open edition: 16 provisional units, 8 per side, two 3.25" x 3" units per row.
insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in)
select '00000000-0000-4000-8000-000000000101', side, upper(left(side, 1)) || (row_n * 2 + col_n + 1),
       col_n * 3.25, row_n * 3, 3.25, 3
from unnest(array['front', 'back']) as side, generate_series(0, 3) as row_n, generate_series(0, 1) as col_n;

insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in) values
  ('00000000-0000-4000-8000-000000000102', 'front', 'F1', 0, 0, 3.25, 3);
