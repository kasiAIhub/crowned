create or replace function public.reset_demo(pin text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare n timestamptz; o timestamptz; c timestamptz; did uuid; tz text := 'Africa/Johannesburg';
  s_corn uuid; s_box uuid; s_knot uuid; s_twist uuid; s_stitch uuid; c1 uuid; c2 uuid; c3 uuid; b1 uuid; b2 uuid; b3 uuid;
  types text[] := array['called','arrived','started','finished','collected'];
begin
  perform private.require_pin(pin);
  if not (select demo_mode from public.salon_settings where id = 1) then
    return jsonb_build_object('ok', false, 'message', 'Demo mode is off, so the demo cannot be reset.');
  end if;
  n := private.now_();
  if exists (select 1 from public.chairs ch join public.bookings b on b.id = ch.current_booking_id
             join public.salon_days sd on sd.id = b.salon_day_id where not sd.is_demo) then
    return jsonb_build_object('ok', false, 'message', 'A real booking is in a chair. The demo was not reset.');
  end if;
  o := date_trunc('hour', n - interval '3 hours');
  c := date_trunc('hour', n + interval '6 hours');
  if c < n + interval '6 hours' then c := c + interval '1 hour'; end if;
  if exists (select 1 from public.salon_days sd where not sd.is_demo and sd.opens_at < c and sd.closes_at > o) then
    return jsonb_build_object('ok', false, 'message', 'A real salon day overlaps this time. The demo was not reset.');
  end if;

  -- Only demo data is removed; real salon days, bookings and events are never touched.
  update public.chairs set current_booking_id = null
    where current_booking_id in (select b.id from public.bookings b join public.salon_days sd on sd.id = b.salon_day_id where sd.is_demo);
  delete from public.salon_events where salon_day_id in (select sd.id from public.salon_days sd where sd.is_demo);
  delete from public.bookings where salon_day_id in (select sd.id from public.salon_days sd where sd.is_demo);
  delete from public.salon_days where is_demo;
  update public.chairs set braider_name = (array['Palesa','Nomsa','Refilwe','Dineo','Busi','Lindiwe','Mpho','Karabo','Sibongile','Tebogo'])[num],
    active = num <= 4, started_at = null, planned_minutes = null, delay_minutes = 0 where current_booking_id is null;

  insert into public.salon_days (label_date, opens_at, closes_at, is_demo) values ((o at time zone tz)::date, o, c, true) returning id into did;

  select id into s_corn from public.services where name like 'Cornrows%';
  select id into s_box from public.services where name like 'Box braids%';
  select id into s_knot from public.services where name like 'Knotless%';
  select id into s_twist from public.services where name like 'Two-strand%';
  select id into s_stitch from public.services where name like 'Stitch%';
  select id into c1 from public.chairs where num = 1;
  select id into c2 from public.chairs where num = 2;
  select id into c3 from public.chairs where num = 3;

  insert into public.bookings (salon_day_id, code, parent_name, phone, child_name, child_age, service_id, needs_wash, status, queue_order, checked_in, booked_at, started_at, chair_id, source, booked_by)
  values (did, private.gen_code(), 'Mrs Mokoena', '0720000001', 'Lerato', 8, s_knot, false, 'in_chair', 0, true, n - interval '100 minutes', n - interval '70 minutes', c1, 'online', 'parent') returning id into b1;
  insert into public.bookings (salon_day_id, code, parent_name, phone, child_name, child_age, service_id, needs_wash, status, queue_order, checked_in, booked_at, started_at, chair_id, source, booked_by)
  values (did, private.gen_code(), 'Ayanda', '0720000002', 'Amahle', 6, s_corn, true, 'in_chair', 0, true, n - interval '60 minutes', n - interval '30 minutes', c2, 'phone', 'salon') returning id into b2;
  insert into public.bookings (salon_day_id, code, parent_name, phone, child_name, child_age, service_id, needs_wash, status, queue_order, checked_in, booked_at, started_at, chair_id, source, booked_by)
  values (did, private.gen_code(), 'Lindi', '0720000003', 'Naledi', 11, s_box, false, 'in_chair', 0, true, n - interval '110 minutes', n - interval '80 minutes', c3, 'online', 'parent') returning id into b3;
  update public.chairs set current_booking_id = b1, started_at = n - interval '70 minutes', planned_minutes = 90 where id = c1;
  update public.chairs set current_booking_id = b2, started_at = n - interval '30 minutes', planned_minutes = 100 where id = c2;
  update public.chairs set current_booking_id = b3, started_at = n - interval '80 minutes', planned_minutes = 75 where id = c3;

  insert into public.bookings (salon_day_id, code, parent_name, phone, child_name, child_age, service_id, needs_wash, status, queue_order, checked_in, booked_at, source, booked_by) values
    (did, private.gen_code(), 'Mpumi', '0720000004', 'Thandi', 7, s_corn, false, 'booked', 1, true, n - interval '50 minutes', 'online', 'parent'),
    (did, private.gen_code(), 'Refiloe', '0720000005', 'Kgomotso', 9, s_twist, true, 'booked', 2, false, n - interval '35 minutes', 'phone', 'salon'),
    (did, private.gen_code(), 'Nandi', '0720000006', 'Zinhle', 6, s_knot, false, 'booked', 3, false, n - interval '5 minutes', 'online', 'parent');
  insert into public.bookings (salon_day_id, code, parent_name, phone, child_name, child_age, service_id, needs_wash, status, queue_order, checked_in, booked_at, started_at, finished_at, source, booked_by)
  values (did, private.gen_code(), 'Kea', '0720000007', 'Boitumelo', 10, s_stitch, false, 'ready', 0, true, n - interval '150 minutes', n - interval '94 minutes', n - interval '4 minutes', 'walk_in', 'salon');

  insert into public.salon_events (created_at, salon_day_id, type, actor, details, is_tap)
  select n - make_interval(mins => i * 8), did, types[1 + (i % 5)], 'salon', jsonb_build_object('seed', true), true
  from generate_series(1, 20) i;

  perform private.bump('day_opened');
  return jsonb_build_object('ok', true, 'opens_at', o, 'closes_at', c);
end $$;

revoke execute on function public.reset_demo(text) from public;
grant execute on function public.reset_demo(text) to anon, authenticated, service_role;