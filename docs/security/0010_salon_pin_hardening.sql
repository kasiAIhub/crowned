-- 0010_salon_pin_hardening.sql - STAGED, NOT APPLIED. Complete executable migration (rev. 2).
-- Apply only together with /salon/setup (src/routes/salon.setup.tsx) and src/lib/pin-setup.functions.ts.
--
-- * No caller-supplied headers or JWT claims are trusted for identity or privilege.
-- * PIN guesses are only possible through public.salon_sign_in (counted, never rolled back).
--   public.salon_login(pin) keeps its signature but always returns false: it neither checks the PIN
--   (no uncounted oracle) nor mints sessions/devices.
-- * Real salon functions keep their bodies; each already calls private.require_pin(pin). Only that
--   helper is redefined: the argument must be a server-issued session token (64 hex chars, stored as
--   sha256, 12 h expiry, at most 20 live sessions).
-- * Lockout budgets (all serialized on the private.pin_global row, locked FOR UPDATE first):
--     unknown/malformed/revoked device  -> shared global budget 10 wrong / 15 min -> 15 min lock
--     trusted device                    -> own budget 5 / 15 min AND a shared trusted-pool budget
--                                          10 / 15 min across ALL devices -> 15 min device-path lock
--   So stockpiled device tokens cannot multiply guesses: worst case 10 (global) + 10 (pool) per 15 min.
-- * Device tokens are bounded: at most 3 new tokens per 24 h and at most 5 live devices (least
--   recently used evicted). When the issue budget is spent, sign-in still works but no new device
--   token is returned.
-- * Setup (one-time, 48 h, 5 wrong codes, service_role only) atomically stores the bcrypt hash,
--   disables the legacy PIN, revokes ALL sessions AND ALL devices, and resets every counter, so no
--   identity minted with the public legacy PIN survives.

create extension if not exists pgcrypto with schema extensions;

create table private.salon_secret (id int primary key default 1 check (id = 1), pin_hash text, set_at timestamptz);
insert into private.salon_secret (id) values (1);
create table private.salon_sessions (token_hash text primary key, created_at timestamptz not null default now(),
  expires_at timestamptz not null);
create table private.salon_devices (device_hash text primary key, fails int not null default 0,
  window_start timestamptz not null default now(), locked_until timestamptz,
  created_at timestamptz not null default now(), last_used_at timestamptz not null default now());
create table private.pin_global (id int primary key default 1 check (id = 1),
  fails int not null default 0, window_start timestamptz not null default now(), locked_until timestamptz,
  pool_fails int not null default 0, pool_window_start timestamptz not null default now(), pool_locked_until timestamptz,
  issued int not null default 0, issue_window_start timestamptz not null default now());
insert into private.pin_global (id) values (1);
create table private.pin_setup (id int primary key default 1 check (id = 1),
  expires_at timestamptz not null default now() + interval '48 hours', fails int not null default 0, used_at timestamptz);
insert into private.pin_setup (id) values (1);
revoke all on private.salon_secret, private.salon_sessions, private.salon_devices, private.pin_global, private.pin_setup
  from public, anon, authenticated;

-- Caller must already have validated p against '^[0-9]{4,6}$'. Returns false (never null).
create function private.pin_matches(p text) returns boolean language sql stable security definer
set search_path = public, private, extensions as $$
  select coalesce((
    select case when x.pin_hash is not null then extensions.crypt(p, x.pin_hash) = x.pin_hash
                else exists (select 1 from public.salon_settings s where s.id = 1 and s.pin = p and left(s.pin, 1) <> '!') end
    from private.salon_secret x where x.id = 1), false)
$$;
revoke all on function private.pin_matches(text) from public, anon, authenticated;

