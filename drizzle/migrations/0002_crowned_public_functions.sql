create or replace function public.public_overview() returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare cd record; s public.salon_settings; n timestamptz := private.now_(); is_open boolean; r record;
  best record; found_best boolean := false; anyfit boolean := false; allfit boolean := true; fits boolean; cnt int := 0;
begin
  select * into s from public.salon_settings x where x.id = 1;
  select * into cd from private.current_day();
  is_open := cd.opens_at <= n and n < cd.closes_at;
  for r in
    select sv.braid_minutes, pd.expected_start, pd.start_low, pd.start_high, pd.finish_high
    from public.services sv cross join lateral private.plan_day(sv.id, false) pd
    where sv.active and pd.booking_id is null order by sv.braid_minutes, sv.sort_order
  loop
    cnt := cnt + 1;
    fits := is_open and r.finish_high <= cd.closes_at - make_interval(mins => s.closing_buffer_minutes);
    if fits then anyfit := true; if not found_best then best := r; found_best := true; end if; else allfit := false; end if;
  end loop;
  return jsonb_build_object(
    'is_open', is_open, 'opens_at', cd.opens_at, 'closes_at', cd.closes_at,
    'next_opening', case when is_open then null else private.next_opening() end,
    'girls_in_chairs', (select count(*) from public.bookings b where b.salon_day_id = cd.id and b.status = 'in_chair'),
    'bookings_waiting', (select count(*) from public.bookings b where b.salon_day_id = cd.id and b.status in ('booked','called')),
    'next_new_booking', case when found_best then jsonb_build_object(
        'wait_minutes', round(extract(epoch from best.expected_start - n) / 60),
        'start_low', best.start_low, 'start_high', best.start_high) else null end,
    'any_style_fits', anyfit, 'all_styles_fit', anyfit and allfit,
    'version', (select version from public.salon_state where id = 1));
end $$;

create or replace function public.booking_options(needs_wash boolean default false)
returns table(service_id uuid, fits boolean, people_ahead int, start_low timestamptz, start_high timestamptz, finish_high timestamptz)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
declare cd record; s public.salon_settings; n timestamptz := private.now_(); op boolean; ahead int;
begin
  select * into s from public.salon_settings x where x.id = 1;
  select * into cd from private.current_day();
  op := cd.opens_at <= n and n < cd.closes_at;
  select count(*) into ahead from public.bookings b where b.salon_day_id = cd.id and b.status in ('booked','called');
  return query
    select sv.id, (op and pd.finish_high <= cd.closes_at - make_interval(mins => s.closing_buffer_minutes)),
           ahead, pd.start_low, pd.start_high, pd.finish_high
    from public.services sv cross join lateral private.plan_day(sv.id, coalesce(booking_options.needs_wash, false)) pd
    where sv.active and pd.booking_id is null order by sv.sort_order;
end $$;

create or replace function public.book_place(parent_name text, phone text, child_name text, child_age int, service_id uuid,
  needs_wash boolean default false, mani_pedi boolean default true, waiting_pref text default null, note text default null)
returns jsonb language sql volatile security definer set search_path = public, private as $$
  select private.create_booking(jsonb_build_object('parent_name', parent_name, 'phone', phone, 'child_name', child_name,
    'child_age', child_age, 'service_id', service_id, 'needs_wash', needs_wash, 'mani_pedi', mani_pedi,
    'waiting_pref', waiting_pref, 'note', note), 'online', 'parent')
$$;

