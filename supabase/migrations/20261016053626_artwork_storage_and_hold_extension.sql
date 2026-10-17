-- Task 7: private artwork storage, one current artwork per booking, and a limited hold extension.

-- Private bucket. Browsers never get bucket-wide access: uploads use single-use signed upload
-- URLs for a server-chosen random path, and viewing uses short-lived signed URLs, both issued
-- only after the hold token is verified. No storage.objects policies are added for this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artwork', 'artwork', false, 20971520, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create table public.booking_artwork (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  -- "<booking_id>/<random uuid>" chosen by the server, never by the browser.
  storage_path text not null unique,
  status text not null default 'uploading' check (status in ('uploading', 'ready')),
  content_type text check (content_type in ('image/jpeg', 'image/png')),
  byte_size integer check (byte_size > 0),
  width_px integer check (width_px > 0),
  height_px integer check (height_px > 0),
  -- Crop rectangle in source-image pixels, plus the zoom the customer chose.
  crop_x numeric check (crop_x >= 0),
  crop_y numeric check (crop_y >= 0),
  crop_width numeric check (crop_width > 0),
  crop_height numeric check (crop_height > 0),
  zoom numeric check (zoom >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ready' or (content_type is not null and byte_size is not null
                               and width_px is not null and height_px is not null)),
  check (crop_x is null or (crop_x + crop_width <= width_px + 1 and crop_y + crop_height <= height_px + 1))
);

alter table public.booking_artwork enable row level security;

create policy "admins manage booking artwork" on public.booking_artwork
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.booking_artwork from anon;

-- Hold extension: a pending hold may be renewed to a fresh 15 minutes, at most twice, and only
-- in its last 5 minutes. Hold length itself is unchanged (15 min); max total is about 45 min.
alter table public.bookings
  add column hold_extensions integer not null default 0 check (hold_extensions between 0 and 2);

-- Errors: INS05 hold_not_found, INS06 hold_expired, INS07 extension_limit, INS08 extension_too_early.
create function public.extend_hold(p_token_hash text)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where hold_token_hash = p_token_hash for update;

  if not found or v_booking.status <> 'pending' then
    raise exception using errcode = 'INS05', message = 'hold_not_found';
  end if;
  if v_booking.hold_expires_at <= now() then
    raise exception using errcode = 'INS06', message = 'hold_expired';
  end if;
  if v_booking.hold_extensions >= 2 then
    raise exception using errcode = 'INS07', message = 'extension_limit';
  end if;
  if v_booking.hold_expires_at - now() > interval '5 minutes' then
    raise exception using errcode = 'INS08', message = 'extension_too_early';
  end if;

  update public.bookings
     set hold_expires_at = now() + interval '15 minutes',
         hold_extensions = hold_extensions + 1,
         updated_at = now()
   where id = v_booking.id
  returning hold_expires_at into v_booking.hold_expires_at;

  return v_booking.hold_expires_at;
end;
$$;

revoke execute on function public.extend_hold(text) from public, anon, authenticated;
grant execute on function public.extend_hold(text) to service_role;
