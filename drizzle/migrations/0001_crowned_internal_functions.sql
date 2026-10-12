create or replace function private.now_() returns timestamptz
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('crowned.fake_now', true), '')::timestamptz, now())
$$;

create or replace function private.band(m numeric) returns int
language sql stable set search_path = public as $$
  select greatest(s.estimate_band_min_minutes, round(greatest(m, 0) * s.estimate_band_percent / 100.0)::int)
  from public.salon_settings s where s.id = 1
$$;

create or replace function private.current_day(out id uuid, out label_date date, out opens_at timestamptz, out closes_at timestamptz, out is_virtual boolean)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
declare
  s public.salon_settings; d public.salon_days; n timestamptz := private.now_();
  tz text := 'Africa/Johannesburg'; ld date; lt time; vo timestamptz; vc timestamptz;
begin
  select * into s from public.salon_settings x where x.id = 1;
  ld := (n at time zone tz)::date; lt := (n at time zone tz)::time;
  select * into d from public.salon_days sd where sd.opens_at <= n order by sd.opens_at desc limit 1;
  if d.id is null or (ld > d.label_date and lt >= s.default_open_time) then
    vo := (ld + s.default_open_time) at time zone tz;
    vc := ((case when s.default_closing_time <= s.default_open_time then ld + 1 else ld end) + s.default_closing_time) at time zone tz;
    select * into d from public.salon_days sd where sd.opens_at = vo;
    if d.id is not null then
      id := d.id; label_date := d.label_date; opens_at := d.opens_at; closes_at := d.closes_at; is_virtual := false;
    else
      id := null; label_date := ld; opens_at := vo; closes_at := vc; is_virtual := true;
    end if;
  else
    id := d.id; label_date := d.label_date; opens_at := d.opens_at; closes_at := d.closes_at; is_virtual := false;
  end if;
end $$;

create or replace function private.next_opening() returns timestamptz
language plpgsql stable security definer set search_path = public, private as $$
declare s public.salon_settings; n timestamptz := private.now_(); tz text := 'Africa/Johannesburg'; ld date; o timestamptz;
begin
  select * into s from public.salon_settings x where x.id = 1;
  ld := (n at time zone tz)::date;
  o := (ld + s.default_open_time) at time zone tz;
  if o <= n then o := ((ld + 1) + s.default_open_time) at time zone tz; end if;
  return o;
end $$;

create or replace function private.fmt_opening() returns text
language plpgsql stable security definer set search_path = public, private as $$
declare o timestamptz := private.next_opening(); tz text := 'Africa/Johannesburg';
begin
  return case when (o at time zone tz)::date = (private.now_() at time zone tz)::date then 'today' else 'tomorrow' end
    || ' at ' || to_char(o at time zone tz, 'HH24:MI');
end $$;

create or replace function private.bump(t text) returns void
language sql security definer set search_path = public as $$
  update public.salon_state set version = version + 1, updated_at = now(), last_event_type = t, last_event_at = private.now_() where id = 1
$$;

create or replace function private.log_event(p_day uuid, p_type text, p_actor text, p_booking uuid, p_chair uuid, p_minutes int, p_details jsonb, p_tap boolean)
returns uuid language sql security definer set search_path = public as $$
  insert into public.salon_events (created_at, salon_day_id, type, actor, booking_id, chair_id, minutes, details, is_tap)
  values (private.now_(), p_day, p_type, p_actor, p_booking, p_chair, p_minutes, coalesce(p_details, '{}'::jsonb), coalesce(p_tap, false))
  returning id
$$;

create or replace function private.ensure_day() returns uuid
language plpgsql security definer set search_path = public, private as $$
declare cd record; did uuid;
begin
  select * into cd from private.current_day();
  if not cd.is_virtual then return cd.id; end if;
  insert into public.salon_days (label_date, opens_at, closes_at, is_demo)
  values (cd.label_date, cd.opens_at, cd.closes_at, false)
  on conflict (opens_at) do nothing returning id into did;
  if did is null then
    select sd.id into did from public.salon_days sd where sd.opens_at = cd.opens_at;
  else
    perform private.log_event(did, 'day_opened', 'system', null, null, null, '{}'::jsonb, false);
    perform private.bump('day_opened');
  end if;
  return did;
end $$;

create or replace function private.plan_day(p_service uuid default null, p_wash boolean default false)
returns table(booking_id uuid, "position" int, status text, checked_in boolean, chair_id uuid,
  expected_start timestamptz, start_low timestamptz, start_high timestamptz, expected_finish timestamptz,
  finish_high timestamptz, running_over boolean, at_risk boolean, after_closing boolean, finish_today_confirmed boolean)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
declare
  s public.salon_settings; cd record; n timestamptz := private.now_();
  frees timestamptz[] := '{}'; r record; i int; bi int; fa timestamptz; w numeric; tot int; p int := 0;