create or replace function public.get_booking(code text) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
declare b public.bookings; sv public.services; s public.salon_settings; cd record; x record; br text;
begin
  select * into b from public.bookings bk where bk.code = upper(trim(get_booking.code));
  if b.id is null then return jsonb_build_object('found', false, 'message', 'We couldn''t find that booking reference.'); end if;
  select * into sv from public.services v where v.id = b.service_id;
  select * into s from public.salon_settings z where z.id = 1;
  select * into cd from private.current_day();
  if b.salon_day_id = cd.id then
    select * into x from private.plan_day() pd where pd.booking_id = b.id;
  end if;
  select split_part(ch.braider_name, ' ', 1) into br from public.chairs ch where ch.current_booking_id = b.id;
  return jsonb_build_object('found', true, 'code', b.code, 'parent_first_name', split_part(b.parent_name, ' ', 1),
    'child_name', b.child_name, 'child_age', b.child_age, 'style', sv.name,
    'minutes', sv.braid_minutes + case when b.needs_wash then s.prep_minutes else 0 end, 'price_rands', sv.price_rands,
    'needs_wash', b.needs_wash, 'mani_pedi', b.mani_pedi, 'waiting_pref', b.waiting_pref, 'status', b.status,
    'checked_in', b.checked_in, 'finish_today_confirmed', b.finish_today_confirmed, 'moved_note', b.moved_note,
    'booked_at', b.booked_at, 'called_at', b.called_at,
    'grace_ends_at', b.called_at + make_interval(mins => s.grace_minutes), 'braider_first_name', br,
    'position', x."position", 'start_low', x.start_low, 'start_high', x.start_high,
    'expected_start', x.expected_start, 'expected_finish', x.expected_finish, 'finish_high', x.finish_high,
    'at_risk', coalesce(x.at_risk, false), 'after_closing', coalesce(x.after_closing, false),
    'closes_at', cd.closes_at);
end $$;

