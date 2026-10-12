alter table public.bookings
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_consent boolean not null default false,
  add column if not exists whatsapp_consent_at timestamptz,
  add column if not exists notify_status text not null default 'no_number' check (notify_status in ('no_number','sent','failed')),
  add column if not exists notify_error text,
  add column if not exists heads_up_sent_at timestamptz,
  add column if not exists ready_sent_at timestamptz;

alter table practice.bookings
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_consent boolean not null default false,
  add column if not exists whatsapp_consent_at timestamptz,
  add column if not exists notify_status text not null default 'no_number' check (notify_status in ('no_number','sent','failed')),
  add column if not exists notify_error text,
  add column if not exists heads_up_sent_at timestamptz,
  add column if not exists ready_sent_at timestamptz;

create or replace function public.record_whatsapp_consent(code text, phone text) returns boolean
language plpgsql volatile security definer set search_path = public, private as $$
declare d text; b public.bookings;
begin
  d := regexp_replace(coalesce(phone, ''), '\D', '', 'g');
  if d ~ '^27[678][0-9]{8}$' then d := '0' || substr(d, 3); end if;
  if d !~ '^0[678][0-9]{8}$' then return false; end if;
  select * into b from public.bookings bk where bk.code = upper(trim(record_whatsapp_consent.code)) for update;
  if b.id is null or b.status <> 'booked' or b.booked_at < private.now_() - interval '15 minutes' then return false; end if;
  if regexp_replace(coalesce(b.phone, ''), '\D', '', 'g') <> d then return false; end if;
  update public.bookings set whatsapp_number = '+27' || substr(d, 2), whatsapp_consent = true,
    whatsapp_consent_at = private.now_() where id = b.id;
  return true;
end $$;

create or replace function practice_api.record_whatsapp_consent(code text, phone text) returns boolean
language plpgsql volatile security definer set search_path = practice, practice_private as $$
declare d text; b practice.bookings;
begin
  d := regexp_replace(coalesce(phone, ''), '\D', '', 'g');
  if d ~ '^27[678][0-9]{8}$' then d := '0' || substr(d, 3); end if;
  if d !~ '^0[678][0-9]{8}$' then return false; end if;
  select * into b from practice.bookings bk where bk.code = upper(trim(record_whatsapp_consent.code)) for update;
  if b.id is null or b.status <> 'booked' or b.booked_at < practice_private.now_() - interval '15 minutes' then return false; end if;
  if regexp_replace(coalesce(b.phone, ''), '\D', '', 'g') <> d then return false; end if;
  update practice.bookings set whatsapp_number = '+27' || substr(d, 2), whatsapp_consent = true,
    whatsapp_consent_at = practice_private.now_() where id = b.id;
  return true;
end $$;

create or replace function public.practice_record_whatsapp_consent(code text, phone text) returns boolean
language sql volatile security definer set search_path = practice as $$ select practice_api.record_whatsapp_consent(code, phone) $$;

revoke all on function public.record_whatsapp_consent(text, text), public.practice_record_whatsapp_consent(text, text),
  practice_api.record_whatsapp_consent(text, text) from public;
grant execute on function public.record_whatsapp_consent(text, text), public.practice_record_whatsapp_consent(text, text) to anon, authenticated;