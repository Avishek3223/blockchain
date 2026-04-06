"use client";

import { useCallback, useEffect, useState } from "react";
import type { PoolJson } from "@/lib/types";

const POOL_KEY = "nofeeswap-active-pool-v1";

export function useActivePool(fetchedPool: PoolJson | null) {
  const [pool, setPool] = useState<PoolJson | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POOL_KEY);
      if (raw) {
        setPool(JSON.parse(raw) as PoolJson);
        setHydrated(true);
        return;
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (pool === null && fetchedPool) {
      setPool(fetchedPool);
    }
  }, [hydrated, fetchedPool, pool]);

  const savePool = useCallback((p: PoolJson) => {
    setPool(p);
    try {
      localStorage.setItem(POOL_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const resetToDeployed = useCallback(() => {
    try {
      localStorage.removeItem(POOL_KEY);
    } catch {
      /* ignore */
    }
    setPool(fetchedPool ?? null);
  }, [fetchedPool]);

  return { pool, savePool, resetToDeployed, hydrated };
}