create or replace function public.find_booking(phone text, child_name text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare c text;
begin
  select bk.code into c from public.bookings bk
  where regexp_replace(coalesce(bk.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(find_booking.phone, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(find_booking.phone, ''), '\D', '', 'g')) = 10
    and lower(bk.child_name) = lower(trim(find_booking.child_name))
    and bk.status in ('booked','called','in_chair','ready')
  order by bk.booked_at desc limit 1;
  if c is null then return jsonb_build_object('found', false, 'message', 'We couldn''t find an active booking for that number and name.'); end if;
  return jsonb_build_object('found', true, 'code', c);
end $$;

create or replace function public.cancel_booking(code text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
#variable_conflict use_column
declare b public.bookings;
begin
  select * into b from public.bookings bk where bk.code = upper(trim(cancel_booking.code)) for update;
  if b.id is null then return jsonb_build_object('ok', false, 'message', 'We couldn''t find that booking reference.'); end if;
  if b.status not in ('booked','called') then return jsonb_build_object('ok', false, 'message', 'This booking can no longer be cancelled online.'); end if;
  update public.bookings set status = 'cancelled' where id = b.id;
  perform private.log_event(b.salon_day_id, 'cancelled', 'parent', b.id, null, null, '{}'::jsonb, false);
  perform private.bump('cancelled');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.salon_login(pin text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.salon_settings s where s.id = 1 and s.pin = salon_login.pin)
$$;

create or replace function public.salon_list(pin text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare did uuid; d public.salon_days; s public.salon_settings; n timestamptz; res jsonb;
begin
  perform private.require_pin(pin);
  did := private.ensure_day();
  select * into d from public.salon_days sd where sd.id = did;
  select * into s from public.salon_settings x where x.id = 1;
  n := private.now_();
  with p as (select * from private.plan_day())
  select jsonb_build_object(
    'salon_day', jsonb_build_object('id', d.id, 'label_date', d.label_date, 'opens_at', d.opens_at, 'closes_at', d.closes_at,
       'is_open', d.opens_at <= n and n < d.closes_at, 'is_demo', d.is_demo),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'code', b.code, 'parent_name', b.parent_name, 'phone', b.phone, 'child_name', b.child_name,
        'child_age', b.child_age, 'service_id', b.service_id, 'style', sv.name,
        'minutes', sv.braid_minutes + case when b.needs_wash then s.prep_minutes else 0 end,
        'needs_wash', b.needs_wash, 'mani_pedi', b.mani_pedi, 'waiting_pref', b.waiting_pref, 'note', b.note,
        'status', b.status, 'checked_in', b.checked_in, 'finish_today_confirmed', b.finish_today_confirmed,
        'source', b.source, 'booked_by', b.booked_by, 'queue_order', b.queue_order, 'booked_at', b.booked_at,
        'called_at', b.called_at, 'grace_ends_at', b.called_at + make_interval(mins => s.grace_minutes),
        'estimated_start', b.estimated_start, 'started_at', b.started_at, 'finished_at', b.finished_at, 'chair_id', b.chair_id,
        'position', p."position", 'expected_start', p.expected_start, 'start_low', p.start_low, 'start_high', p.start_high,
        'expected_finish', p.expected_finish, 'finish_high', p.finish_high, 'running_over', coalesce(p.running_over, false),
        'at_risk', coalesce(p.at_risk, false), 'after_closing', coalesce(p.after_closing, false))
        order by case b.status when 'in_chair' then 0 when 'ready' then 2 else 1 end, p."position", b.queue_order)
      from public.bookings b join public.services sv on sv.id = b.service_id left join p on p.booking_id = b.id
      where b.salon_day_id = did and b.status not in ('collected','cancelled','no_show','moved_other_day')), '[]'::jsonb),
    'chairs', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'label', ch.label, 'braider_name', ch.braider_name,
        'current_booking_id', ch.current_booking_id, 'current_code', cb.code, 'current_child', cb.child_name,
        'started_at', ch.started_at, 'planned_minutes', ch.planned_minutes, 'delay_minutes', ch.delay_minutes) order by ch.num)
      from public.chairs ch left join public.bookings cb on cb.id = ch.current_booking_id where ch.active), '[]'::jsonb),
    'after_closing', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'parent_name', b.parent_name,
        'phone', b.phone, 'child_name', b.child_name, 'status', b.status, 'label_date', od.label_date, 'chair_id', b.chair_id) order by od.opens_at, b.queue_order)
      from public.bookings b join public.salon_days od on od.id = b.salon_day_id
      where b.salon_day_id <> did and b.status in ('booked','called','in_chair')), '[]'::jsonb),
    'counts', jsonb_build_object(
      'girls_done', (select count(*) from public.bookings b where b.salon_day_id = did and b.status in ('ready','collected')),
      'no_shows', (select count(*) from public.bookings b where b.salon_day_id = did and b.status = 'no_show'),
      'taps_today', (select count(*) from public.salon_events e where e.salon_day_id = did and e.is_tap),
      'at_risk', (select count(*) from p where p.booking_id is not null and p.at_risk),
      'refusals_today', (select count(*) from public.salon_events e where e.salon_day_id = did and e.type in ('refused_full','refused_closed'))),
    'version', (select version from public.salon_state where id = 1))
  into res;
  return res;
end $$;

