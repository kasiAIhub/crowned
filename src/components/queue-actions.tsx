import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function QueueActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("queue-actions", className)}>{children}</div>;
}