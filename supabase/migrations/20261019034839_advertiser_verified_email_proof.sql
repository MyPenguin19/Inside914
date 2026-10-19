-- Independent mailbox proof: a normal password session or auto-confirmed signup is insufficient.
create table public.advertiser_email_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 verified_email text not null,
 verified_at timestamptz not null default now()
);
alter table public.advertiser_email_verifications enable row level security;
revoke all on public.advertiser_email_verifications from anon,authenticated;
grant select on public.advertiser_email_verifications to authenticated;
grant all on public.advertiser_email_verifications to service_role;
create policy own_email_verification on public.advertiser_email_verifications for select to authenticated using(user_id=(select auth.uid()));
create or replace function private.claim_advertiser_bookings() returns integer
language plpgsql security definer set search_path='' as $$
declare v_email text; v_count integer;
begin
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and coalesce(is_anonymous,false)=false;
 if v_email is null or not exists(select 1 from public.advertiser_email_verifications where user_id=auth.uid() and verified_email=v_email) then raise exception 'Verified email required'; end if;
 insert into public.advertiser_bookings(booking_id,user_id)
 select b.id,auth.uid() from public.bookings b join public.booking_contacts c on c.booking_id=b.id
 where lower(c.email)=v_email and b.status not in ('pending','released')
 on conflict(booking_id) do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end $$;
create or replace function private.advertiser_editable(p_booking uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.bookings; e public.editions;
begin
 if not exists(select 1 from public.advertiser_email_verifications v join auth.users u on u.id=v.user_id where u.id=auth.uid() and v.verified_email=lower(u.email)) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null) or
 not exists(select 1 from public.advertiser_bookings where booking_id=p_booking and user_id=auth.uid()) then raise exception 'Reservation unavailable'; end if;
 select * into b from public.bookings where id=p_booking for update;
 select * into e from public.editions where id=b.edition_id for update;
 if b.status<>'reserved' or e.status not in ('open','closed') or now()>=coalesce(e.artwork_due_at,e.artwork_deadline) then raise exception 'Reservation is locked; contact support'; end if;
end $$;

notify pgrst,'reload schema';
