import { useState } from "react";
import { Gauge, RotateCcw, TimerReset } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { act, resetDemo } from "@/lib/salon";

export function DemoControls({ pin, onChanged, compact = false }: { pin: string; onChanged?: () => void | Promise<void>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  const run = async (kind: "fast_forward" | "demo_late_day" | "reset") => {
    if (busy) return;
    setBusy(true);
    try {
      const result = kind === "reset" ? await resetDemo(pin) : await act(pin, kind);
      if (!result.ok) throw new Error(result.message ?? "That demo move didn't work.");
      toast.success(kind === "reset" ? "Demo Saturday is back at the seed." : kind === "fast_forward" ? "The demo moved forward 10 minutes." : "The demo is now a late day.");
      await onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That demo move didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" size={compact ? "sm" : "default"} className="bg-shell">
          <Gauge aria-hidden="true" /> Demo
        </Button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-lg bg-shell p-5">
        <DrawerTitle className="text-[22px]">Demo controls</DrawerTitle>
        <p className="mt-1 text-[15px] text-stone">These controls work only on the practice salon's sample Saturday.</p>
        <div className="mt-5 grid gap-2 pb-4">
          <Button size="lg" disabled={busy} onClick={() => void run("fast_forward")}><TimerReset />Fast-forward 10 min</Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => void run("demo_late_day")}>Try a late day</Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => void run("reset")}><RotateCcw />Reset demo Saturday</Button>
        </div>
        <p className="text-[13px] leading-5 text-stone">Reset when you finish. Real salon days are never changed by these controls.</p>
      </DrawerContent>
    </Drawer>
  );
}