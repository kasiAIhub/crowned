import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StickyActionBar({ children, keyboardAware = false, className }: { children: ReactNode; keyboardAware?: boolean; className?: string }) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!keyboardAware) return;
    const update = () => {
      const active = document.activeElement;
      setEditing(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [keyboardAware]);

  return (
    <div className={cn("sticky-action-bar", editing && "sticky-action-bar--static", className)}>
      {children}
    </div>
  );
}