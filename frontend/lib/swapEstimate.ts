/**
 * Spot-based swap estimates from packed curve + poolId (assignment UI — not a chain quoter).
 */

export function logOffsetFromPoolId(poolId: bigint): number {
  let logOffset = Number((poolId >> 180n) % 256n);
  if (logOffset >= 128) logOffset -= 256;
  return logOffset;
}

/** logPrice from curve[2] offsetted word and pool embedded log offset (see initPool). */
export function logPriceFromCurve(curve2: bigint, poolId: bigint): bigint {
  const lo = logOffsetFromPoolId(poolId);
  const logPriceOffsetted = curve2;
  return logPriceOffsetted + BigInt(lo) * (1n << 59n) - (1n << 63n);
}

/**
 * Token1 per token0 spot ratio from internal logPrice (matches scripts/initPool ln(sqrtP) scaling).
 */
export function priceRatioToken1PerToken0(logPrice: bigint): number {
  const lnSqrt = Number(logPrice) / Number(2n ** 60n);
  return Math.exp(2 * lnSqrt);
}

export function computeSwapLimit(
  curve: string[],
  poolId: bigint,
  slippageBps: bigint,
  zeroForOne: boolean,
): bigint {
  const lo = logOffsetFromPoolId(poolId);
  const currentOffsetted = BigInt(curve[2]);
  const delta = (currentOffsetted * slippageBps) / 10000n;
  const targetOffsetted = zeroForOne ? currentOffsetted - delta : currentOffsetted + delta;
  return targetOffsetted - (1n << 63n) + BigInt(lo) * (1n << 59n);
}

export type SwapEstimate = {
  /** Approximate output at spot (ignores liquidity depth). */
  estimatedOutWei: bigint;
  /** token1/token0 */
  spotPrice01: number;
  /** Distance between slippage-adjusted limit price and spot, in bps (rough). */
  impliedPriceImpactBps: number;
};

/**
 * Rough output: amountIn * price or amountIn / price. Fine for local demo; add quoter for production.
 */
export function estimateSwap(
  amountIn: bigint,
  zeroForOne: boolean,
  curve: string[],
  poolId: bigint,
  slippageBps: bigint,
): SwapEstimate | null {
  try {
    const logP = logPriceFromCurve(BigInt(curve[2]), poolId);
    const spotPrice01 = priceRatioToken1PerToken0(logP);
    const nIn = Number(amountIn);
    if (!Number.isFinite(nIn) || nIn < 0) return null;
    const est = zeroForOne ? nIn * spotPrice01 : nIn / spotPrice01;
    const estimatedOutWei = BigInt(Math.floor(Math.max(0, est)));

    const cur = BigInt(curve[2]);
    const delta = (cur * slippageBps) / 10000n;
    const impliedPriceImpactBps = cur === 0n ? 0 : Number((delta * 10000n) / cur);

    return {
      estimatedOutWei,
      spotPrice01,
      impliedPriceImpactBps: Math.min(9999, impliedPriceImpactBps),
    };
  } catch {
    return null;
  }
}
