import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

type Due = { booking_id: string; kind: "ready" | "heads_up"; name: string; to: string };

const TEXT = {
  ready: (n: string) => `Hi ${n}, it's your turn at Zama's Braids. Please come in now.`,
  heads_up: (n: string) => `Hi ${n}, you are 2 places away at Zama's Braids. Please start making your way.`,
};

function plainReason(status: number, body: string) {
  let code: number | undefined;
  let msg = "";
  try {
    const j = JSON.parse(body) as { code?: number; message?: string };
    code = j.code;
    msg = j.message ?? "";
  } catch {
    msg = body.slice(0, 160);
  }
  if (code === 63015 || /sandbox/i.test(msg)) return "This number hasn't joined the WhatsApp sandbox yet.";
  if (code === 21211 || code === 21614) return "WhatsApp says this number isn't valid.";
  if (code === 63016) return "Outside the 24-hour window - an approved template is needed.";
  if (status === 401 || status === 403) return "The Twilio connection was refused. Check it in Connectors.";
  if (status === 429) return "Twilio is busy right now. Try again in a minute.";
  return `WhatsApp couldn't send (${status}${code ? `, code ${code}` : ""}): ${msg}`.slice(0, 280);
}

/** Sends any due Ready / heads-up messages for the real salon. The salon session token authorises every step. */
export const sendDueWhatsApp = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (typeof input?.token !== "string" || !/^[0-9a-f]{64}$/.test(input.token)) throw new Error("Wrong PIN.");
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const db = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const rpc = db.rpc.bind(db) as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data: claimed, error } = await rpc("whatsapp_claim", { pin: data.token });
    if (error) throw new Error(error.message);
    const due = (claimed ?? []) as Due[];
    if (!due.length) return { sent: 0, failed: 0 };

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const twilioKey = process.env["TWILIO_API_KEY"];
    const from = process.env["TWILIO_WHATSAPP_FROM"];
    let sent = 0;
    let failed = 0;
    for (const d of due) {
      let ok = false;
      let reason: string | null = null;
      try {
        if (!lovableKey || !twilioKey) reason = "The Twilio connection isn't set up.";
        else if (!from) reason = "The WhatsApp sending number (TWILIO_WHATSAPP_FROM) isn't set yet.";
        else {
          const template = d.kind === "ready" ? process.env["TEMPLATE_SID_READY"] : process.env["TEMPLATE_SID_HEADSUP"];
          const body = new URLSearchParams({ To: `whatsapp:${d.to}`, From: from });
          if (template) {
            body.set("ContentSid", template);
            body.set("ContentVariables", JSON.stringify({ "1": d.name }));
          } else body.set("Body", TEXT[d.kind](d.name));
          const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": twilioKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          });
          const text = await res.text();
          if (res.ok) ok = true;
          else {
            console.error(`Twilio send failed [${res.status}]: ${text}`);
            reason = plainReason(res.status, text);
          }
        }
      } catch (e) {
        reason = `WhatsApp couldn't be reached: ${e instanceof Error ? e.message : "unknown error"}`;
      }
      await rpc("whatsapp_record", { pin: data.token, booking_id: d.booking_id, kind: d.kind, ok, error: reason });
      if (ok) sent++;
      else failed++;
    }
    return { sent, failed };
  });
