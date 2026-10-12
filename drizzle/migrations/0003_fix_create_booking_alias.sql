create or replace function private.create_booking(p jsonb, p_source text, p_by text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare err text; did uuid; d public.salon_days; s public.salon_settings; n timestamptz; x record;
  c text; bid uuid; actor text := case when p_by = 'parent' then 'parent' else 'salon' end;
  det jsonb; svc uuid; wash boolean; qo numeric; ph text;
begin
  if p_source is null or p_source not in ('online','phone','whatsapp','walk_in') then
    return jsonb_build_object('refused', true, 'message', 'Please choose how this booking came in.');
  end if;
  err := private.validate(p, p_source <> 'walk_in');
  if err is not null then return jsonb_build_object('refused', true, 'reason', 'invalid', 'message', err); end if;
  svc := (p->>'service_id')::uuid;
  wash := coalesce((p->>'needs_wash')::boolean, false);
  ph := nullif(regexp_replace(coalesce(p->>'phone',''), '[\s-]', '', 'g'), '');

  perform pg_advisory_xact_lock(7428190);
  did := private.ensure_day();
  select * into d from public.salon_days sd where sd.id = did;
  select * into s from public.salon_settings ss where ss.id = 1;
  n := private.now_();
  det := jsonb_build_object('service_id', svc, 'needs_wash', wash, 'source', p_source);

  if not (d.opens_at <= n and n < d.closes_at) then
    perform private.log_event(did, 'refused_closed', actor, null, null, null, det, false);
    return jsonb_build_object('refused', true, 'reason', 'closed',
      'message', 'We''re closed right now. We open again ' || private.fmt_opening() || '.');
  end if;

  select * into x from private.plan_day(svc, wash) pd where pd.booking_id is null;
  if x.finish_high is null or x.finish_high > d.closes_at - make_interval(mins => s.closing_buffer_minutes) then
    perform private.log_event(did, 'refused_full', actor, null, null, null, det, false);
    return jsonb_build_object('refused', true, 'reason', 'full',
      'message', 'We''re fully booked for today. Please book again tomorrow from ' || to_char(s.default_open_time, 'HH24:MI') || '.');
  end if;

  select coalesce(max(b.queue_order), 0) + 1 into qo from public.bookings b where b.salon_day_id = did;
  c := private.gen_code();
  insert into public.bookings (salon_day_id, code, parent_name, phone, child_name, child_age, service_id, needs_wash,
    mani_pedi, waiting_pref, note, status, queue_order, checked_in, booked_at, source, booked_by)
  values (did, c, trim(p->>'parent_name'), ph, trim(p->>'child_name'), (p->>'child_age')::int, svc, wash,
    coalesce((p->>'mani_pedi')::boolean, true), nullif(trim(coalesce(p->>'waiting_pref','')), ''),
    nullif(trim(coalesce(p->>'note','')), ''), 'booked', qo, p_source = 'walk_in', n, p_source, p_by)
  returning id into bid;
  perform private.log_event(did, 'booked', actor, bid, null, null, jsonb_build_object('source', p_source, 'service_id', svc), p_by = 'salon');
  perform private.bump('booked');
  if p_by = 'salon' then return jsonb_build_object('code', c, 'booking_id', bid); end if;
  return jsonb_build_object('code', c);
end $$;
revoke execute on function private.create_booking(jsonb,text,text) from public, anon, authenticated;