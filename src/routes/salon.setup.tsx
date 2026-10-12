import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrownedHeader } from "@/components/crowned-header";
import { Button } from "@/components/ui/button";
import { completeSetup, verifySetupCode } from "@/lib/pin-setup.functions";

export const Route = createFileRoute("/salon/setup")({
  head: () => ({
    meta: [
      { title: "Salon PIN setup · Crowned" },
      { name: "description", content: "Private one-time salon PIN setup for Zama's Braids." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Salon PIN setup · Crowned" },
      { property: "og:description", content: "Private one-time salon PIN setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

const field = "h-12 w-full rounded-[14px] border border-border bg-card px-4 text-[16px] tabular-nums";

function SetupPage() {
  const verify = useServerFn(verifySetupCode);
  const complete = useServerFn(completeSetup);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"code" | "pin" | "done">("code");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onCode = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try { const r = await verify({ data: { code } }); if (r.ok) setStep("pin"); else setMsg(r.message); }
    catch { setMsg("We couldn't check the code. Please try again."); } finally { setBusy(false); }
  };
  const onPin = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    if (!/^\d{6}$/.test(pin)) return setMsg("The PIN must be 6 digits.");
    if (pin !== pin2) return setMsg("The two PINs don't match.");
    setBusy(true);
    try {
      const r = await complete({ data: { code, pin } });
      if (r.ok) { setStep("done"); setCode(""); setPin(""); setPin2(""); } else setMsg(r.message);
    } catch { setMsg("Setup couldn't finish. Please try again."); } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-background">
      <CrownedHeader />
      <section className="mx-auto max-w-sm px-5 pb-10 pt-4">
        <h1 className="font-display text-[32px]">Salon PIN setup</h1>
        {step === "code" && (
          <form onSubmit={onCode} className="mt-4 space-y-3">
            <p className="text-stone">Enter the private setup code you saved in your project's secrets.</p>
            <input className={field} type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Setup code" />
            <Button type="submit" className="h-12 w-full" disabled={busy || !code}>Continue</Button>
          </form>
        )}
        {step === "pin" && (
          <form onSubmit={onPin} className="mt-4 space-y-3">
            <p className="text-stone">Choose a new 6-digit salon PIN. The old PIN stops working as soon as you save.</p>
            <input className={field} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="New PIN" />
            <input className={field} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} aria-label="Repeat new PIN" />
            <Button type="submit" className="h-12 w-full" disabled={busy}>Save PIN</Button>
          </form>
        )}
        {step === "done" && (
          <div className="mt-4 space-y-3">
            <p>Your new PIN is saved. This setup page is now closed.</p>
            <Link to="/salon" className="font-semibold underline">Open the salon floor</Link>
          </div>
        )}
        <p className="mt-3 min-h-6 text-[15px] font-semibold text-clay" role="alert">{msg}</p>
      </section>
    </main>
  );
}
