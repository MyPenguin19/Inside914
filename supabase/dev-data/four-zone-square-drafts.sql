-- LOCAL ONLY: run through scripts/local-test-db.py (fixed localhost connection).
-- March 2027 is a local verification month; existing January/February legacy fixtures are preserved.
-- All dates and 5,000 household targets are provisional, not production launch commitments.
\set ON_ERROR_STOP on
begin;
create temporary table local_owner as select gen_random_uuid() id;
insert into auth.users(id) select id from local_owner;
insert into admins(user_id) select id from local_owner;
select set_config('request.jwt.claim.sub',(select id::text from local_owner),true);
do $$
declare area text; zone uuid;
begin
 foreach area in array array['Central','Southern','Northern','Eastern'] loop
  select id into zone from zones where slug=lower(area)||'-westchester';
  if zone is null then
   insert into zones(name,slug,household_count) values(area||' Westchester',lower(area)||'-westchester',5000) returning id into zone;
  end if;
  if not exists(select 1 from editions where zone_id=zone and issue_month='2027-03-01') then
   perform public.admin_create_square_campaign(jsonb_build_object(
    'zone_id',zone,'name',area||' Westchester — Local MVP verification','issue_month','2027-03-01',
    'target_quantity',5000,'reservation_deadline','2027-02-16T04:59:00Z','artwork_due_at','2027-02-21T04:59:00Z',
    'mailing_window_start','2027-03-11','mailing_window_end','2027-03-15',
    'layout_template','amazingmail-9x6-ten-square-draft','unit_price_cents',39900,'double_price_cents',null));
  end if;
  if not exists(select 1 from editions where zone_id=zone and issue_month='2027-03-01' and status='draft' and product_model='square_v1' and unit_price_cents=39900) then
   raise exception 'Existing local March campaign conflicts; no data overwritten';
  end if;
 end loop;
end $$;
delete from admin_events where admin_user_id=(select id from local_owner);
delete from auth.users where id=(select id from local_owner);
commit;
select z.name,e.id,e.status,e.unit_price_cents,count(s.id) positions
from editions e join zones z on z.id=e.zone_id join slots s on s.edition_id=e.id
where e.issue_month='2027-03-01' and e.name like '%Local MVP verification'
group by z.name,e.id order by z.name;
