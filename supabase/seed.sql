-- PLACEHOLDER catalog for local development. Replace the grid and prices
-- with the real slot grid once provided (SPEC open question 1).

insert into public.zones (id, slug, name, household_count) values
  ('00000000-0000-4000-8000-000000000001', 'southern-westchester', 'Southern Westchester (placeholder)', 10000);

insert into public.editions (id, zone_id, issue_month, artwork_deadline, mail_date, status) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   '2027-01-01', '2026-12-15 23:59:59-05', '2027-01-05', 'open'),
  -- Draft edition: must never be visible to the public.
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
   '2027-02-01', '2027-01-15 23:59:59-05', '2027-02-05', 'draft');

-- Open edition, front: full-width banner + six 3.25" x 3" slots.
insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in, price_cents) values
  ('00000000-0000-4000-8000-000000000101', 'front', 'F-banner', 0, 0, 6.5, 3, 59900),
  ('00000000-0000-4000-8000-000000000101', 'front', 'F1', 0,    3, 3.25, 3, 24900),
  ('00000000-0000-4000-8000-000000000101', 'front', 'F2', 3.25, 3, 3.25, 3, 24900),
  ('00000000-0000-4000-8000-000000000101', 'front', 'F3', 0,    6, 3.25, 3, 24900),
  ('00000000-0000-4000-8000-000000000101', 'front', 'F4', 3.25, 6, 3.25, 3, 24900),
  ('00000000-0000-4000-8000-000000000101', 'front', 'F5', 0,    9, 3.25, 3, 24900),
  ('00000000-0000-4000-8000-000000000101', 'front', 'F6', 3.25, 9, 3.25, 3, 24900);

-- Open edition, back: eight 3.25" x 3" slots.
insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in, price_cents)
select '00000000-0000-4000-8000-000000000101', 'back', 'B' || (row_n * 2 + col_n + 1),
       col_n * 3.25, row_n * 3, 3.25, 3, 19900
from generate_series(0, 3) as row_n, generate_series(0, 1) as col_n;

insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in, price_cents) values
  ('00000000-0000-4000-8000-000000000102', 'front', 'F-banner', 0, 0, 6.5, 3, 59900);
