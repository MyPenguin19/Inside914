-- Local development only. No customer data, invented delivery counts or open campaigns.
-- Create current square_v1 campaigns through the administrator workflow.
-- Historical catalog regression fixtures live in tests/fixtures/legacy-catalog.sql.
insert into public.zones (id, slug, name, household_count) values
  ('00000000-0000-4000-8000-000000000001', 'central-westchester', 'Central Westchester', 0),
  ('00000000-0000-4000-8000-000000000002', 'southern-westchester', 'Southern Westchester', 0),
  ('00000000-0000-4000-8000-000000000003', 'northern-westchester', 'Northern Westchester', 0),
  ('00000000-0000-4000-8000-000000000004', 'eastern-westchester', 'Eastern Westchester', 0)
on conflict do nothing;
