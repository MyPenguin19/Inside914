-- Serialize group artwork changes with confirmation. A completed group's files are immutable
-- through the hold editor; normal authenticated admin review fields remain usable.
create function private.guard_cart_artwork() returns trigger
language plpgsql security invoker set search_path='' as $$
declare b public.bookings;
begin
 if tg_op='UPDATE' and row(new.storage_path,new.status,new.crop_x,new.crop_y,new.crop_width,new.crop_height,new.zoom)
   is not distinct from row(old.storage_path,old.status,old.crop_x,old.crop_y,old.crop_width,old.crop_height,old.zoom) then return new; end if;
 select * into b from public.bookings where id=case when tg_op='DELETE' then old.booking_id else new.booking_id end for update;
 if b.cart_id is not null and (b.status<>'pending' or b.hold_expires_at<=now()) then
  -- Allow cascading cleanup when the booking itself has been deleted by a test fixture.
  raise exception 'This area hold is no longer editable';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.guard_cart_artwork() from public,anon,authenticated;
create trigger protect_cart_artwork before insert or update or delete on public.booking_artwork
for each row execute function private.guard_cart_artwork();
notify pgrst, 'reload schema';
