-- Task 13: consents were limited to exactly 50000 / 90000 cents, so a $1 / $2 TEST reservation
-- couldn't be authorized. Any positive amount is allowed now; confirm_booking() still requires
-- the consent amount to equal the booking's own stored price. Each consent also records which
-- pricing applied, so test authorizations are identifiable. Existing rows keep their amounts.

alter table public.payment_consents drop constraint payment_consents_amount_cents_check;
alter table public.payment_consents add constraint payment_consents_amount_cents_check check (amount_cents > 0);

alter table public.payment_consents
  add column pricing_mode text not null default 'launch' check (pricing_mode in ('launch', 'test'));