-- Returns {ok, token, device|null} or {ok:false, message}. Never raises, so failed tries are committed.
create function public.salon_sign_in(pin text, device text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, private, extensions as $$
declare
  n timestamptz := now(); w interval := interval '15 minutes';
  g private.pin_global; d private.salon_devices; dh text; ok boolean := false; tok text; dev text;
  locked_msg constant text := 'Too many tries. Please wait 15 minutes.';
begin
  -- 1. Serialize every attempt on one row (fixed lock order: global, then device) -> no lost counts.
  select * into g from private.pin_global where id = 1 for update;
  if not found then return jsonb_build_object('ok', false, 'message', locked_msg); end if;

  -- 2. Only a well-formed token that matches a live row is trusted; anything else is "unknown".
  if device is not null and device ~ '^[0-9a-f]{64}$' then
    dh := encode(extensions.digest(device, 'sha256'), 'hex');
    select * into d from private.salon_devices where device_hash = dh for update;
    if not found then dh := null; end if;
  end if;

  -- 3. Locks.
  if dh is not null then
    if d.locked_until > n or g.pool_locked_until > n then return jsonb_build_object('ok', false, 'message', locked_msg); end if;
  elsif g.locked_until > n then
    return jsonb_build_object('ok', false, 'message', locked_msg);
  end if;

  -- 4. Check (nested so crypt never sees a null/malformed value).
  if pin is not null and pin ~ '^[0-9]{4,6}$' then ok := private.pin_matches(pin); end if;

  if not ok then
    if dh is not null then
      update private.salon_devices set
        fails = case when window_start < n - w then 1 else fails + 1 end,
        window_start = case when window_start < n - w then n else window_start end
      where device_hash = dh;
      update private.salon_devices set locked_until = n + w, fails = 0 where device_hash = dh and fails >= 5;
      update private.pin_global set
        pool_fails = case when pool_window_start < n - w then 1 else pool_fails + 1 end,
        pool_window_start = case when pool_window_start < n - w then n else pool_window_start end
      where id = 1;
      update private.pin_global set pool_locked_until = n + w, pool_fails = 0 where id = 1 and pool_fails >= 10;
    else
      update private.pin_global set
        fails = case when window_start < n - w then 1 else fails + 1 end,
        window_start = case when window_start < n - w then n else window_start end
      where id = 1;
      update private.pin_global set locked_until = n + w, fails = 0 where id = 1 and fails >= 10;
    end if;
    return jsonb_build_object('ok', false, 'message', 'That PIN didn''t match. Please try again.');
  end if;

  -- 5. Success: session (capped at 20 live).
  delete from private.salon_sessions where expires_at < n;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.salon_sessions (token_hash, created_at, expires_at)
    values (encode(extensions.digest(tok, 'sha256'), 'hex'), n, n + interval '12 hours');
  delete from private.salon_sessions where token_hash in
    (select token_hash from private.salon_sessions order by created_at desc offset 20);

  -- 6. Device: reuse a trusted one, or issue a new one only within the bounded budget.
  if dh is not null then
    update private.salon_devices set fails = 0, locked_until = null, last_used_at = n where device_hash = dh;
    dev := device;
  else
    if g.issue_window_start < n - interval '24 hours' then
      update private.pin_global set issued = 0, issue_window_start = n where id = 1;
      g.issued := 0;
    end if;
    if g.issued < 3 then
      dev := encode(extensions.gen_random_bytes(32), 'hex');
      insert into private.salon_devices (device_hash, created_at, last_used_at)
        values (encode(extensions.digest(dev, 'sha256'), 'hex'), n, n);
      update private.pin_global set issued = issued + 1 where id = 1;
      delete from private.salon_devices where device_hash in
        (select device_hash from private.salon_devices order by last_used_at desc, created_at desc offset 5);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'token', tok, 'device', dev);
end $$;
revoke all on function public.salon_sign_in(text, text) from public;
grant execute on function public.salon_sign_in(text, text) to anon, authenticated;

-- Legacy boolean login: same signature, but it can no longer check a PIN or create any credential.
create or replace function public.salon_login(pin text) returns boolean
language sql stable security definer set search_path = public, private as $$ select false $$;

-- The single gate used by salon_list, salon_extras, salon_action, update_chair, update_service,
-- update_settings, reset_demo (bodies unchanged). Parameter name must stay "p".
create or replace function private.require_pin(p text) returns void
language plpgsql stable security definer set search_path = public, private, extensions as $$
begin
  if p is null or p !~ '^[0-9a-f]{64}$' or not exists (select 1 from private.salon_sessions
     where token_hash = encode(extensions.digest(p, 'sha256'), 'hex') and expires_at > now()) then
    raise exception 'Wrong PIN.';
  end if;
end $$;

create function public.admin_pin_setup_open() returns boolean language sql stable security definer
set search_path = public, private as $$
  select coalesce((select s.used_at is null and x.pin_hash is null and s.fails < 5 and now() < s.expires_at
    from private.pin_setup s, private.salon_secret x where s.id = 1 and x.id = 1), false)
$$;
create function public.admin_record_pin_setup_failure() returns void language sql volatile security definer
set search_path = public, private as $$ update private.pin_setup set fails = fails + 1 where id = 1 $$;
create function public.admin_complete_pin_setup(new_pin text) returns jsonb
language plpgsql volatile security definer set search_path = public, private, extensions as $$
declare s private.pin_setup; h text;
begin
  perform 1 from private.pin_global where id = 1 for update;   -- same lock order as salon_sign_in
  select * into s from private.pin_setup where id = 1 for update;
  select pin_hash into h from private.salon_secret where id = 1 for update;
  if s.id is null or s.used_at is not null or h is not null or s.fails >= 5 or now() >= s.expires_at then
    return jsonb_build_object('ok', false, 'message', 'This setup link is closed.'); end if;
  if new_pin is null or new_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok', false, 'message', 'The PIN must be 6 digits.'); end if;
  update private.salon_secret set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), set_at = now() where id = 1;
  update private.pin_setup set used_at = now() where id = 1;
  update public.salon_settings set pin = '!disabled' where id = 1;   -- legacy PIN dies in the same transaction
  delete from private.salon_sessions;                                 -- every pre-setup session revoked
  delete from private.salon_devices;                                  -- every pre-setup device token revoked
  update private.pin_global set fails = 0, window_start = now(), locked_until = null,
    pool_fails = 0, pool_window_start = now(), pool_locked_until = null,
    issued = 0, issue_window_start = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_pin_setup_open(), public.admin_record_pin_setup_failure(),
  public.admin_complete_pin_setup(text) from public, anon, authenticated;
grant execute on function public.admin_pin_setup_open(), public.admin_record_pin_setup_failure(),
  public.admin_complete_pin_setup(text) to service_role;

-- Rollback (legacy PIN works again only if setup has not run):
--   drop function public.admin_complete_pin_setup(text), public.admin_record_pin_setup_failure(),
--     public.admin_pin_setup_open(), public.salon_sign_in(text, text), private.pin_matches(text);
--   restore private.require_pin / public.salon_login from migration history; drop the private tables above.
--
-- Tests: see docs/security/0010_tests.sql (run on a throwaway database, never on the live backend).
