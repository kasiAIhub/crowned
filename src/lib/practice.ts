import { supabase } from "@/integrations/supabase/client";

/** Frames opened by /demo carry this window name, so the whole frame (and its navigations) stays on the practice salon. */
export const PRACTICE_FRAME = "crowned-practice";
/** Placeholder passed to practice RPCs; the practice salon never checks a PIN. Not a real salon PIN. */
export const PRACTICE_PIN = "practice";

export function isPractice() {
  if (typeof window === "undefined") return false;
  return window.name === PRACTICE_FRAME || window.location.pathname.startsWith("/demo");
}

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Calls the real RPC, or its isolated `practice_` twin when running inside the public demo. */
export function rpc(name: string, args?: Record<string, unknown>) {
  const client = supabase as unknown as RpcClient;
  return client.rpc(isPractice() ? `practice_${name}` : name, args);
}

export const servicesTable = () => (isPractice() ? "practice_services" : "services") as "services";
export const settingsView = () => (isPractice() ? "practice_salon_settings_public" : "salon_settings_public") as "salon_settings_public";
export const stateTable = () => (isPractice() ? "practice_live" : "salon_state") as "salon_state";
