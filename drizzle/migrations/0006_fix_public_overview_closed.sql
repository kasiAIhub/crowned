create or replace function public.public_overview() returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare cd record; s public.salon_settings; n timestamptz := private.now_(); is_open boolean; r record;
  b_start timestamptz; b_low timestamptz; b_high timestamptz; found_best boolean := false;
  anyfit boolean := false; allfit boolean := true; fits boolean;
begin
  select * into s from public.salon_settings x where x.id = 1;
  select * into cd from private.current_day();
  is_open := cd.opens_at <= n and n < cd.closes_at;
  for r in
    select sv.braid_minutes, pd.expected_start, pd.start_low, pd.start_high, pd.finish_high
    from public.services sv cross join lateral private.plan_day(sv.id, false) pd
    where sv.active and pd.booking_id is null order by sv.braid_minutes, sv.sort_order
  loop
    fits := is_open and r.finish_high <= cd.closes_at - make_interval(mins => s.closing_buffer_minutes);
    if fits then
      anyfit := true;
      if not found_best then b_start := r.expected_start; b_low := r.start_low; b_high := r.start_high; found_best := true; end if;
    else allfit := false; end if;
  end loop;
  return jsonb_build_object(
    'is_open', is_open, 'opens_at', cd.opens_at, 'closes_at', cd.closes_at,
    'next_opening', case when is_open then null else private.next_opening() end,
    'girls_in_chairs', (select count(*) from public.bookings b where b.salon_day_id = cd.id and b.status = 'in_chair'),
    'bookings_waiting', (select count(*) from public.bookings b where b.salon_day_id = cd.id and b.status in ('booked','called')),
    'next_new_booking', case when found_best then jsonb_build_object(
        'wait_minutes', round(extract(epoch from b_start - n) / 60), 'start_low', b_low, 'start_high', b_high) else null end,
    'any_style_fits', anyfit, 'all_styles_fit', anyfit and allfit,
    'version', (select version from public.salon_state where id = 1));
end $$;
revoke execute on function public.public_overview() from public;
grant execute on function public.public_overview() to anon, authenticated, service_role;