-- One-off DEV project data update (not a migration): align the Inside914 dev catalog with the
-- provisional seed after 20261016060000_bookings_multi_slot_hold. Run only with approval.

update public.zones
   set slug = 'central-westchester', name = 'Central Westchester', household_count = 5000
 where id = '00000000-0000-4000-8000-000000000001';

update public.editions
   set unit_price_cents = 50000, double_unit_price_cents = 90000
 where id in ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102');

-- Replace the open edition's front (banner + 6 units) with 8 standard units; back is already 8.
delete from public.slots
 where edition_id = '00000000-0000-4000-8000-000000000101' and side = 'front';

insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in)
select '00000000-0000-4000-8000-000000000101', 'front', 'F' || (row_n * 2 + col_n + 1),
       col_n * 3.25, row_n * 3, 3.25, 3
from generate_series(0, 3) as row_n, generate_series(0, 1) as col_n;

update public.slots
   set label = 'F1', width_in = 3.25
 where edition_id = '00000000-0000-4000-8000-000000000102' and label = 'F-banner';