begin
  select * into s from public.salon_settings x where x.id = 1;
  select * into cd from private.current_day();

  for r in
    select ch.id as cid, ch.started_at as cst, ch.planned_minutes as cpm, ch.delay_minutes as cdm,
           bk.id as bid, bk.status as bst, bk.checked_in as bci, bk.finish_today_confirmed as bft
    from public.chairs ch
    left join public.bookings bk on bk.id = ch.current_booking_id and bk.salon_day_id = cd.id
    where ch.active order by ch.num
  loop
    if r.bid is not null then
      fa := r.cst + make_interval(mins => coalesce(r.cpm, 0) + coalesce(r.cdm, 0));
      running_over := fa < n;
      if fa < n + make_interval(mins => s.overrun_buffer_minutes) then fa := n + make_interval(mins => s.overrun_buffer_minutes); end if;
      booking_id := r.bid; "position" := null; status := r.bst; checked_in := r.bci; chair_id := r.cid;
      expected_start := r.cst; start_low := null; start_high := null;
      expected_finish := fa;
      finish_high := fa + make_interval(mins => private.band(extract(epoch from fa - n) / 60));
      at_risk := finish_high > cd.closes_at; after_closing := expected_finish > cd.closes_at;
      finish_today_confirmed := r.bft;
      return next;
    else
      fa := n;
    end if;
    frees := frees || fa;
  end loop;

  for r in
    select * from (
      select bk.id as bid, bk.status as bst, bk.checked_in as bci, bk.finish_today_confirmed as bft,
             sv.braid_minutes as bm, bk.needs_wash as bw, bk.queue_order as qo
      from public.bookings bk join public.services sv on sv.id = bk.service_id
      where bk.salon_day_id = cd.id and bk.status in ('booked','called')
      union all
      select null::uuid, 'new', false, false, sv.braid_minutes, coalesce(p_wash, false), 1e15
      from public.services sv where sv.id = p_service
    ) q order by q.qo
  loop
    p := p + 1;
    booking_id := r.bid; "position" := p; status := r.bst; checked_in := r.bci; chair_id := null;
    running_over := false; finish_today_confirmed := r.bft;
    if cardinality(frees) = 0 then
      expected_start := null; start_low := null; start_high := null; expected_finish := null;
      finish_high := 'infinity'; at_risk := true; after_closing := true;
      return next; continue;
    end if;
    bi := 1;
    for i in 2..cardinality(frees) loop
      if frees[i] < frees[bi] then bi := i; end if;
    end loop;
    expected_start := greatest(frees[bi], n);
    tot := r.bm + case when r.bw then s.prep_minutes else 0 end;
    expected_finish := expected_start + make_interval(mins => tot);
    w := extract(epoch from expected_start - n) / 60;
    start_low := greatest(n, expected_start - make_interval(mins => private.band(w)));
    start_high := expected_start + make_interval(mins => private.band(w));
    finish_high := expected_finish + make_interval(mins => private.band(extract(epoch from expected_finish - n) / 60));
    at_risk := finish_high > cd.closes_at; after_closing := expected_finish > cd.closes_at;
    frees[bi] := expected_finish;
    return next;
  end loop;
end $$;

create or replace function private.gen_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := 'CRW-';
    for i in 1..4 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from public.bookings b where b.code = c);
  end loop;
  return c;
end $$;

create or replace function private.validate(p jsonb, phone_required boolean) returns text
language plpgsql stable security definer set search_path = public as $$
declare pn text := trim(coalesce(p->>'parent_name','')); cn text := trim(coalesce(p->>'child_name',''));
  ph text := regexp_replace(coalesce(p->>'phone',''), '[\s-]', '', 'g'); ag text := trim(coalesce(p->>'child_age',''));
  wp text := nullif(trim(coalesce(p->>'waiting_pref','')), ''); nt text := coalesce(p->>'note',''); sid text := coalesce(p->>'service_id','');
begin
  if length(pn) < 1 or length(pn) > 40 then return 'Please enter the parent''s name (1 to 40 characters).'; end if;
  if length(cn) < 1 or length(cn) > 40 then return 'Please enter the child''s name (1 to 40 characters).'; end if;
  if ph = '' then
    if phone_required then return 'Please enter a 10-digit number starting with 0.'; end if;
  elsif ph !~ '^0[0-9]{9}$' then return 'Please enter a 10-digit number starting with 0.';
  end if;
  if ag !~ '^[0-9]{1,2}$' or ag::int < 3 or ag::int > 14 then return 'Please enter an age from 3 to 14.'; end if;
  if length(nt) > 120 then return 'Please keep the note to 120 characters or fewer.'; end if;
  if wp is not null and wp not in ('show','game','snack') then return 'Please choose a show, a game or a snack.'; end if;
  if sid !~ '^[0-9a-fA-F-]{36}$' or not exists (select 1 from public.services s where s.id = sid::uuid and s.active) then
    return 'Please choose a hairstyle.';
  end if;
  return null;
end $$;

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
  select * into s from public.salon_settings x where x.id = 1;
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

create or replace function private.require_pin(p text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p is null or not exists (select 1 from public.salon_settings s where s.id = 1 and s.pin = p) then
    raise exception 'Wrong PIN.' using errcode = '28P01';
  end if;
end $$;

revoke execute on function private.now_(), private.band(numeric), private.current_day(), private.next_opening(),
  private.fmt_opening(), private.bump(text), private.log_event(uuid,text,text,uuid,uuid,int,jsonb,boolean),
  private.ensure_day(), private.plan_day(uuid,boolean), private.gen_code(), private.validate(jsonb,boolean),
  private.create_booking(jsonb,text,text), private.require_pin(text)
from public, anon, authenticated;