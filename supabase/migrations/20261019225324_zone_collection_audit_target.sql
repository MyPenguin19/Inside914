create or replace function public.admin_prepare_zone_collection(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 perform 1 from public.editions where id=p_id for update;
 if not exists(select 1 from public.zone_charges where edition_id=p_id) then
  perform private.check_zone_collection(p_id);
  insert into public.zone_charges(booking_id,edition_id,consent_id,amount_cents,customer_id,payment_method_id,created_by)
  select b.id,b.edition_id,c.id,39900,b.stripe_customer_id,b.stripe_payment_method_id,auth.uid()
  from public.bookings b cross join lateral(select id from public.payment_consents where booking_id=b.id and amount_cents=39900 and currency='usd' and terms_version='square-zones-v1' order by consented_at desc limit 1)c
  where b.edition_id=p_id and b.status='reserved';
  update public.editions set status='approved_to_print',updated_at=now() where id=p_id;
  insert into public.admin_events(admin_user_id,event_type,target_type,target_id,details) values(auth.uid(),'zone_collection_authorized','campaign',p_id,jsonb_build_object('reservations',10,'amount_per_reservation',39900));
 end if;
 return (select jsonb_agg(to_jsonb(c) order by c.id) from public.zone_charges c where edition_id=p_id);
end $$;
