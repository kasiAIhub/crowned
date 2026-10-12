-- Isolated practice salon for the public /demo: separate tables, separate planner copy, no path to real bookings.
-- The practice schemas are not exposed and anon/authenticated get no USAGE on them; only public.practice_* wrappers reach them.
CREATE SCHEMA IF NOT EXISTS practice;
CREATE SCHEMA IF NOT EXISTS practice_private;
CREATE SCHEMA IF NOT EXISTS practice_api;
REVOKE ALL ON SCHEMA practice, practice_private, practice_api FROM PUBLIC, anon, authenticated;

CREATE TABLE practice.salon_settings (LIKE public.salon_settings INCLUDING ALL);
CREATE TABLE practice.services (LIKE public.services INCLUDING ALL);
CREATE TABLE practice.chairs (LIKE public.chairs INCLUDING ALL);
CREATE TABLE practice.salon_days (LIKE public.salon_days INCLUDING ALL);
CREATE TABLE practice.bookings (LIKE public.bookings INCLUDING ALL);
CREATE TABLE practice.salon_events (LIKE public.salon_events INCLUDING ALL);
GRANT ALL ON ALL TABLES IN SCHEMA practice TO service_role;

CREATE TABLE public.practice_live (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_event_type text,
  last_event_at timestamptz
);
GRANT SELECT ON public.practice_live TO anon, authenticated;
GRANT ALL ON public.practice_live TO service_role;
ALTER TABLE public.practice_live ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read practice live state" ON public.practice_live FOR SELECT TO anon, authenticated USING (id = 1);
ALTER PUBLICATION supabase_realtime ADD TABLE public.practice_live;

INSERT INTO practice.salon_settings (id, salon_name, default_open_time, default_closing_time, closing_buffer_minutes, active_chairs,
  prep_minutes, come_closer_minutes, almost_done_minutes, grace_minutes, estimate_band_percent, estimate_band_min_minutes,
  overrun_buffer_minutes, demo_mode, pin)
SELECT id, salon_name, default_open_time, default_closing_time, closing_buffer_minutes, active_chairs, prep_minutes,
  come_closer_minutes, almost_done_minutes, grace_minutes, estimate_band_percent, estimate_band_min_minutes,
  overrun_buffer_minutes, true, 'practice-unused' FROM public.salon_settings WHERE id = 1;
INSERT INTO practice.services SELECT * FROM public.services;
INSERT INTO practice.chairs (id, num, label, braider_name, active, delay_minutes)
SELECT id, num, label, braider_name, active, 0 FROM public.chairs;
INSERT INTO public.practice_live (id) VALUES (1);

DO $do$
DECLARE r record; d text;
BEGIN
  SET LOCAL check_function_bodies = off;
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'private')
       OR (n.nspname = 'public' AND p.proname IN ('book_place','booking_options','cancel_booking','find_booking','get_booking',
           'public_overview','reset_demo','salon_action','salon_extras','salon_list','salon_login','update_chair','update_service','update_settings'))
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'SET search_path TO ''public'', ''private''', 'SET search_path TO ''practice'', ''practice_private''');
    d := replace(d, 'SET search_path TO ''public''', 'SET search_path TO ''practice''');
    d := replace(d, 'public.', 'practice.');
    d := replace(d, 'private.', 'practice_private.');
    d := replace(d, 'practice.salon_state', 'public.practice_live');
    d := regexp_replace(d, 'CREATE OR REPLACE FUNCTION practice\.', 'CREATE OR REPLACE FUNCTION practice_api.');
    IF d LIKE '%FUNCTION practice_private.gen_code%' THEN d := replace(d, '''CRW-''', '''DEM-'''); END IF;
    EXECUTE d;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION practice_private.require_pin(p text) RETURNS void LANGUAGE sql STABLE SET search_path TO 'practice' AS $$ select $$;
CREATE OR REPLACE FUNCTION practice_api.salon_login(pin text) RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'practice' AS $$ select true $$;

DO $do$
DECLARE r record; calls text; body text;
BEGIN
  FOR r IN SELECT p.oid, p.proname, p.pronargs, p.proretset FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'practice_api'
  LOOP
    SELECT coalesce(string_agg('$' || g, ', ' ORDER BY g), '') INTO calls FROM generate_series(1, r.pronargs) g;
    IF r.proretset THEN body := format('select * from practice_api.%I(%s)', r.proname, calls);
    ELSE body := format('select practice_api.%I(%s)', r.proname, calls); END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY DEFINER SET search_path TO '''' AS %L',
      'practice_' || r.proname, pg_get_function_arguments(r.oid), pg_get_function_result(r.oid), body);
  END LOOP;
END $do$;

CREATE VIEW public.practice_services AS
  SELECT id, name, braid_minutes, price_rands, is_special, sort_order, active FROM practice.services WHERE active;
CREATE VIEW public.practice_salon_settings_public AS
  SELECT salon_name, default_open_time, default_closing_time, closing_buffer_minutes, active_chairs, prep_minutes,
    come_closer_minutes, almost_done_minutes, grace_minutes, estimate_band_percent, estimate_band_min_minutes,
    overrun_buffer_minutes, demo_mode FROM practice.salon_settings WHERE id = 1;
GRANT SELECT ON public.practice_services, public.practice_salon_settings_public TO anon, authenticated;
GRANT ALL ON public.practice_services, public.practice_salon_settings_public TO service_role;