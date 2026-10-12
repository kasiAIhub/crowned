-- Throwaway-database tests for 0010_salon_pin_hardening.sql. NEVER run against the live backend.
-- Harness: minimal stand-ins for roles, private schema, salon_settings and one protected RPC.
\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role;
create schema private; create schema extensions;
create table public.salon_settings (id int primary key, pin text not null);
insert into public.salon_settings values (1, '1111');   -- stand-in legacy PIN (not the real one)
create function private.require_pin(p text) returns void language plpgsql as $$
begin if not exists (select 1 from public.salon_settings where pin = p) then raise exception 'Wrong PIN.'; end if; end $$;
create function public.salon_list(pin text) returns jsonb language plpgsql security definer set search_path = public, private as $$
begin perform private.require_pin(pin); return '{"rows":1}'; end $$;
\i docs/security/0010_hardening_under_test.sql

create function t(name text, cond boolean) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', name; end if; raise notice 'PASS: %', name; end $$;
create temp table v (k text primary key, val text);

-- A. Pre-setup compatibility
select t('A1 legacy boolean login never succeeds', public.salon_login('1111') = false);
select t('A2 legacy boolean login mints nothing', (select count(*) from private.salon_sessions) = 0 and (select count(*) from private.salon_devices) = 0);
insert into v select 'tok', public.salon_sign_in('1111')->>'token';
select t('A3 old PIN signs in before setup', (select val from v where k='tok') ~ '^[0-9a-f]{64}$');
select t('A4 session token opens protected RPC', public.salon_list((select val from v where k='tok')) is not null);
do $$ begin perform public.salon_list('1111'); raise exception 'FAIL: A5'; exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS: A5 raw PIN no longer opens protected RPC'; end $$;
do $$ begin perform public.salon_list(null); raise exception 'FAIL: A6'; exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS: A6 null / malformed token refused'; end $$;

-- B. Device issuance is bounded
select public.salon_sign_in('1111') from generate_series(1, 6);
select t('B1 at most 3 device tokens issued per 24h', (select issued from private.pin_global) = 3);
select t('B2 at most 5 live devices', (select count(*) from private.salon_devices) <= 5);
select t('B3 after budget, no device returned', public.salon_sign_in('1111')->'device' = 'null'::jsonb);
select t('B4 sessions capped at 20', (select count(*) from private.salon_sessions) <= 20);

-- C. Malformed input never raises
select t('C1 null pin', public.salon_sign_in(null, null)->>'ok' = 'false');
select t('C2 letters pin', public.salon_sign_in('abcd', 'zz')->>'ok' = 'false');
select t('C3 bogus 64-hex device treated as unknown', public.salon_sign_in('0000', repeat('a', 64))->>'ok' = 'false');
update private.pin_global set fails = 0, locked_until = null;

-- D. Stockpiled devices cannot multiply guesses (pool budget)
delete from private.salon_devices; update private.pin_global set issued = 0;
insert into v select 'd'||i, public.salon_sign_in('1111')->>'device' from generate_series(1,3) i;
select public.salon_sign_in('0000', (select val from v where k='d1')) from generate_series(1,4);
select public.salon_sign_in('0000', (select val from v where k='d2')) from generate_series(1,4);
select public.salon_sign_in('0000', (select val from v where k='d3')) from generate_series(1,2);
select t('D1 pool locks after 10 wrong across devices', (select pool_locked_until from private.pin_global) > now());
select t('D2 third device (fresh budget) is locked too', public.salon_sign_in('1111', (select val from v where k='d3'))->>'message' like 'Too many%');
select t('D3 unknown device still uses its own global budget', public.salon_sign_in('1111')->>'ok' = 'true');
update private.pin_global set pool_fails = 0, pool_locked_until = null;

-- E. Fresh/untrusted devices share the global lock
select public.salon_sign_in('0000', null) from generate_series(1,5);
select public.salon_sign_in('0000', md5(i::text)||md5(i::text)) from generate_series(1,5) i;  -- random-looking devices
select t('E1 global lock after 10 wrong from fresh devices', (select locked_until from private.pin_global) > now());
select t('E2 correct PIN refused on new device while locked', public.salon_sign_in('1111')->>'message' like 'Too many%');
select t('E3 trusted device not blocked by global lock', public.salon_sign_in('1111', (select val from v where k='d1'))->>'ok' = 'true');

-- F. Setup invalidates everything minted with the legacy PIN
select t('F1 anon cannot complete setup', not has_function_privilege('anon', 'public.admin_complete_pin_setup(text)', 'execute'));
select t('F2 authenticated cannot complete setup', not has_function_privilege('authenticated', 'public.admin_complete_pin_setup(text)', 'execute'));
select t('F3 setup rejects 4-digit PIN', public.admin_complete_pin_setup('1234')->>'ok' = 'false');
select t('F4 setup completes', public.admin_complete_pin_setup('246810')->>'ok' = 'true');
select t('F5 all sessions revoked', (select count(*) from private.salon_sessions) = 0);
select t('F6 all devices revoked', (select count(*) from private.salon_devices) = 0);
select t('F7 counters reset', (select locked_until is null and pool_locked_until is null and issued = 0 from private.pin_global));
select t('F8 legacy PIN disabled', (select pin from public.salon_settings) = '!disabled');
do $$ begin perform public.salon_list((select val from v where k='tok')); raise exception 'FAIL: F9'; exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS: F9 pre-setup session token refused'; end $$;
select t('F10 old PIN refused after setup', public.salon_sign_in('1111')->>'ok' = 'false');
select t('F11a old device token refused', public.salon_sign_in('0000', (select val from v where k='d1'))->>'ok' = 'false');
select t('F11b ...and counted on the shared global budget, not a device budget',
  (select fails = 2 and pool_fails = 0 from private.pin_global));
select t('F12 new PIN signs in', public.salon_sign_in('246810')->>'ok' = 'true');
select t('F13 setup is one-time', public.admin_complete_pin_setup('135790')->>'ok' = 'false');
select t('F14 setup window reported closed', public.admin_pin_setup_open() = false);
select t('F15 salon_login still false after setup', public.salon_login('246810') = false);
