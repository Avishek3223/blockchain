"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiquidityPosition } from "@/lib/types";

const POS_KEY = "nofeeswap-lp-position-v1";

export function useLiquidityPosition(activePoolId: string | undefined) {
  const [position, setPosition] = useState<LiquidityPosition | null>(null);

  useEffect(() => {
    if (!activePoolId) {
      setPosition(null);
      return;
    }
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const all = JSON.parse(raw) as Record<string, LiquidityPosition>;
      const p = all[activePoolId];
      if (p) setPosition(p);
      else setPosition(null);
    } catch {
      setPosition(null);
    }
  }, [activePoolId]);

  const savePosition = useCallback((poolId: string, p: LiquidityPosition) => {
    setPosition(p);
    try {
      const raw = localStorage.getItem(POS_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, LiquidityPosition>) : {};
      all[poolId] = p;
      localStorage.setItem(POS_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, []);

  const clearPosition = useCallback((poolId: string) => {
    setPosition(null);
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const all = JSON.parse(raw) as Record<string, LiquidityPosition>;
      delete all[poolId];
      localStorage.setItem(POS_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, []);

  return { position, savePosition, clearPosition };
}
