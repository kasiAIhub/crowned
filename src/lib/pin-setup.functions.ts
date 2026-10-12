import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// The setup capability is SALON_SETUP_CODE, a server-only secret the PIN owner types into the
// secure secrets form. It never reaches the browser bundle, a URL, or chat. The database side
// allows only 5 wrong codes, a 48-hour window and one successful use; those functions are
// executable only by the service role (GRANT-level).

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

type Admin = { rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

async function checkCode(code: string): Promise<{ ok: true; admin: Admin } | { ok: false; message: string }> {
  const expected = process.env["SALON_SETUP_CODE"];
  if (!expected || expected.length < 24) return { ok: false, message: "Setup isn't available." };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;
  const open = await admin.rpc("admin_pin_setup_open");
  if (open.error || open.data !== true) return { ok: false, message: "This setup is closed." };
  if (!sameSecret(code, expected)) {
    await admin.rpc("admin_record_pin_setup_failure");
    return { ok: false, message: "That setup code didn't match." };
  }
  return { ok: true, admin };
}

export const verifySetupCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const r = await checkCode(data.code);
    return r.ok ? { ok: true as const } : { ok: false as const, message: r.message };
  });

export const completeSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(1).max(200), pin: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const r = await checkCode(data.code);
    if (!r.ok) return { ok: false as const, message: r.message };
    const { data: res, error } = await r.admin.rpc("admin_complete_pin_setup", { new_pin: data.pin });
    if (error) return { ok: false as const, message: "Setup couldn't finish. Please try again." };
    const out = res as { ok: boolean; message?: string };
    return out.ok ? { ok: true as const } : { ok: false as const, message: out.message ?? "Setup couldn't finish." };
  });