create or replace function public.salon_action(pin text, action text, booking_id uuid default null, chair_id uuid default null, value jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private as $$
#variable_conflict use_column
declare act text := salon_action.action; bid uuid := salon_action.booking_id; cid uuid := salon_action.chair_id;
  val jsonb := salon_action.value; vtxt text := salon_action.value #>> '{}';
  did uuid; d public.salon_days; s public.salon_settings; n timestamptz; b public.bookings; ch public.chairs;
  x record; nb public.bookings; e public.salon_events; m int; ts timestamptz; res jsonb;
begin
  perform private.require_pin(pin);
  select * into s from public.salon_settings z where z.id = 1;
  n := private.now_();

  if act = 'new_booking' then
    if val is null or jsonb_typeof(val) <> 'object' or coalesce(val->>'source','') not in ('phone','whatsapp','walk_in') then
      return jsonb_build_object('ok', false, 'message', 'Please choose phone, WhatsApp or walk-in.');
    end if;
    res := private.create_booking(val, val->>'source', 'salon');
    return res || jsonb_build_object('ok', not coalesce((res->>'refused')::boolean, false));
  end if;

  did := private.ensure_day();
  select * into d from public.salon_days sd where sd.id = did;

  if act in ('call','arrived','start','finish','collected','no_show','move_up','move_down','finish_today','move_other_day') then
    select * into b from public.bookings bk where bk.id = bid for update;
    if b.id is null then return jsonb_build_object('ok', false, 'message', 'That booking was not found.'); end if;
  end if;

  if act = 'call' then
    if b.status <> 'booked' then return jsonb_build_object('ok', false, 'message', 'Only a booked family can be called.'); end if;
    if vtxt is not null then ts := vtxt::timestamptz;
    else select pd.expected_start into ts from private.plan_day() pd where pd.booking_id = b.id; end if;
    update public.bookings set status = 'called', called_at = n, estimated_start = ts where id = b.id;
    perform private.log_event(b.salon_day_id, 'called', 'salon', b.id, null, null, '{}'::jsonb, true);
    perform private.bump('called');

  elsif act = 'arrived' then
    update public.bookings set checked_in = true where id = b.id;
    perform private.log_event(b.salon_day_id, 'arrived', 'salon', b.id, null, null, '{}'::jsonb, true);
    perform private.bump('arrived');

  elsif act = 'start' then
    if b.status not in ('booked','called') then return jsonb_build_object('ok', false, 'message', 'This girl is not waiting in the line.'); end if;
    select * into ch from public.chairs c where c.id = cid for update;
    if ch.id is null or not ch.active then return jsonb_build_object('ok', false, 'message', 'That chair is not in use today.'); end if;
    if ch.current_booking_id is not null then return jsonb_build_object('ok', false, 'message', 'That chair is busy.'); end if;
    m := (select sv.braid_minutes from public.services sv where sv.id = b.service_id) + case when b.needs_wash then s.prep_minutes else 0 end;
    update public.bookings set status = 'in_chair', started_at = n, chair_id = ch.id, checked_in = true where id = b.id;
    update public.chairs set current_booking_id = b.id, started_at = n, planned_minutes = m, delay_minutes = 0 where id = ch.id;
    perform private.log_event(b.salon_day_id, 'started', 'salon', b.id, ch.id, m,
      jsonb_build_object('prev_status', b.status, 'prev_checked_in', b.checked_in), true);
    perform private.bump('started');

  elsif act = 'add_delay' then
    select * into ch from public.chairs c where c.id = cid for update;
    if ch.id is null or ch.current_booking_id is null then return jsonb_build_object('ok', false, 'message', 'That chair has nobody in it.'); end if;
    m := coalesce(vtxt::int, 15);
    if m <= 0 or m > 240 then return jsonb_build_object('ok', false, 'message', 'Please add between 1 and 240 minutes.'); end if;
    update public.chairs set delay_minutes = delay_minutes + m where id = ch.id;
    perform private.log_event(did, 'delayed', 'salon', ch.current_booking_id, ch.id, m, '{}'::jsonb, true);
    perform private.bump('delayed');

  elsif act = 'finish' then
    if b.status <> 'in_chair' then return jsonb_build_object('ok', false, 'message', 'This girl is not in a chair.'); end if;
    select * into ch from public.chairs c where c.current_booking_id = b.id for update;
    update public.bookings set status = 'ready', finished_at = n where id = b.id;
    if ch.id is not null then
      update public.chairs set current_booking_id = null, started_at = null, planned_minutes = null, delay_minutes = 0 where id = ch.id;
    end if;
    perform private.log_event(b.salon_day_id, 'finished', 'salon', b.id, ch.id, null,
      jsonb_build_object('chair_started_at', ch.started_at, 'planned_minutes', ch.planned_minutes, 'delay_minutes', ch.delay_minutes), true);
    perform private.bump('finished');

  elsif act = 'collected' then
    if b.status <> 'ready' then return jsonb_build_object('ok', false, 'message', 'This girl is not ready yet.'); end if;
    update public.bookings set status = 'collected', collected_at = n where id = b.id;
    perform private.log_event(b.salon_day_id, 'collected', 'salon', b.id, null, null, '{}'::jsonb, true);
    perform private.bump('collected');

  elsif act = 'no_show' then
    if b.status <> 'called' then return jsonb_build_object('ok', false, 'message', 'Only a called family can be marked as a no-show.'); end if;
    if b.called_at + make_interval(mins => s.grace_minutes) > n and coalesce(vtxt, '') <> 'confirm_early' then
      return jsonb_build_object('ok', false, 'message', 'The grace period has not ended yet.');
    end if;
    update public.bookings set status = 'no_show' where id = b.id;
    perform private.log_event(b.salon_day_id, 'no_show', 'salon', b.id, null, null, '{}'::jsonb, true);
    perform private.bump('no_show');

  elsif act in ('move_up','move_down') then
    if b.status not in ('booked','called') then return jsonb_build_object('ok', false, 'message', 'Only waiting families can be moved.'); end if;
    if act = 'move_up' then
      select * into nb from public.bookings o where o.salon_day_id = b.salon_day_id and o.status in ('booked','called')
        and o.queue_order < b.queue_order order by o.queue_order desc limit 1;
    else
      select * into nb from public.bookings o where o.salon_day_id = b.salon_day_id and o.status in ('booked','called')
        and o.queue_order > b.queue_order order by o.queue_order asc limit 1;
    end if;
    if nb.id is null then return jsonb_build_object('ok', false, 'message', 'Already at the end of the line.'); end if;
    update public.bookings set queue_order = nb.queue_order where id = b.id;
    update public.bookings set queue_order = b.queue_order where id = nb.id;
    perform private.log_event(b.salon_day_id, 'reordered', 'salon', b.id, null, null, jsonb_build_object('direction', act), true);
    perform private.bump('reordered');

  elsif act = 'finish_today' then
    update public.bookings set finish_today_confirmed = true where id = b.id;
    perform private.log_event(b.salon_day_id, 'finish_today', 'salon', b.id, null, null, jsonb_build_object('prev', b.finish_today_confirmed), true);
    perform private.bump('finish_today');

  elsif act = 'move_other_day' then
    if b.status not in ('booked','called','in_chair') then return jsonb_build_object('ok', false, 'message', 'This booking cannot be moved.'); end if;
    if b.status = 'in_chair' then
      update public.chairs set current_booking_id = null, started_at = null, planned_minutes = null, delay_minutes = 0 where current_booking_id = b.id;
    end if;
    update public.bookings set status = 'moved_other_day', moved_note = left(nullif(trim(coalesce(vtxt, '')), ''), 200) where id = b.id;
    perform private.log_event(b.salon_day_id, 'moved_other_day', 'salon', b.id, null, null, '{}'::jsonb, true);
    perform private.bump('moved_other_day');

  elsif act = 'undo' then
    select * into e from public.salon_events ev where ev.salon_day_id = did and ev.is_tap
      and ev.type in ('started','finished','delayed','no_show','finish_today')
      and ev.created_at >= n - interval '5 minutes' and not coalesce((ev.details->>'undone')::boolean, false)
    order by ev.created_at desc limit 1;
    if e.id is null then return jsonb_build_object('ok', false, 'message', 'There is nothing to undo from the last 5 minutes.'); end if;
    if e.type = 'started' then
      update public.bookings set status = e.details->>'prev_status', started_at = null, chair_id = null,
        checked_in = coalesce((e.details->>'prev_checked_in')::boolean, checked_in) where id = e.booking_id;
      update public.chairs set current_booking_id = null, started_at = null, planned_minutes = null, delay_minutes = 0
        where id = e.chair_id and current_booking_id = e.booking_id;
    elsif e.type = 'finished' then
      if exists (select 1 from public.chairs c where c.id = e.chair_id and c.current_booking_id is not null) then
        return jsonb_build_object('ok', false, 'message', 'That chair is already busy again.');
      end if;
      update public.bookings set status = 'in_chair', finished_at = null where id = e.booking_id;
      update public.chairs set current_booking_id = e.booking_id, started_at = (e.details->>'chair_started_at')::timestamptz,
        planned_minutes = (e.details->>'planned_minutes')::int, delay_minutes = coalesce((e.details->>'delay_minutes')::int, 0)
        where id = e.chair_id;
    elsif e.type = 'delayed' then
      update public.chairs set delay_minutes = greatest(0, delay_minutes - e.minutes) where id = e.chair_id;
    elsif e.type = 'no_show' then
      update public.bookings set status = 'called' where id = e.booking_id;
    elsif e.type = 'finish_today' then
      update public.bookings set finish_today_confirmed = coalesce((e.details->>'prev')::boolean, false) where id = e.booking_id;
    end if;
    update public.salon_events set details = details || '{"undone": true}'::jsonb where id = e.id;
    perform private.log_event(did, 'undo', 'salon', e.booking_id, e.chair_id, e.minutes, jsonb_build_object('undid', e.type), true);
    perform private.bump('undo');
    return jsonb_build_object('ok', true, 'undid', e.type);

  elsif act = 'set_today_closing' then
    ts := vtxt::timestamptz;
    if ts is null or ts <= d.opens_at then return jsonb_build_object('ok', false, 'message', 'Closing must be after opening.'); end if;
    update public.salon_days set closes_at = ts where id = did;
    perform private.log_event(did, 'closing_changed', 'salon', null, null, null, jsonb_build_object('from', d.closes_at, 'to', ts), true);
    perform private.bump('closing_changed');

  elsif act = 'fast_forward' then
    if not s.demo_mode then return jsonb_build_object('ok', false, 'message', 'Demo mode is off.'); end if;
    update public.chairs c set started_at = c.started_at - interval '10 minutes'
      where c.current_booking_id in (select bk.id from public.bookings bk where bk.salon_day_id = did and bk.status = 'in_chair');
    update public.bookings set started_at = started_at - interval '10 minutes', called_at = called_at - interval '10 minutes',
      booked_at = booked_at - interval '10 minutes'
      where salon_day_id = did and status not in ('collected','cancelled','no_show','moved_other_day');
    perform private.log_event(did, 'fast_forward', 'demo', null, null, 10, '{}'::jsonb, false);
    perform private.bump('fast_forward');

  elsif act = 'demo_late_day' then
    if not s.demo_mode then return jsonb_build_object('ok', false, 'message', 'Demo mode is off.'); end if;
    update public.salon_days set closes_at = n + interval '90 minutes' where id = did;
    perform private.log_event(did, 'demo_late_day', 'demo', null, null, 90, '{}'::jsonb, false);
    perform private.bump('demo_late_day');

  else
    return jsonb_build_object('ok', false, 'message', 'Unknown action.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.update_settings(pin text, settings jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare v text;
begin
  perform private.require_pin(pin);
  if settings ? 'closing_buffer_minutes' then
    v := settings->>'closing_buffer_minutes';
    if v is null or v !~ '^[0-9]{1,3}$' or v::int < 15 or v::int > 30 then
      return jsonb_build_object('ok', false, 'message', 'The closing buffer must be between 15 and 30 minutes.');
    end if;
  end if;
  update public.salon_settings set
    salon_name = coalesce(left(settings->>'salon_name', 60), salon_name),
    default_open_time = coalesce((settings->>'default_open_time')::time, default_open_time),
    default_closing_time = coalesce((settings->>'default_closing_time')::time, default_closing_time),
    closing_buffer_minutes = coalesce((settings->>'closing_buffer_minutes')::int, closing_buffer_minutes),
    active_chairs = coalesce((settings->>'active_chairs')::int, active_chairs),
    prep_minutes = coalesce((settings->>'prep_minutes')::int, prep_minutes),
    come_closer_minutes = coalesce((settings->>'come_closer_minutes')::int, come_closer_minutes),
    almost_done_minutes = coalesce((settings->>'almost_done_minutes')::int, almost_done_minutes),
    grace_minutes = coalesce((settings->>'grace_minutes')::int, grace_minutes),
    estimate_band_percent = coalesce((settings->>'estimate_band_percent')::int, estimate_band_percent),
    estimate_band_min_minutes = coalesce((settings->>'estimate_band_min_minutes')::int, estimate_band_min_minutes),
    overrun_buffer_minutes = coalesce((settings->>'overrun_buffer_minutes')::int, overrun_buffer_minutes),
    demo_mode = coalesce((settings->>'demo_mode')::boolean, demo_mode)
  where id = 1;
  perform private.bump('settings_changed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.update_service(pin text, id uuid, braid_minutes int, price_rands int) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.require_pin(pin);
  if update_service.braid_minutes is null or update_service.braid_minutes < 10 or update_service.braid_minutes > 480 then
    return jsonb_build_object('ok', false, 'message', 'Braiding time must be between 10 and 480 minutes.'); end if;
  if update_service.price_rands is null or update_service.price_rands < 0 or update_service.price_rands > 10000 then
    return jsonb_build_object('ok', false, 'message', 'Please enter a price from R0 to R10 000.'); end if;
  update public.services sv set braid_minutes = update_service.braid_minutes, price_rands = update_service.price_rands where sv.id = update_service.id;
  if not found then return jsonb_build_object('ok', false, 'message', 'That style was not found.'); end if;
  perform private.bump('service_changed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.update_chair(pin text, id uuid, braider_name text, active boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.require_pin(pin);
  if length(trim(coalesce(update_chair.braider_name, ''))) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'message', 'Please enter the braider''s name (1 to 40 characters).'); end if;
  if not update_chair.active and exists (select 1 from public.chairs c where c.id = update_chair.id and c.current_booking_id is not null) then
    return jsonb_build_object('ok', false, 'message', 'Finish the girl in this chair first.'); end if;
  update public.chairs c set braider_name = trim(update_chair.braider_name), active = coalesce(update_chair.active, c.active) where c.id = update_chair.id;
  if not found then return jsonb_build_object('ok', false, 'message', 'That chair was not found.'); end if;
  perform private.bump('chair_changed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reset_demo(pin text) returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare n timestamptz; o timestamptz; c timestamptz; did uuid; tz text := 'Africa/Johannesburg';
  s_corn uuid; s_box uuid; s_knot uuid; s_twist uuid; s_stitch uuid; c1 uuid; c2 uuid; c3 uuid; b1 uuid; b2 uuid; b3 uuid;
  types text[] := array['called','arrived','started','finished','collected'];
begin
  perform private.require_pin(pin);
  n := private.now_();
  update public.chairs set current_booking_id = null;
  delete from public.salon_events;
  delete from public.bookings;
  delete from public.salon_days;
  update public.chairs set braider_name = (array['Palesa','Nomsa','Refilwe','Dineo','Busi','Lindiwe','Mpho','Karabo','Sibongile','Tebogo'])[num],
    active = num <= 4, started_at = null, planned_minutes = null, delay_minutes = 0;

  o := date_trunc('hour', n - interval '3 hours');
  c := date_trunc('hour', n + interval '6 hours');
  if c < n + interval '6 hours' then c := c + interval '1 hour'; end if;
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

revoke execute on function public.public_overview(), public.booking_options(boolean),
  public.book_place(text,text,text,int,uuid,boolean,boolean,text,text), public.get_booking(text),
  public.find_booking(text,text), public.cancel_booking(text), public.salon_login(text), public.salon_list(text),
  public.salon_action(text,text,uuid,uuid,jsonb), public.update_settings(text,jsonb),
  public.update_service(text,uuid,int,int), public.update_chair(text,uuid,text,boolean), public.reset_demo(text) from public;
grant execute on function public.public_overview(), public.booking_options(boolean),
  public.book_place(text,text,text,int,uuid,boolean,boolean,text,text), public.get_booking(text),
  public.find_booking(text,text), public.cancel_booking(text), public.salon_login(text), public.salon_list(text),
  public.salon_action(text,text,uuid,uuid,jsonb), public.update_settings(text,jsonb),
  public.update_service(text,uuid,int,int), public.update_chair(text,uuid,text,boolean), public.reset_demo(text) to anon, authenticated, service_role;