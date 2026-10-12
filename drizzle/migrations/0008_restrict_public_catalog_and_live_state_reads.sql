DROP POLICY IF EXISTS "Anyone can read salon state" ON public.salon_state;
CREATE POLICY "Public can read singleton live state"
ON public.salon_state
FOR SELECT
TO anon, authenticated
USING (id = 1);

DROP POLICY IF EXISTS "Anyone can read services" ON public.services;
CREATE POLICY "Public can read active services"
ON public.services
FOR SELECT
TO anon, authenticated
USING (active = true);