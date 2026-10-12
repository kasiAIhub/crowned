import { CrownedHeader } from "@/components/crowned-header";

export function RouteShell({ title, copy }: { title: string; copy: string }) {
  return (
    <main className="min-h-screen bg-background">
      <CrownedHeader />
      <section className="mx-auto max-w-2xl px-5 pb-16 pt-14 sm:px-8">
        <p className="mb-4 text-[13px] font-bold uppercase text-deep-gold">Zama's Braids</p>
        <h1 className="font-display text-[32px] leading-[1.12] text-foreground">{title}</h1>
        <p className="mt-5 text-[17px] leading-7 text-muted-foreground">{copy}</p>
      </section>
    </main>
  );
}