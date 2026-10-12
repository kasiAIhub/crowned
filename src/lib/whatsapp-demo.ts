import type { WaMap } from "@/lib/whatsapp";

/**
 * Practice salon only: made-up WhatsApp statuses so judges can see the feature.
 * Pure display — no network calls, never touches Twilio or the real salon.
 */
export function simulateDemoWa(line: { id: string }[], retried: Set<string>): WaMap {
  const map: WaMap = {};
  const at = new Date(0).toISOString();
  line.forEach((b, i) => {
    const sent = { has_number: true, status: "sent" as const, error: null, ready_sent_at: null, heads_up_sent_at: at };
    if (retried.has(b.id) || i % 3 === 0) map[b.id] = sent;
    else if (i % 3 === 1)
      map[b.id] = { ...sent, status: "failed", heads_up_sent_at: null, error: "This number hasn't joined the WhatsApp sandbox yet." };
    else map[b.id] = { ...sent, has_number: false, status: "no_number", heads_up_sent_at: null };
  });
  return map;
}
