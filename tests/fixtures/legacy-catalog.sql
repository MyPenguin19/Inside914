-- Isolated regression fixtures for historical reservation compatibility, not the
-- current product catalog. Run only through setup-local-catalog.ts (localhost).
-- Existing fixture campaigns/slots are never overwritten or reset.
insert into public.zones (id, slug, name, household_count) values
  ('00000000-0000-4000-8000-000000000001', 'central-westchester', 'Central Westchester', 0)
on conflict do nothing;

insert into private.approved_layout_templates (template_key, approval_reference)
values ('test-approved-legacy-catalog', 'Local synthetic legacy regression fixture only; never a production print approval')
on conflict do nothing;

with created as (
  insert into public.editions
    (id, zone_id, issue_month, artwork_deadline, mail_date, status,
     unit_price_cents, double_unit_price_cents, layout_template)
  values
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
     '2099-01-01', '2098-12-15 23:59:59-05', '2099-01-05', 'open',
     50000, 90000, 'test-approved-legacy-catalog')
  on conflict do nothing returning id
)
insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in)
select created.id, side, upper(left(side, 1)) || (row_n * 2 + col_n + 1),
       col_n * 3.25, row_n * 3, 3.25, 3
from created, unnest(array['front', 'back']) as side,
     generate_series(0, 3) as row_n, generate_series(0, 1) as col_n;

with created as (
  insert into public.editions
    (id, zone_id, issue_month, artwork_deadline, mail_date, status, unit_price_cents, double_unit_price_cents)
  values
    ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
     '2099-02-01', '2099-01-15 23:59:59-05', '2099-02-05', 'draft', 50000, 90000)
  on conflict do nothing returning id
)
insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in)
select id, 'front', 'F1', 0, 0, 3.25, 3 from created;
