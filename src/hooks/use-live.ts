import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { isPractice, stateTable } from "@/lib/practice";

export function useLive<T>(fetcher: () => Promise<T>) {
  const fetcherRef = useRef(fetcher);
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Crowned couldn't refresh right now."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const channel = supabase
      .channel(isPractice() ? "crowned-practice-state" : "crowned-salon-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: stateTable() },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}