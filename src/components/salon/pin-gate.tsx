import { useEffect, useState, type ReactNode } from "react";
import { Delete } from "lucide-react";
import { CrownedHeader } from "@/components/crowned-header";
import { getPin, salonLogin, setPin } from "@/lib/salon";
import { isPractice, PRACTICE_PIN } from "@/lib/practice";

export function PinGate({ children }: { children: (pin: string) => ReactNode }) {
  const [pin, setPinState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setPinState(getPin());
    setReady(true);
  }, []);

  const submit = (value: string) => {
    if (checking || value.length < 4) return;
    setChecking(true);
    salonLogin(value)
      .then((r) => {
        if (r.ok) { setPin(r.token); setPinState(r.token); }
        else { setError(r.message); setEntry(""); }
      })
      .catch(() => { setError("We couldn't check the PIN. Please try again."); setEntry(""); })
      .finally(() => setChecking(false));
  };
  useEffect(() => { if (entry.length === 6) submit(entry); }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;
  // The public demo frame runs on the isolated practice salon, which needs no PIN.
  if (isPractice()) return <>{children(PRACTICE_PIN)}</>;
  if (pin) return <>{children(pin)}</>;

  const press = (k: string) => { setError(""); if (entry.length < 6 && !checking) setEntry(entry + k); };
  return (
    <main className="min-h-screen bg-background">
      <CrownedHeader />
      <section className="mx-auto flex max-w-sm flex-col items-center px-5 pb-10 pt-4">
        <h1 className="font-display text-[32px]">Salon floor</h1>
        <p className="mt-2 text-stone">Enter your salon PIN.</p>
        <div className="my-6 flex gap-4" aria-label={`${entry.length} digits entered`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`size-4 rounded-full border-2 border-gold ${i < entry.length ? "bg-gold" : ""}`} />
          ))}
        </div>
        <p className="min-h-6 text-[15px] font-semibold text-clay" role="alert">{error}</p>
        <div className="mt-2 grid w-full grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <button key={k} onClick={() => press(k)} className="h-18 rounded-2xl border border-border bg-shell font-display text-[32px] font-semibold tabular-nums active:scale-[0.98] active:bg-muted">{k}</button>
          ))}
          <button onClick={() => submit(entry)} disabled={entry.length < 4 || checking} className="h-18 rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-40">Enter</button>
          <button onClick={() => press("0")} className="h-18 rounded-2xl border border-border bg-shell font-display text-[32px] font-semibold active:scale-[0.98] active:bg-muted">0</button>
          <button onClick={() => setEntry(entry.slice(0, -1))} aria-label="Delete" className="flex h-18 items-center justify-center rounded-2xl text-stone active:bg-muted"><Delete /></button>
        </div>
        
      </section>
    </main>
  );
}
