alter table public.bookings
  add column if not exists ready_attempt_at timestamptz,
  add column if not exists heads_up_attempt_at timestamptz;

create or replace function public.whatsapp_claim(pin text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare did uuid; res jsonb;
begin
  perform private.require_pin(pin);
  did := private.ensure_day();
  with p as (select * from private.plan_day()),
  due as (
    select b.id, 'ready'::text as kind from public.bookings b
     where b.salon_day_id = did and b.status = 'called' and b.whatsapp_consent and b.whatsapp_number is not null
       and b.ready_sent_at is null and b.ready_attempt_at is null
    union all
    select b.id, 'heads_up' from public.bookings b join p on p.booking_id = b.id
     where b.salon_day_id = did and b.status = 'booked' and p."position" = 2 and b.whatsapp_consent
       and b.whatsapp_number is not null and b.heads_up_sent_at is null and b.heads_up_attempt_at is null
       and b.ready_sent_at is null and b.ready_attempt_at is null
  ),
  upd as (
    update public.bookings b set
      ready_attempt_at = case when d.kind = 'ready' then now() else b.ready_attempt_at end,
      heads_up_attempt_at = case when d.kind = 'heads_up' then now() else b.heads_up_attempt_at end
    from due d where b.id = d.id
      and (case when d.kind = 'ready' then b.ready_attempt_at is null else b.heads_up_attempt_at is null end)
    returning b.id, d.kind, b.parent_name, b.whatsapp_number
  )
  select coalesce(jsonb_agg(jsonb_build_object('booking_id', id, 'kind', kind,
           'name', split_part(trim(parent_name), ' ', 1), 'to', whatsapp_number)), '[]'::jsonb)
    into res from upd;
  return res;
end $$;

create or replace function public.whatsapp_record(pin text, booking_id uuid, kind text, ok boolean, error text default null)
returns boolean language plpgsql security definer set search_path = public, private as $$
begin
  perform private.require_pin(pin);
  if kind not in ('ready','heads_up') then return false; end if;
  update public.bookings b set
    ready_sent_at = case when ok and kind = 'ready' then now() else b.ready_sent_at end,
    heads_up_sent_at = case when ok and kind = 'heads_up' then now() else b.heads_up_sent_at end,
    notify_status = case when ok then 'sent' else 'failed' end,
    notify_error = case when ok then null else left(coalesce(error, 'Unknown error'), 300) end
  where b.id = whatsapp_record.booking_id;
  return found;
end $$;

create or replace function public.whatsapp_retry(pin text, booking_id uuid)
returns boolean language plpgsql security definer set search_path = public, private as $$
begin
  perform private.require_pin(pin);
  update public.bookings b set
    ready_attempt_at = case when b.ready_sent_at is null then null else b.ready_attempt_at end,
    heads_up_attempt_at = case when b.heads_up_sent_at is null and b.status = 'booked' then null else b.heads_up_attempt_at end
  where b.id = whatsapp_retry.booking_id and b.notify_status = 'failed';
  return found;
end $$;

create or replace function public.whatsapp_status(pin text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare did uuid;
begin
  perform private.require_pin(pin);
  did := private.ensure_day();
  return coalesce((select jsonb_object_agg(b.id, jsonb_build_object(
      'has_number', b.whatsapp_consent and b.whatsapp_number is not null,
      'status', b.notify_status, 'error', b.notify_error,
      'ready_sent_at', b.ready_sent_at, 'heads_up_sent_at', b.heads_up_sent_at))
    from public.bookings b where b.salon_day_id = did), '{}'::jsonb);
end $$;

revoke all on function public.whatsapp_claim(text), public.whatsapp_record(text, uuid, text, boolean, text),
  public.whatsapp_retry(text, uuid), public.whatsapp_status(text) from public;
grant execute on function public.whatsapp_claim(text), public.whatsapp_record(text, uuid, text, boolean, text),
  public.whatsapp_retry(text, uuid), public.whatsapp_status(text) to anon, authenticated;