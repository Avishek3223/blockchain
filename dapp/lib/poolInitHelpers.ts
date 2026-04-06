/**
 * Curve / unsalted pool id construction — matches scripts/initPool.ts conventions.
 */
import { encodeCurve, encodeKernelCompact, getPoolId, twosComplementInt8 } from "./nofeePool";

export const LOG_PRICE_TICK_X59 = 57643193118714n;
export const LOG_PRICE_SPACING_LARGE_X59 = 200n * LOG_PRICE_TICK_X59;

/** Python-style `%` for BigInt (always non-negative remainder). */
export function pyMod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

/** Pack unsalted pool id: hook=0, optional flag bits 0..2^20-1 for uniqueness, log offset int8. */
export function buildUnsaltedPoolId(logOffset: number, flagBits: number): bigint {
  const flags = BigInt(Math.max(0, Math.min(flagBits, 0xfffff)));
  return (1n << 188n) + (BigInt(twosComplementInt8(logOffset)) << 180n) + (flags << 160n);
}

export function defaultKernel(spacing: bigint): [bigint, bigint][] {
  return [
    [0n, 0n],
    [spacing, BigInt(2 ** 15)],
  ];
}

/** Build curve triple [lower, upper, currentOffsetted] from sqrt price X96 (Uniswap-style). */
export function buildCurveFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  logOffset: number,
  spacing: bigint,
): { curve: bigint[]; logPrice: bigint } {
  const logPrice = BigInt(
    Math.floor(Number(2n ** 60n) * Math.log(Number(sqrtPriceX96) / Number(2n ** 96n))),
  );
  const logPriceOffsetted = logPrice - BigInt(logOffset) + (1n << 63n);
  const lower = logPrice - pyMod(logPrice, spacing) - BigInt(logOffset) + (1n << 63n);
  const upper = lower + spacing;
  return { curve: [lower, upper, logPriceOffsetted], logPrice };
}

export function prepareInitializeArgs(params: {
  ownerAddress: string;
  token0: string;
  token1: string;
  poolGrowthPortion: bigint;
  sqrtPriceX96: bigint;
  logOffset: number;
  poolFlagBits: number;
  kernelSecondB: bigint;
  kernelSecondC: bigint;
  spacing: bigint;
}): {
  unsaltedPoolId: bigint;
  poolId: bigint;
  kernelCompact: bigint[];
  curveEncoded: bigint[];
  curve: bigint[];
  tag0: bigint;
  tag1: bigint;
} {
  const unsaltedPoolId = buildUnsaltedPoolId(params.logOffset, params.poolFlagBits);
  const poolId = getPoolId(params.ownerAddress, unsaltedPoolId);
  const spacing = params.spacing;
  const { curve } = buildCurveFromSqrtPriceX96(params.sqrtPriceX96, params.logOffset, spacing);
  const kernel: [bigint, bigint][] = [
    [0n, 0n],
    [params.kernelSecondB, params.kernelSecondC],
  ];
  const kernelCompact = encodeKernelCompact(kernel);
  const curveEncoded = encodeCurve(curve);
  const tag0 = BigInt(params.token0);
  const tag1 = BigInt(params.token1);
  return { unsaltedPoolId, poolId, kernelCompact, curveEncoded, curve, tag0, tag1 };
}
