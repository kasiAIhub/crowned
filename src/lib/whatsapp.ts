import { supabase } from "@/integrations/supabase/client";

export type WaInfo = {
  has_number: boolean;
  status: "no_number" | "sent" | "failed";
  error: string | null;
  ready_sent_at: string | null;
  heads_up_sent_at: string | null;
};
export type WaMap = Record<string, WaInfo>;

type Rpc = (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const call: Rpc = (n, a) => (supabase.rpc as unknown as Rpc).call(supabase, n, a);

/** Real salon only. Reads each booking's WhatsApp state; the session token authorises it. */
export async function getWhatsAppStatus(pin: string): Promise<WaMap> {
  const { data, error } = await call("whatsapp_status", { pin });
  if (error) throw new Error(error.message);
  return (data ?? {}) as WaMap;
}

/** Re-opens a failed message so the next refresh sends it again. Never re-sends one already sent. */
export async function retryWhatsApp(pin: string, bookingId: string): Promise<boolean> {
  const { data, error } = await call("whatsapp_retry", { pin, booking_id: bookingId });
  return !error && data === true;
}
